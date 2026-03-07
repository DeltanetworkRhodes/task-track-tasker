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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { survey_id } = await req.json();
    if (!survey_id) {
      return new Response(JSON.stringify({ error: "Missing survey_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get survey
    const { data: survey, error: surveyErr } = await adminClient
      .from("surveys").select("*").eq("id", survey_id).single();
    if (surveyErr || !survey) {
      return new Response(JSON.stringify({ error: "Survey not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sr_id = survey.sr_id;
    const area = survey.area;

    // Get assignment info
    const { data: assignment } = await adminClient
      .from("assignments").select("customer_name, address, cab").eq("sr_id", sr_id).maybeSingle();
    const customerName = assignment?.customer_name || "";
    const address = assignment?.address || "";
    const cab = assignment?.cab || "";

    // Get technician name
    const { data: techProfile } = await adminClient
      .from("profiles").select("full_name").eq("user_id", survey.technician_id).single();
    const technicianName = techProfile?.full_name || "Τεχνικός";

    // Get org settings
    const userId = claimsData.claims.sub as string;
    const { data: profile } = await adminClient
      .from("profiles").select("organization_id").eq("user_id", userId).single();
    const orgId = profile?.organization_id;

    let orgSettingsQuery = adminClient.from("org_settings").select("setting_key, setting_value");
    if (orgId) orgSettingsQuery = orgSettingsQuery.eq("organization_id", orgId);
    const { data: orgSettings } = await orgSettingsQuery;
    const settingsMap: Record<string, string> = {};
    (orgSettings || []).forEach((s: any) => { settingsMap[s.setting_key] = s.setting_value; });

    const toEmails = settingsMap["report_to_emails"] || "";
    const ccEmails = settingsMap["report_cc_emails"] || "";
    const recipients = toEmails.split(",").map((e: string) => e.trim()).filter(Boolean);
    const ccRecipients = ccEmails.split(",").map((e: string) => e.trim()).filter(Boolean);

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: "No email recipients configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get survey files
    const { data: surveyFiles } = await adminClient
      .from("survey_files").select("*").eq("survey_id", survey_id);
    let fileCount = surveyFiles?.length || 0;

    // Find existing ZIP or build new one
    let zipUrl = "";
    const { data: existingZips } = await adminClient.storage
      .from("surveys").list("zips", { search: sr_id });

    const latestZip = existingZips
      ?.filter((f: any) => f.name.includes(sr_id))
      ?.sort((a: any, b: any) => b.name.localeCompare(a.name))?.[0];

    if (latestZip) {
      const { data: signedUrlData } = await adminClient.storage
        .from("surveys").createSignedUrl(`zips/${latestZip.name}`, 60 * 60 * 24 * 7);
      zipUrl = signedUrlData?.signedUrl || "";
      console.log(`Found existing ZIP: ${latestZip.name}`);
    }

    // If no ZIP exists, call process-survey-completion for full rebuild
    if (!zipUrl) {
      console.log(`No cached ZIP found for ${sr_id}, calling process-survey-completion for full rebuild...`);
      
      const { data: rebuildResult, error: rebuildErr } = await adminClient.functions.invoke(
        "process-survey-completion",
        {
          body: { survey_id },
          headers: { Authorization: authHeader },
        }
      );

      if (rebuildErr) {
        console.error("process-survey-completion rebuild error:", rebuildErr);
      } else {
        console.log("process-survey-completion rebuild result:", JSON.stringify(rebuildResult));
        
        // After rebuild, check for the newly created ZIP
        const { data: newZips } = await adminClient.storage
          .from("surveys").list("zips", { search: sr_id });
        const newLatestZip = newZips
          ?.filter((f: any) => f.name.includes(sr_id))
          ?.sort((a: any, b: any) => b.name.localeCompare(a.name))?.[0];
        
        if (newLatestZip) {
          const { data: newSignedUrl } = await adminClient.storage
            .from("surveys").createSignedUrl(`zips/${newLatestZip.name}`, 60 * 60 * 24 * 7);
          zipUrl = newSignedUrl?.signedUrl || "";
          console.log(`Got ZIP after rebuild: ${newLatestZip.name}`);

          // Update file count from fresh data
          const { data: freshFiles } = await adminClient
            .from("survey_files").select("id").eq("survey_id", survey_id);
          if (freshFiles) fileCount = freshFiles.length;
        }
      }
    }

    const isComplete = survey.status === "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ";
    const statusLabel = isComplete ? "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ" : "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ";
    const headerIcon = isComplete ? "📋" : "⚠️";

    const brandTeal = "#1a9a8a";
    const brandGreen = "#2d8a4e";
    const brandDark = "#1a2332";
    const headerBg = isComplete ? `linear-gradient(135deg, ${brandTeal}, ${brandGreen})` : "linear-gradient(135deg, #ea580c, #dc2626)";
    const textPrimary = "#1a2332";
    const textSecondary = "#4a5568";
    const textMuted = "#718096";
    const tableLabelBg = "#f0f4f8";
    const tableBorder = "#d1d9e0";

    const emailFrom = settingsMap["email_from"] || "noreply@deltanetwork.gr";
    const emailReplyTo = settingsMap["email_reply_to"] || "info@deltanetwork.gr";
    const surveyComments = survey.comments || "";

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f7fa;">
        <div style="background: ${headerBg}; color: white; padding: 24px 28px; border-radius: 12px 12px 0 0;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">${headerIcon}</span>
            <div>
              <h2 style="margin: 0; font-size: 18px; font-weight: 700;">${escapeHtml(statusLabel)}</h2>
              <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">SR: ${escapeHtml(sr_id)} · ${escapeHtml(area)}</p>
            </div>
          </div>
        </div>
        
        <div style="background: white; border: 1px solid ${tableBorder}; border-top: none; padding: 28px; border-radius: 0 0 12px 12px;">
          <p style="color: ${textSecondary}; font-size: 14px; line-height: 1.7; margin: 0 0 8px;">Αξιότιμοι συνεργάτες,</p>
          <p style="color: ${textSecondary}; font-size: 14px; line-height: 1.7; margin: 0 0 20px;">
            Ο τεχνικός <strong style="color: ${textPrimary};">${escapeHtml(technicianName)}</strong> μετέβη για αυτοψία στο <strong style="color: ${textPrimary};">SR: ${escapeHtml(sr_id)}</strong>.${isComplete ? " Σας αποστέλλουμε τα αρχεία για προδέσμευση υλικών." : " Η αυτοψία είναι ελλιπής."}
          </p>
          
          <div style="border-radius: 8px; overflow: hidden; border: 1px solid ${tableBorder}; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 14px; background: ${tableLabelBg}; border-bottom: 1px solid ${tableBorder}; font-size: 12px; color: ${textMuted}; width: 110px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">SR ID</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid ${tableBorder}; font-size: 14px; font-weight: 700; color: ${textPrimary};">${escapeHtml(sr_id)}</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; background: ${tableLabelBg}; border-bottom: 1px solid ${tableBorder}; font-size: 12px; color: ${textMuted}; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Περιοχή</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid ${tableBorder}; font-size: 14px; color: ${textPrimary};">${escapeHtml(area)}</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; background: ${tableLabelBg}; border-bottom: 1px solid ${tableBorder}; font-size: 12px; color: ${textMuted}; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Πελάτης</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid ${tableBorder}; font-size: 14px; color: ${textPrimary};">${escapeHtml(customerName || "—")}</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; background: ${tableLabelBg}; border-bottom: 1px solid ${tableBorder}; font-size: 12px; color: ${textMuted}; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Διεύθυνση</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid ${tableBorder}; font-size: 14px; color: ${textPrimary};">${escapeHtml(address || "—")}</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; background: ${tableLabelBg}; border-bottom: 1px solid ${tableBorder}; font-size: 12px; color: ${textMuted}; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">CAB</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid ${tableBorder}; font-size: 14px; color: ${textPrimary};">${escapeHtml(cab)}</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; background: ${tableLabelBg}; font-size: 12px; color: ${textMuted}; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Τεχνικός</td>
                <td style="padding: 10px 14px; font-size: 14px; color: ${textPrimary};">${escapeHtml(technicianName)}</td>
              </tr>
            </table>
          </div>

          ${surveyComments ? `
          <div style="background: #f0faf8; border-left: 4px solid ${brandTeal}; padding: 14px 18px; margin: 20px 0; border-radius: 0 8px 8px 0;">
            <p style="font-weight: 700; color: ${textPrimary}; font-size: 13px; margin: 0 0 6px;">📝 Σχόλια Τεχνικού</p>
            <p style="color: ${textSecondary}; font-size: 14px; margin: 0; line-height: 1.6;">${escapeHtml(surveyComments)}</p>
          </div>` : ""}

          ${zipUrl ? `
          <div style="text-align: center; margin: 24px 0;">
            <a href="${zipUrl}" style="background: ${brandDark}; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 700; display: inline-block;">📥 Λήψη Αρχείων (ZIP)</a>
          </div>
          <p style="color: ${textMuted}; font-size: 11px; text-align: center; margin-top: 4px;">
            ${fileCount} αρχεία · Ισχύει για 7 ημέρες
          </p>` : ""}
          
          <p style="color: ${textSecondary}; font-size: 14px; line-height: 1.6; margin-top: 28px;">Με εκτίμηση,</p>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          
          <div style="font-size: 12px; color: ${textMuted};">
            <img src="https://task-track-tasker.lovable.app/assets/delta-network-logo.png" alt="Delta Network Inc." style="width: 180px; margin-bottom: 12px; display: block;" />
            <p style="margin: 0; font-weight: 700; color: ${textPrimary};">Κούλλαρος Μιχαήλ Άγγελος</p>
            <p style="margin: 2px 0; color: ${textSecondary};">Technical Operations Manager | FTTx Projects | South Aegean</p>
            <p style="margin: 2px 0;">M: +30 690 710 5282 | E: <a href="mailto:info@deltanetwork.gr" style="color: ${brandTeal}; text-decoration: none;">info@deltanetwork.gr</a></p>
          </div>
        </div>
      </div>
    `;

    const emailPayload: any = {
      from: `DeltaNet FTTH <${emailFrom}>`,
      to: recipients,
      reply_to: emailReplyTo,
      subject: `[ΑΥΤΟΨΙΑ] SR: ${sr_id} — ${area}`,
      html: emailHtml,
    };
    if (ccRecipients.length > 0) emailPayload.cc = ccRecipients;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("Resend error:", errText);
      return new Response(JSON.stringify({ error: "Email send failed", details: errText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Email sent for SR: ${sr_id} to: ${recipients.join(", ")}`);

    await adminClient.from("surveys").update({ email_sent: true }).eq("id", survey_id);

    return new Response(
      JSON.stringify({ success: true, has_zip: !!zipUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Resend survey email error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
