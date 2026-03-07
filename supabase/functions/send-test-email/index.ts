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
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f7fa;">
        <div style="background: linear-gradient(135deg, #1a9a8a, #2d8a4e); border-radius: 12px 12px 0 0; padding: 24px 28px; color: white;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">✅</span>
            <div>
              <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.3px;">Δοκιμαστικό Email</h1>
              <p style="margin: 4px 0 0; opacity: 0.85; font-size: 13px;">${orgName}</p>
            </div>
          </div>
        </div>
        <div style="background: white; border: 1px solid #d1d9e0; border-top: none; border-radius: 0 0 12px 12px; padding: 28px;">
          <p style="margin: 0 0 12px; font-size: 15px; color: #1a2332;">
            Αυτό είναι ένα <strong>δοκιμαστικό email</strong> από την πλατφόρμα FTTH Operations.
          </p>
          <p style="margin: 0 0 20px; font-size: 14px; color: #4a5568;">
            Αν βλέπετε αυτό το μήνυμα, τα email σας λειτουργούν σωστά! 🎉
          </p>
          <div style="border-radius: 8px; overflow: hidden; border: 1px solid #d1d9e0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 10px 14px; background: #f0f4f8; border-bottom: 1px solid #d1d9e0; color: #718096; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Αποστολέας (From)</td>
                <td style="padding: 10px 14px; color: #1a2332; font-weight: 700; border-bottom: 1px solid #d1d9e0;">${emailFrom}</td>
              </tr>
              ${emailReplyTo ? `<tr>
                <td style="padding: 10px 14px; background: #f0f4f8; border-bottom: 1px solid #d1d9e0; color: #718096; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Reply-To</td>
                <td style="padding: 10px 14px; color: #1a2332; font-weight: 700; border-bottom: 1px solid #d1d9e0;">${emailReplyTo}</td>
              </tr>` : ""}
              <tr>
                <td style="padding: 10px 14px; background: #f0f4f8; border-bottom: 1px solid #d1d9e0; color: #718096; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Ημερομηνία</td>
                <td style="padding: 10px 14px; color: #1a2332; font-weight: 700; border-bottom: 1px solid #d1d9e0;">${now}</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; background: #f0f4f8; color: #718096; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Εταιρία</td>
                <td style="padding: 10px 14px; color: #1a2332; font-weight: 700;">${orgName}</td>
              </tr>
            </table>
          </div>
        </div>
        <p style="text-align: center; font-size: 11px; color: #718096; margin-top: 16px;">
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
