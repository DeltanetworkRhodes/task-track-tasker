import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

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

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get user's organization
    const userId = claimsData.claims.sub;
    const { data: profile } = await adminClient
      .from("profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .single();
    const orgId = profile?.organization_id;

    // Get org-specific settings for all email config
    let orgSettingsQuery = adminClient.from("org_settings").select("setting_key, setting_value");
    if (orgId) orgSettingsQuery = orgSettingsQuery.eq("organization_id", orgId);
    const { data: orgSettings } = await orgSettingsQuery;
    const orgSettingsMap: Record<string, string> = {};
    (orgSettings || []).forEach((s: any) => { orgSettingsMap[s.setting_key] = s.setting_value; });

    const emailFrom = orgSettingsMap["email_from"] || "noreply@deltanetwork.gr";
    const emailReplyTo = orgSettingsMap["email_reply_to"] || "info@deltanetwork.gr";
    const emailSenderName = orgSettingsMap["email_sender_name"] || "DeltaNet FTTH";
    const emailSignature = orgSettingsMap["email_signature"] || DEFAULT_SIGNATURE;

    const toEmails = orgSettingsMap["report_to_emails"] || emailReplyTo;
    const ccEmails = orgSettingsMap["report_cc_emails"] || "";

    const statusLabel = status_type === "BLOCKER" ? "BLOCKER" : "ΑΠΑΙΤΕΙΤΑΙ ΕΝΕΡΓΕΙΑ";
    const subject = `[${statusLabel}] Αναφορά Αυτοψίας ΟΤΕ - SR: ${survey.sr_id}`;

    const headerBg = status_type === "BLOCKER" ? "linear-gradient(135deg, #dc2626, #991b1b)" : "linear-gradient(135deg, #ea580c, #c2410c)";
    const accentColor = status_type === "BLOCKER" ? "#dc2626" : "#ea580c";
    const headerIcon = status_type === "BLOCKER" ? "🚫" : "⚠️";

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f7fa;">
        <div style="background: ${headerBg}; color: white; padding: 24px 28px; border-radius: 12px 12px 0 0;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">${headerIcon}</span>
            <div>
              <h2 style="margin: 0; font-size: 18px; font-weight: 700; letter-spacing: 0.3px;">${escapeHtml(statusLabel)}</h2>
              <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">SR: ${escapeHtml(survey.sr_id)} · ${escapeHtml(survey.area)}</p>
            </div>
          </div>
        </div>
        
        <div style="background: white; border: 1px solid #d1d9e0; border-top: none; padding: 28px; border-radius: 0 0 12px 12px;">
          <p style="color: #4a5568; font-size: 14px; line-height: 1.7; margin: 0 0 8px;">Αξιότιμοι συνεργάτες,</p>
          <p style="color: #4a5568; font-size: 14px; line-height: 1.7; margin: 0 0 20px;">
            Σε συνέχεια των εργασιών, θα θέλαμε να σας ενημερώσουμε σχετικά με το <strong style="color: #1a2332;">SR: ${escapeHtml(survey.sr_id)}</strong>.
            Κατά την αυτοψία καταγράφηκε η παρακάτω αναφορά / εκκρεμότητα:
          </p>
          
          <div style="background: #fef2f2; border-left: 4px solid ${accentColor}; padding: 14px 18px; margin: 20px 0; border-radius: 0 8px 8px 0;">
            <p style="font-weight: 700; color: #1a2332; font-size: 13px; margin: 0 0 6px;">📌 Σχόλιο / Περιγραφή Εκκρεμότητας:</p>
            <p style="color: #4a5568; font-size: 14px; margin: 0; line-height: 1.6;">${escapeHtml(survey.comments || "(Δεν έχει καταγραφεί συγκεκριμένο σχόλιο)")}</p>
          </div>
          
          <p style="color: #4a5568; font-size: 14px; line-height: 1.7;">Παρακαλούμε όπως εξετάσετε το θέμα.</p>
          
          <p style="color: #4a5568; font-size: 14px; line-height: 1.7; margin-top: 28px;">Με εκτίμηση,</p>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          
          <div style="font-size: 12px; color: #718096;">
            <img src="https://task-track-tasker.lovable.app/assets/delta-network-logo.png" alt="Delta Network Inc." style="width: 180px; margin-bottom: 12px; display: block;" />
            <p style="margin: 0; font-weight: 700; color: #1a2332;">Κούλλαρος Μιχαήλ Άγγελος</p>
            <p style="margin: 2px 0; color: #4a5568;">Technical Operations Manager | FTTx Projects | South Aegean</p>
            <p style="margin: 2px 0;">M: +30 690 710 5282 | E: <a href="mailto:info@deltanetwork.gr" style="color: #1a9a8a; text-decoration: none;">info@deltanetwork.gr</a></p>
          </div>
        </div>
      </div>
    `;

    const emailPayload: any = {
      from: `DeltaNet FTTH <${emailFrom}>`,
      to: toEmails.split(",").map((e: string) => e.trim()),
      reply_to: emailReplyTo,
      subject,
      html: emailHtml,
    };

    if (ccEmails.trim()) {
      emailPayload.cc = ccEmails.split(",").map((e: string) => e.trim());
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend error:", resendData);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: resendData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await adminClient
      .from("surveys")
      .update({ email_sent: true, status: status_type })
      .eq("id", survey_id);

    console.log("Email sent successfully for SR:", survey.sr_id);

    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id }),
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
