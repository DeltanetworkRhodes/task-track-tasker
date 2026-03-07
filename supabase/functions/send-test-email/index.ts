import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { organization_id } = await req.json();
    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "organization_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch org settings
    const { data: settings, error: settingsError } = await supabase
      .from("org_settings")
      .select("setting_key, setting_value")
      .eq("organization_id", organization_id);

    if (settingsError) throw settingsError;

    const settingsMap: Record<string, string> = {};
    (settings || []).forEach((s: any) => {
      settingsMap[s.setting_key] = s.setting_value;
    });

    const emailFrom = settingsMap["email_from"];
    const emailReplyTo = settingsMap["email_reply_to"];

    if (!emailFrom) {
      return new Response(
        JSON.stringify({ error: "Δεν έχει οριστεί Email Αποστολέα στις Ρυθμίσεις" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch org name
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", organization_id)
      .maybeSingle();

    const orgName = org?.name || "FTTH Operations";
    const now = new Date().toLocaleString("el-GR", { timeZone: "Europe/Athens" });

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #0d9488, #0891b2); border-radius: 12px; padding: 24px; color: white; text-align: center; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 22px;">✅ Δοκιμαστικό Email</h1>
          <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">${orgName}</p>
        </div>
        <div style="background: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0;">
          <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
            Αυτό είναι ένα <strong>δοκιμαστικό email</strong> από την πλατφόρμα FTTH Operations.
          </p>
          <p style="margin: 0 0 16px; font-size: 14px; color: #475569;">
            Αν βλέπετε αυτό το μήνυμα, τα email σας λειτουργούν σωστά! 🎉
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; border-top: 1px solid #e2e8f0;">Αποστολέας (From)</td>
              <td style="padding: 8px 0; color: #1e293b; font-weight: 600; border-top: 1px solid #e2e8f0;">${emailFrom}</td>
            </tr>
            ${emailReplyTo ? `<tr>
              <td style="padding: 8px 0; color: #64748b; border-top: 1px solid #e2e8f0;">Reply-To</td>
              <td style="padding: 8px 0; color: #1e293b; font-weight: 600; border-top: 1px solid #e2e8f0;">${emailReplyTo}</td>
            </tr>` : ""}
            <tr>
              <td style="padding: 8px 0; color: #64748b; border-top: 1px solid #e2e8f0;">Ημερομηνία</td>
              <td style="padding: 8px 0; color: #1e293b; font-weight: 600; border-top: 1px solid #e2e8f0;">${now}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; border-top: 1px solid #e2e8f0;">Εταιρία</td>
              <td style="padding: 8px 0; color: #1e293b; font-weight: 600; border-top: 1px solid #e2e8f0;">${orgName}</td>
            </tr>
          </table>
        </div>
        <p style="text-align: center; font-size: 11px; color: #94a3b8; margin-top: 16px;">
          Αυτό είναι αυτοματοποιημένο μήνυμα — δεν χρειάζεται απάντηση.
        </p>
      </div>
    `;

    const resendPayload: any = {
      from: `${orgName} <${emailFrom}>`,
      to: [emailFrom],
      subject: `✅ Δοκιμαστικό Email — ${orgName}`,
      html: htmlBody,
    };

    if (emailReplyTo) {
      resendPayload.reply_to = emailReplyTo;
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendPayload),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend error:", resendData);
      return new Response(
        JSON.stringify({ error: resendData?.message || "Αποτυχία αποστολής email", details: resendData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, to: emailFrom, id: resendData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
