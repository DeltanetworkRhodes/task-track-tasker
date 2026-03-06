import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zipSync } from "https://esm.sh/fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Google Drive auth (same as generate-construction-docs) ───

async function getAccessToken(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: serviceAccountKey.client_email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  const pemContent = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signatureInput);

  const signatureB64 = uint8ToBase64(new Uint8Array(signature))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${payload}.${signatureB64}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
  return (await tokenRes.json()).access_token;
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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth: accept service role key or user JWT
    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    let userId: string | null = null;

    if (token !== serviceRoleKey) {
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
      userId = user.id;
    }

    const {
      construction_id,
      sr_id,
      area,
      customer_name,
      address,
      cab,
      spreadsheet_id,
      photo_paths,
      drive_photo_ids,
      drive_folder_url,
    } = await req.json();

    if (!construction_id || !sr_id) {
      return new Response(JSON.stringify({ error: "Missing construction_id or sr_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allPhotoCount = (photo_paths?.length || 0) + (drive_photo_ids?.length || 0);
    console.log(`Preparing completion email for SR ${sr_id}: spreadsheet=${spreadsheet_id}, photos=${allPhotoCount}`);

    // Get technician info
    let techName = "Τεχνικός";
    if (userId) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("full_name")
        .eq("user_id", userId)
        .single();
      if (profile?.full_name) techName = profile.full_name;
    }

    // Get email settings
    const { data: settings } = await adminClient.from("email_settings").select("*");
    const settingsMap: Record<string, string> = {};
    (settings || []).forEach((s: any) => {
      settingsMap[s.setting_key] = s.setting_value;
    });

    const toEmails = settingsMap["completion_to_emails"] || settingsMap["report_to_emails"] || "info@deltanetwork.gr";
    const ccEmails = settingsMap["completion_cc_emails"] || settingsMap["report_cc_emails"] || "";

    // ─── Build ZIP incrementally ────────────────────────────────────
    const zipFiles: Record<string, Uint8Array> = {};
    let totalSize = 0;
    const MAX_ZIP_SIZE = 20 * 1024 * 1024; // 20MB limit for memory safety

    // Get Drive access token once (needed for spreadsheet + drive photos)
    let driveAccessToken = "";
    try {
      const serviceAccountKey = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY")!);
      driveAccessToken = await getAccessToken(serviceAccountKey);
    } catch (e: any) {
      console.error(`Drive auth error: ${e.message}`);
    }

    // 1. Download Google Sheet as xlsx
    if (spreadsheet_id && driveAccessToken) {
      try {
        const exportUrl = `https://www.googleapis.com/drive/v3/files/${spreadsheet_id}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
        const xlsxRes = await fetch(exportUrl, {
          headers: { Authorization: `Bearer ${driveAccessToken}` },
        });

        if (xlsxRes.ok) {
          const xlsxData = new Uint8Array(await xlsxRes.arrayBuffer());
          zipFiles[`ΦΥΛΛΟ_ΑΠΟΛΟΓΙΣΜΟΥ_${sr_id}.xlsx`] = xlsxData;
          totalSize += xlsxData.length;
          console.log(`Added spreadsheet to ZIP: ${xlsxData.length} bytes`);
        } else {
          console.error(`Failed to export spreadsheet: ${xlsxRes.status}`);
          await xlsxRes.text();
        }
      } catch (err: any) {
        console.error(`Spreadsheet download error: ${err.message}`);
      }
    }

    // 2. Download photos from Supabase Storage
    if (photo_paths && photo_paths.length > 0) {
      for (let i = 0; i < photo_paths.length; i++) {
        if (totalSize > MAX_ZIP_SIZE) {
          console.log(`ZIP size limit reached, skipping remaining photos`);
          break;
        }
        try {
          const { data: fileData, error: dlErr } = await adminClient.storage
            .from("photos")
            .download(photo_paths[i]);
          if (dlErr || !fileData) { console.error(`Photo dl error:`, dlErr); continue; }
          const photoBytes = new Uint8Array(await fileData.arrayBuffer());
          const fileName = photo_paths[i].split("/").pop() || `photo_${i + 1}.jpg`;
          zipFiles[`ΦΩΤΟΓΡΑΦΙΕΣ/${fileName}`] = photoBytes;
          totalSize += photoBytes.length;
          console.log(`Added photo ${fileName}: ${photoBytes.length} bytes`);
        } catch (photoErr: any) {
          console.error(`Photo download error: ${photoErr.message}`);
        }
      }
    }

    // 2b. Download photos from Google Drive
    if (drive_photo_ids && drive_photo_ids.length > 0 && driveAccessToken) {
      for (let i = 0; i < drive_photo_ids.length; i++) {
        if (totalSize > MAX_ZIP_SIZE) {
          console.log(`ZIP size limit reached, skipping remaining Drive photos`);
          break;
        }
        try {
          const photoId = drive_photo_ids[i].id || drive_photo_ids[i];
          const photoName = drive_photo_ids[i].name || `photo_${i + 1}.jpg`;
          const dlUrl = `https://www.googleapis.com/drive/v3/files/${photoId}?alt=media&supportsAllDrives=true`;
          const dlRes = await fetch(dlUrl, { headers: { Authorization: `Bearer ${driveAccessToken}` } });
          if (!dlRes.ok) { console.error(`Drive photo ${photoId}: ${dlRes.status}`); await dlRes.text(); continue; }
          const photoBytes = new Uint8Array(await dlRes.arrayBuffer());
          zipFiles[`ΦΩΤΟΓΡΑΦΙΕΣ/${photoName}`] = photoBytes;
          totalSize += photoBytes.length;
          console.log(`Added Drive photo ${photoName}: ${photoBytes.length} bytes`);
        } catch (photoErr: any) {
          console.error(`Drive photo error: ${photoErr.message}`);
        }
      }
    }

    // 3. Create ZIP and upload to Storage (avoids memory issues with base64)
    let zipDownloadUrl = "";
    const zipFileName = `SR_${sr_id}_ΟΛΟΚΛΗΡΩΣΗ.zip`;
    const zipStoragePath = `completions/${sr_id}/${zipFileName}`;

    if (Object.keys(zipFiles).length > 0) {
      console.log(`Creating ZIP with ${Object.keys(zipFiles).length} files, total ~${Math.round(totalSize / 1024)}KB`);
      const zipped = zipSync(zipFiles);
      console.log(`ZIP created: ${zipped.length} bytes`);

      // Free memory from individual files
      for (const key in zipFiles) delete zipFiles[key];

      // Upload ZIP to Supabase Storage
      const { error: uploadErr } = await adminClient.storage
        .from("photos")
        .upload(zipStoragePath, zipped, {
          contentType: "application/zip",
          upsert: true,
        });

      if (uploadErr) {
        console.error(`ZIP upload error:`, uploadErr);
      } else {
        // Create a signed URL valid for 7 days
        const { data: signedData } = await adminClient.storage
          .from("photos")
          .createSignedUrl(zipStoragePath, 7 * 24 * 60 * 60);
        zipDownloadUrl = signedData?.signedUrl || "";
        console.log(`ZIP uploaded to storage, signed URL created`);
      }
    }

    // ─── Build email HTML ────────────────────────────────────────────
    const subject = `[ΟΛΟΚΛΗΡΩΣΗ] SR: ${sr_id} — ${area || ""}`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #16a34a; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">✅ ΟΛΟΚΛΗΡΩΣΗ ΕΡΓΑΣΙΩΝ — SR: ${escapeHtml(sr_id)}</h2>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Περιοχή: ${escapeHtml(area || "—")}</p>
        </div>
        
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">Αξιότιμοι συνεργάτες,</p>
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            Σας ενημερώνουμε ότι ολοκληρώθηκαν οι εργασίες κατασκευής για το <strong>SR: ${escapeHtml(sr_id)}</strong>.
          </p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; font-size: 13px; color: #166534; width: 120px;">SR ID</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px; font-weight: bold;">${escapeHtml(sr_id)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; font-size: 13px; color: #166534;">Περιοχή</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${escapeHtml(area || "—")}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; font-size: 13px; color: #166534;">Πελάτης</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${escapeHtml(customer_name || "—")}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; font-size: 13px; color: #166534;">Διεύθυνση</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${escapeHtml(address || "—")}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; font-size: 13px; color: #166534;">CAB</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${escapeHtml(cab || "—")}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; font-size: 13px; color: #166534;">Τεχνικός</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${escapeHtml(techName)}</td>
            </tr>
          </table>





          <p style="color: #6b7280; font-size: 12px; margin-top: 16px;">
            📎 Συνημμένο: Φύλλο Απολογισμού & Φωτογραφίες (${allPhotoCount} φωτογραφίες)
          </p>

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

    // ─── Send via Resend ────────────────────────────────────────────
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

    // Attach ZIP if we have files
    if (zipBase64) {
      emailPayload.attachments = [
        {
          filename: zipFileName,
          content: zipBase64,
        },
      ];
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

    console.log(`Completion email sent for SR ${sr_id}, emailId: ${resendData.id}`);

    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
