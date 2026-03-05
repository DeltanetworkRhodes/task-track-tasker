import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { assignment_id, sr_id, area, customer_name, address, cab, comments } = await req.json();

    if (!assignment_id || !sr_id) {
      return new Response(JSON.stringify({ error: "Missing assignment_id or sr_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get technician name
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name, phone")
      .eq("user_id", user.id)
      .single();

    const techName = profile?.full_name || user.email || "Τεχνικός";
    const techPhone = profile?.phone || "";

    // Get email settings
    const { data: settings } = await adminClient
      .from("email_settings")
      .select("*");

    const settingsMap: Record<string, string> = {};
    (settings || []).forEach((s: any) => {
      settingsMap[s.setting_key] = s.setting_value;
    });

    const toEmails = settingsMap["report_to_emails"] || "info@deltanetwork.gr";
    const ccEmails = settingsMap["report_cc_emails"] || "";

    const subject = `[ΑΥΤΟΨΙΑ] SR: ${sr_id} — ${area || ""}`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #2563eb; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">🔍 ΑΥΤΟΨΙΑ — SR: ${sr_id}</h2>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Περιοχή: ${area || "—"}</p>
        </div>
        
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            Αξιότιμοι συνεργάτες,
          </p>
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            Σας ενημερώνουμε ότι ο τεχνικός <strong>${techName}</strong> μετέβη για αυτοψία στο <strong>SR: ${sr_id}</strong>.
          </p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #6b7280; width: 120px;">SR ID</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px; font-weight: bold;">${sr_id}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">Περιοχή</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${area || "—"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">Πελάτης</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${customer_name || "—"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">Διεύθυνση</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${address || "—"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">CAB</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${cab || "—"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">Τεχνικός</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${techName}${techPhone ? ` (${techPhone})` : ""}</td>
            </tr>
          </table>

          ${comments ? `
          <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
            <p style="font-weight: bold; color: #1f2937; font-size: 13px; margin: 0 0 6px;">📝 Σχόλια:</p>
            <p style="color: #4b5563; font-size: 14px; margin: 0;">${comments}</p>
          </div>
          ` : ""}
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          
          <div style="font-size: 12px; color: #6b7280;">
            <p style="margin: 0;"><strong>Κούλλαρος Μιχαήλ Άγγελος</strong></p>
            <p style="margin: 2px 0;">Technical Operations Manager | FTTx Projects | South Aegean</p>
            <p style="margin: 2px 0;">M: +30 690 710 5282 | E: info@deltanetwork.gr</p>
          </div>
        </div>
      </div>
    `;

    const emailPayload: any = {
      from: "DeltaNet FTTH <onboarding@resend.dev>",
      to: toEmails.split(",").map((e: string) => e.trim()),
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
