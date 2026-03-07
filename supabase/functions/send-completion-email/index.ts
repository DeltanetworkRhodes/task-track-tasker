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
      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = claimsData.claims.sub;
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
      otdr_paths,
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

    // Get technician info and org
    let techName = "Τεχνικός";
    let orgId: string | null = null;
    if (userId) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("full_name, organization_id")
        .eq("user_id", userId)
        .single();
      if (profile?.full_name) techName = profile.full_name;
      orgId = profile?.organization_id || null;
    }

    // Get org-specific settings for all email config
    let orgSettingsQuery = adminClient.from("org_settings").select("setting_key, setting_value");
    if (orgId) orgSettingsQuery = orgSettingsQuery.eq("organization_id", orgId);
    const { data: orgSettings } = await orgSettingsQuery;
    const orgSettingsMap: Record<string, string> = {};
    (orgSettings || []).forEach((s: any) => { orgSettingsMap[s.setting_key] = s.setting_value; });

    const emailFrom = orgSettingsMap["email_from"] || "noreply@deltanetwork.gr";
    const emailReplyTo = orgSettingsMap["email_reply_to"] || "info@deltanetwork.gr";

    const toEmails = orgSettingsMap["completion_to_emails"] || orgSettingsMap["report_to_emails"] || emailReplyTo;
    const ccEmails = orgSettingsMap["completion_cc_emails"] || orgSettingsMap["report_cc_emails"] || "";

    // ─── Build ZIP incrementally ────────────────────────────────────
    const zipFiles: Record<string, Uint8Array> = {};
    let totalSize = 0;
    // No size limit — ZIP is uploaded to storage and only a signed URL link is sent

    // Get Drive access token once (needed for spreadsheet + drive photos)
    let driveAccessToken = "";
    try {
      const serviceAccountKey = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY")!);
      driveAccessToken = await getAccessToken(serviceAccountKey);
    } catch (e: any) {
      console.error(`Drive auth error: ${e.message}`);
    }

    // Helper: fetch a compressed/resized version of a Drive photo via its thumbnail URL
    async function fetchCompressedDrivePhoto(photoId: string, accessToken: string): Promise<Uint8Array | null> {
      try {
        // Get file metadata to obtain thumbnailLink
        const metaUrl = `https://www.googleapis.com/drive/v3/files/${photoId}?fields=thumbnailLink&supportsAllDrives=true`;
        const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!metaRes.ok) { await metaRes.text(); return null; }
        const meta = await metaRes.json();
        
        if (meta.thumbnailLink) {
          // Replace default size with larger compressed version (~500-800KB instead of multi-MB originals)
          const compressedUrl = meta.thumbnailLink.replace(/=s\d+$/, "=s1600");
          const imgRes = await fetch(compressedUrl);
          if (imgRes.ok) {
            return new Uint8Array(await imgRes.arrayBuffer());
          }
          await imgRes.text();
        }
      } catch (e: any) {
        console.error(`Compressed fetch failed for ${photoId}: ${e.message}`);
      }
      return null;
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

    // Map ASCII storage folder names to Greek display names
    const folderDisplayNames: Record<string, string> = {
      SKAMA: "ΣΚΑΜΑ", ODEFSI: "ΟΔΕΥΣΗ", BCP: "BCP", BEP: "BEP",
      BMO: "BMO", FB: "FB", KAMPINA: "ΚΑΜΠΙΝΑ", G_FASI: "Γ_ΦΑΣΗ",
    };

    // 2. Download photos from Supabase Storage (organized by category folders)
    if (photo_paths && photo_paths.length > 0) {
      for (let i = 0; i < photo_paths.length; i++) {
        try {
          const { data: fileData, error: dlErr } = await adminClient.storage
            .from("photos")
            .download(photo_paths[i]);
          if (dlErr || !fileData) { console.error(`Photo dl error:`, dlErr); continue; }
          const photoBytes = new Uint8Array(await fileData.arrayBuffer());
          
          // Extract category from path: constructions/{sr_id}/{construction_id}/{CATEGORY}/{filename}
          const pathParts = photo_paths[i].split("/");
          let categoryFolder = "";
          let fileName = pathParts.pop() || `photo_${i + 1}.jpg`;
          if (pathParts.length >= 4) {
            const asciiFolder = pathParts[pathParts.length - 1];
            const displayName = folderDisplayNames[asciiFolder] || asciiFolder;
            categoryFolder = displayName + "/";
          }
          
          zipFiles[`ΦΩΤΟΓΡΑΦΙΕΣ/${categoryFolder}${fileName}`] = photoBytes;
          totalSize += photoBytes.length;
          console.log(`Added photo ${categoryFolder}${fileName}: ${photoBytes.length} bytes`);
        } catch (photoErr: any) {
          console.error(`Photo download error: ${photoErr.message}`);
        }
      }
    }

    // 2b. Download photos from Google Drive (compressed via thumbnail API)
    if (drive_photo_ids && drive_photo_ids.length > 0 && driveAccessToken) {
      for (let i = 0; i < drive_photo_ids.length; i++) {
        try {
          const photoId = drive_photo_ids[i].id || drive_photo_ids[i];
          const photoName = drive_photo_ids[i].name || `photo_${i + 1}.jpg`;
          
          // Try compressed version first, fall back to original
          let photoBytes = await fetchCompressedDrivePhoto(photoId, driveAccessToken);
          if (photoBytes) {
            console.log(`Compressed Drive photo ${photoName}: ${photoBytes.length} bytes`);
          } else {
            // Fallback: download original
            const dlUrl = `https://www.googleapis.com/drive/v3/files/${photoId}?alt=media&supportsAllDrives=true`;
            const dlRes = await fetch(dlUrl, { headers: { Authorization: `Bearer ${driveAccessToken}` } });
            if (!dlRes.ok) { console.error(`Drive photo ${photoId}: ${dlRes.status}`); await dlRes.text(); continue; }
            photoBytes = new Uint8Array(await dlRes.arrayBuffer());
            console.log(`Original Drive photo ${photoName}: ${photoBytes.length} bytes`);
          }
          
          zipFiles[`ΦΩΤΟΓΡΑΦΙΕΣ/${photoName}`] = photoBytes;
          totalSize += photoBytes.length;
        } catch (photoErr: any) {
          console.error(`Drive photo error: ${photoErr.message}`);
        }
      }
    }

    // 2c. Download OTDR PDFs from Supabase Storage
    const otdrSubfolderNames: Record<string, string> = {
      OTDR_BMO: "BMO", OTDR_KAMPINA: "ΚΑΜΠΙΝΑ",
      OTDR_BEP: "BEP", OTDR_BCP: "BCP", OTDR_LIVE: "LIVE",
    };
    function resolveOtdrZipPath(asciiFolder: string): string {
      if (otdrSubfolderNames[asciiFolder]) return otdrSubfolderNames[asciiFolder] + "/";
      const fbMatch = asciiFolder.match(/^OTDR_FB_(\d+)$/);
      if (fbMatch) return `FB/${fbMatch[1]}/`;
      return asciiFolder + "/";
    }
    if (otdr_paths && otdr_paths.length > 0) {
      for (let i = 0; i < otdr_paths.length; i++) {
        if (totalSize > MAX_ZIP_SIZE) { console.log(`ZIP size limit reached`); break; }
        try {
          const { data: fileData, error: dlErr } = await adminClient.storage
            .from("photos")
            .download(otdr_paths[i]);
          if (dlErr || !fileData) { console.error(`OTDR dl error:`, dlErr); continue; }
          const pdfBytes = new Uint8Array(await fileData.arrayBuffer());
          
          const pathParts = otdr_paths[i].split("/");
          let subfolder = "";
          let fileName = pathParts.pop() || `otdr_${i + 1}.pdf`;
          if (pathParts.length >= 4) {
            const asciiFolder = pathParts[pathParts.length - 1];
            subfolder = resolveOtdrZipPath(asciiFolder);
          }
          
          zipFiles[`ΜΕΤΡΗΣΕΙΣ/${subfolder}${fileName}`] = pdfBytes;
          totalSize += pdfBytes.length;
          console.log(`Added OTDR ${subfolder}${fileName}: ${pdfBytes.length} bytes`);
        } catch (err: any) {
          console.error(`OTDR download error: ${err.message}`);
        }
      }
    }

    // 3. Create ZIP and upload to Storage (avoids memory issues with base64)
    let zipDownloadUrl = "";
    const safeSrId = sr_id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const zipFileName = `SR_${safeSrId}.zip`;
    const zipStoragePath = `completions/${safeSrId}/${zipFileName}`;

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
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f7fa;">
        <div style="background: linear-gradient(135deg, #1a9a8a, #2d8a4e); color: white; padding: 24px 28px; border-radius: 12px 12px 0 0;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">✅</span>
            <div>
              <h2 style="margin: 0; font-size: 18px; font-weight: 700; letter-spacing: 0.3px;">ΟΛΟΚΛΗΡΩΣΗ ΕΡΓΑΣΙΩΝ</h2>
              <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">SR: ${escapeHtml(sr_id)} · ${escapeHtml(area || "—")}</p>
            </div>
          </div>
        </div>
        
        <div style="background: white; border: 1px solid #d1d9e0; border-top: none; padding: 28px; border-radius: 0 0 12px 12px;">
          <p style="color: #4a5568; font-size: 14px; line-height: 1.7; margin: 0 0 8px;">Αξιότιμοι συνεργάτες,</p>
          <p style="color: #4a5568; font-size: 14px; line-height: 1.7; margin: 0 0 20px;">
            Σας ενημερώνουμε ότι ολοκληρώθηκαν οι εργασίες κατασκευής για το <strong style="color: #1a2332;">SR: ${escapeHtml(sr_id)}</strong>.
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
                <td style="padding: 10px 14px; font-size: 14px; color: #1a2332;">${escapeHtml(techName)}</td>
              </tr>
            </table>
          </div>



          ${zipDownloadUrl ? `
          <div style="text-align: center; margin: 24px 0;">
            <a href="${escapeHtml(zipDownloadUrl)}" style="background: #1a2332; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 700; display: inline-block; letter-spacing: 0.3px;">📥 Λήψη Αρχείων (ZIP)</a>
          </div>
          <p style="color: #718096; font-size: 11px; text-align: center; margin-top: 4px;">
            Φύλλο Απολογισμού & ${allPhotoCount} φωτογραφίες · Ισχύει για 7 ημέρες
          </p>
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

    // ─── Send via Resend ────────────────────────────────────────────
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
