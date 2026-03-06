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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { assignment_id, sr_id, area, customer_name, address, cancellation_reason } = await req.json();

    if (!assignment_id || !sr_id || !cancellation_reason) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get user's org
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name, phone, organization_id")
      .eq("user_id", user.id)
      .single();

    const techName = profile?.full_name || user.email || "Τεχνικός";
    const techPhone = profile?.phone || "";
    const orgId = profile?.organization_id;

    // Get org-specific settings
    let settingsQuery = adminClient.from("email_settings").select("*");
    if (orgId) settingsQuery = settingsQuery.eq("organization_id", orgId);
    const { data: settings } = await settingsQuery;
    const settingsMap: Record<string, string> = {};
    (settings || []).forEach((s: any) => { settingsMap[s.setting_key] = s.setting_value; });

    let orgSettingsQuery = adminClient.from("org_settings").select("setting_key, setting_value");
    if (orgId) orgSettingsQuery = orgSettingsQuery.eq("organization_id", orgId);
    const { data: orgSettings } = await orgSettingsQuery;
    const orgSettingsMap: Record<string, string> = {};
    (orgSettings || []).forEach((s: any) => { orgSettingsMap[s.setting_key] = s.setting_value; });

    const emailFrom = orgSettingsMap["email_from"] || "noreply@deltanetwork.gr";
    const emailReplyTo = orgSettingsMap["email_reply_to"] || "info@deltanetwork.gr";

    const toEmails = settingsMap["report_to_emails"] || emailReplyTo;
    const ccEmails = settingsMap["report_cc_emails"] || "";

    const subject = `[ΑΚΥΡΩΣΗ] SR: ${sr_id} — ${area || ""}`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #dc2626; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">❌ ΑΚΥΡΩΣΗ — SR: ${escapeHtml(sr_id)}</h2>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Περιοχή: ${escapeHtml(area || "—")}</p>
        </div>
        
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">Αξιότιμοι συνεργάτες,</p>
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            Σας ενημερώνουμε ότι ο τεχνικός <strong>${escapeHtml(techName)}</strong> ακύρωσε το <strong>SR: ${escapeHtml(sr_id)}</strong>.
          </p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #6b7280; width: 120px;">SR ID</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px; font-weight: bold;">${escapeHtml(sr_id)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">Περιοχή</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${escapeHtml(area || "—")}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">Πελάτης</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${escapeHtml(customer_name || "—")}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">Διεύθυνση</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${escapeHtml(address || "—")}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">Τεχνικός</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${escapeHtml(techName)}${techPhone ? ` (${escapeHtml(techPhone)})` : ""}</td>
            </tr>
          </table>

          <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
            <p style="font-weight: bold; color: #1f2937; font-size: 13px; margin: 0 0 6px;">📝 Λόγος Ακύρωσης:</p>
            <p style="color: #4b5563; font-size: 14px; margin: 0;">${escapeHtml(cancellation_reason)}</p>
          </div>
          
          <p style="color: #374151; font-size: 14px; line-height: 1.6; margin-top: 24px;">Με εκτίμηση,</p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          
          <div style="font-size: 12px; color: #6b7280;">
            <img src="https://task-track-tasker.lovable.app/assets/delta-network-logo.png" alt="Delta Network Inc." style="width: 200px; margin-bottom: 12px; display: block;" />
            <p style="margin: 0;"><strong>Κούλλαρος Μιχαήλ Άγγελος</strong></p>
            <p style="margin: 2px 0;">Technical Operations Manager | FTTx Projects | South Aegean</p>
            <p style="margin: 2px 0;">M: +30 690 710 5282 | E: info@deltanetwork.gr</p>
          </div>
        </div>
      </div>
    `;

    const emailPayload: any = {
      from: "DeltaNet FTTH <noreply@deltanetwork.gr>",
      to: toEmails.split(",").map((e: string) => e.trim()),
      reply_to: "info@deltanetwork.gr",
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

    console.log("Cancellation email sent for SR:", sr_id);

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
