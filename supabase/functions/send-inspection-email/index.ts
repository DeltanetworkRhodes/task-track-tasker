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
    const userId = claimsData.claims.sub;

    const { assignment_id, sr_id, area, customer_name, address, cab, comments } = await req.json();

    if (!assignment_id || !sr_id) {
      return new Response(JSON.stringify({ error: "Missing assignment_id or sr_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name, phone, organization_id")
      .eq("user_id", userId)
      .single();

    const techName = profile?.full_name || "Τεχνικός";
    const techPhone = profile?.phone || "";
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

    const subject = `[ΑΥΤΟΨΙΑ] SR: ${sr_id} — ${area || ""}`;

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f7fa;">
        <div style="background: linear-gradient(135deg, #1a9a8a, #2d8a4e); color: white; padding: 24px 28px; border-radius: 12px 12px 0 0;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">🔍</span>
            <div>
              <h2 style="margin: 0; font-size: 18px; font-weight: 700; letter-spacing: 0.3px;">ΑΥΤΟΨΙΑ</h2>
              <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">SR: ${escapeHtml(sr_id)} · ${escapeHtml(area || "—")}</p>
            </div>
          </div>
        </div>
        
        <div style="background: white; border: 1px solid #d1d9e0; border-top: none; padding: 28px; border-radius: 0 0 12px 12px;">
          <p style="color: #4a5568; font-size: 14px; line-height: 1.7; margin: 0 0 8px;">Αξιότιμοι συνεργάτες,</p>
          <p style="color: #4a5568; font-size: 14px; line-height: 1.7; margin: 0 0 20px;">
            Σας ενημερώνουμε ότι ο τεχνικός <strong style="color: #1a2332;">${escapeHtml(techName)}</strong> μετέβη για αυτοψία στο <strong style="color: #1a2332;">SR: ${escapeHtml(sr_id)}</strong>.
          </p>
          
          <div style="border-radius: 8px; overflow: hidden; border: 1px solid #d1d9e0; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 14px; background: #f0f4f8; border-bottom: 1px solid #d1d9e0; font-size: 12px; color: #718096; width: 110px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">SR ID</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid #d1d9e0; font-size: 14px; font-weight: 700; color: #1a2332;">${escapeHtml(sr_id)}</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; background: #f0f4f8; border-bottom: 1px solid #d1d9e0; font-size: 12px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Περιοχή</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid #d1d9e0; font-size: 14px; color: #1a2332;">${escapeHtml(area || "—")}</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; background: #f0f4f8; border-bottom: 1px solid #d1d9e0; font-size: 12px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Πελάτης</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid #d1d9e0; font-size: 14px; color: #1a2332;">${escapeHtml(customer_name || "—")}</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; background: #f0f4f8; border-bottom: 1px solid #d1d9e0; font-size: 12px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Διεύθυνση</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid #d1d9e0; font-size: 14px; color: #1a2332;">${escapeHtml(address || "—")}</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; background: #f0f4f8; border-bottom: 1px solid #d1d9e0; font-size: 12px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">CAB</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid #d1d9e0; font-size: 14px; color: #1a2332;">${escapeHtml(cab || "—")}</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; background: #f0f4f8; font-size: 12px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Τεχνικός</td>
                <td style="padding: 10px 14px; font-size: 14px; color: #1a2332;">${escapeHtml(techName)}${techPhone ? ` (${escapeHtml(techPhone)})` : ""}</td>
              </tr>
            </table>
          </div>

          ${comments ? `
          <div style="background: #f0faf8; border-left: 4px solid #1a9a8a; padding: 14px 18px; margin: 20px 0; border-radius: 0 8px 8px 0;">
            <p style="font-weight: 700; color: #1a2332; font-size: 13px; margin: 0 0 6px;">📝 Σχόλια:</p>
            <p style="color: #4a5568; font-size: 14px; margin: 0; line-height: 1.6;">${escapeHtml(comments)}</p>
          </div>
          ` : ""}
          
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

    console.log("Inspection email sent for SR:", sr_id);

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
