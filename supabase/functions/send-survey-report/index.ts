import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendGmail } from "../_shared/gmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const GMAIL_SENDER = "info@deltanetwork.gr";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { survey_id, status_type } = await req.json();

    if (!survey_id || !status_type) {
      return new Response(JSON.stringify({ error: "Missing survey_id or status_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get survey details
    const { data: survey, error: surveyError } = await supabase
      .from("surveys")
      .select("*")
      .eq("id", survey_id)
      .single();

    if (surveyError || !survey) {
      return new Response(JSON.stringify({ error: "Survey not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get email settings using service role
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: settings } = await adminClient
      .from("email_settings")
      .select("*");

    const settingsMap: Record<string, string> = {};
    (settings || []).forEach((s: any) => {
      settingsMap[s.setting_key] = s.setting_value;
    });

    const toEmails = settingsMap["report_to_emails"] || "info@deltanetwork.gr";
    const ccEmails = settingsMap["report_cc_emails"] || "";

    const statusLabel = status_type === "BLOCKER" ? "BLOCKER" : "ΑΠΑΙΤΕΙΤΑΙ ΕΝΕΡΓΕΙΑ";
    const subject = `[${statusLabel}] Αναφορά Αυτοψίας ΟΤΕ - SR: ${survey.sr_id}`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: ${status_type === "BLOCKER" ? "#dc2626" : "#ea580c"}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">${escapeHtml(statusLabel)} — SR: ${escapeHtml(survey.sr_id)}</h2>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Περιοχή: ${escapeHtml(survey.area)}</p>
        </div>
        
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            Αξιότιμοι συνεργάτες,
          </p>
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            Σε συνέχεια των εργασιών, θα θέλαμε να σας ενημερώσουμε σχετικά με το <strong>SR: ${escapeHtml(survey.sr_id)}</strong>.
          </p>
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            Κατά την αυτοψία καταγράφηκε η παρακάτω αναφορά / εκκρεμότητα:
          </p>
          
          <div style="background: #f9fafb; border-left: 4px solid ${status_type === "BLOCKER" ? "#dc2626" : "#ea580c"}; padding: 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
            <p style="font-weight: bold; color: #1f2937; font-size: 13px; margin: 0 0 8px;">📌 Σχόλιο / Περιγραφή Εκκρεμότητας:</p>
            <p style="color: #4b5563; font-size: 14px; margin: 0;">${escapeHtml(survey.comments || "(Δεν έχει καταγραφεί συγκεκριμένο σχόλιο)")}</p>
          </div>
          
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            Παρακαλούμε όπως εξετάσετε το θέμα.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          
          <div style="font-size: 12px; color: #6b7280;">
            <p style="margin: 0;"><strong>Κούλλαρος Μιχαήλ Άγγελος</strong></p>
            <p style="margin: 2px 0;">Technical Operations Manager | FTTx Projects | South Aegean</p>
            <p style="margin: 2px 0;">M: +30 690 710 5282 | E: info@deltanetwork.gr</p>
          </div>
        </div>
      </div>
    `;

    const sendOptions: any = {
      to: toEmails.split(",").map((e: string) => e.trim()),
      subject,
      html: emailHtml,
    };

    if (ccEmails.trim()) {
      sendOptions.cc = ccEmails.split(",").map((e: string) => e.trim());
    }

    const result = await sendGmail(GMAIL_SENDER, sendOptions);

    // Mark email as sent
    await adminClient
      .from("surveys")
      .update({ email_sent: true, status: status_type })
      .eq("id", survey_id);

    console.log("Email sent successfully for SR:", survey.sr_id);

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
