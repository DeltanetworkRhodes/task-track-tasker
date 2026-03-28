import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zipSync } from "https://esm.sh/fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_SIGNATURE = `<div style="font-size: 12px; color: #718096;">
  <img src="https://task-track-tasker.lovable.app/assets/delta-network-logo.png" alt="Delta Network Inc." style="width: 180px; margin-bottom: 12px; display: block;" />
  <p style="margin: 0; font-weight: 700; color: #1a2332;">Κούλλαρος Μιχαήλ Άγγελος</p>
  <p style="margin: 2px 0; color: #4a5568;">Technical Operations Manager | FTTx Projects | South Aegean</p>
  <p style="margin: 2px 0;">M: +30 690 710 5282 | E: <a href="mailto:info@deltanetwork.gr" style="color: #1a9a8a; text-decoration: none;">info@deltanetwork.gr</a></p>
</div>`;

const SHARED_DRIVE_ID = "0AN9VpmNEa7QBUk9PVA";

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// ─── Google Drive helpers ────────────────────────────────────────────

async function getAccessToken(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: serviceAccountKey.client_email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
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

async function driveSearch(accessToken: string, query: string): Promise<any[]> {
  const fields = "files(id,name,mimeType,webViewLink,createdTime,shortcutDetails(targetId,targetMimeType))";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${fields}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${SHARED_DRIVE_ID}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const fallbackUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${fields}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`;
    const fallbackRes = await fetch(fallbackUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!fallbackRes.ok) throw new Error(await fallbackRes.text());
    return (await fallbackRes.json()).files || [];
  }
  return (await res.json()).files || [];
}

function escapeDriveQueryValue(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function extractDriveFolderId(folderUrl?: string): string | null {
  if (!folderUrl) return null;
  const folderMatch = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) return folderMatch[1];
  const idMatch = folderUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return idMatch?.[1] || null;
}

async function getDriveFolderById(accessToken: string, folderId: string): Promise<any | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,webViewLink,createdTime&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.mimeType !== "application/vnd.google-apps.folder") return null;
  return data;
}

function scoreSrFolderCandidate(folderName: string, srId: string): number {
  const name = folderName.toUpperCase();
  const sr = srId.toUpperCase();
  if (name.startsWith(`SR ${sr} `) || name === `SR ${sr}`) return 100;
  if (name.includes(`SR ${sr}`)) return 80;
  if (name.includes(sr)) return 60;
  return 10;
}

async function resolveSrDriveFolder(
  accessToken: string,
  srId: string,
  preferredFolderUrl?: string
): Promise<any | null> {
  const preferredFolderId = extractDriveFolderId(preferredFolderUrl);
  if (preferredFolderId) {
    const preferredFolder = await getDriveFolderById(accessToken, preferredFolderId);
    if (preferredFolder) {
      console.log(`Using assignment Drive folder for SR ${srId}: ${preferredFolder.name} (${preferredFolder.id})`);
      return preferredFolder;
    }
  }

  const escapedSrId = escapeDriveQueryValue(srId);
  const folders = await driveSearch(
    accessToken,
    `name contains '${escapedSrId}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );

  if (folders.length === 0) return null;

  const sorted = [...folders].sort((a, b) => {
    const scoreDiff = scoreSrFolderCandidate(b?.name || "", srId) - scoreSrFolderCandidate(a?.name || "", srId);
    if (scoreDiff !== 0) return scoreDiff;
    const aTs = a?.createdTime ? Date.parse(a.createdTime) : 0;
    const bTs = b?.createdTime ? Date.parse(b.createdTime) : 0;
    return bTs - aTs;
  });

  return sorted[0] || null;
}

async function downloadDriveFilesForZip(
  accessToken: string,
  srId: string,
  customerName: string,
  preferredFolderUrl?: string
): Promise<{ zipBytes: Uint8Array; fileCount: number } | null> {
  console.log(`Fetching files from Google Drive for SR ${srId}...`);

  const initialFolder = await resolveSrDriveFolder(accessToken, srId, preferredFolderUrl);
  if (!initialFolder) {
    console.log(`No Drive folder found for SR ${srId}`);
    return null;
  }

  const escapedSrId = escapeDriveQueryValue(srId);
  const searchFolders = await driveSearch(
    accessToken,
    `name contains '${escapedSrId}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );

  const candidateMap = new Map<string, any>();
  candidateMap.set(initialFolder.id, initialFolder);
  for (const f of searchFolders) {
    if (f?.id && !candidateMap.has(f.id)) candidateMap.set(f.id, f);
  }

  const folderCandidates = Array.from(candidateMap.values()).sort((a, b) => {
    const scoreDiff = scoreSrFolderCandidate(b?.name || "", srId) - scoreSrFolderCandidate(a?.name || "", srId);
    if (scoreDiff !== 0) return scoreDiff;
    const aTs = a?.createdTime ? Date.parse(a.createdTime) : 0;
    const bTs = b?.createdTime ? Date.parse(b.createdTime) : 0;
    return bTs - aTs;
  });

  const safeName = (customerName || "").replace(/[\/\\:*?"<>|]/g, "_").trim();
  const rootFolder = `SR ${srId}${safeName ? ` ${safeName}` : ""}`;

  const collectFromFolder = async (folderId: string): Promise<{ id: string; name: string; zipPath: string }[]> => {
    const allFiles: { id: string; name: string; zipPath: string }[] = [];
    const visitedFolderIds = new Set<string>();

    const collectFilesRecursive = async (currentFolderId: string, currentPath = ""): Promise<void> => {
      if (visitedFolderIds.has(currentFolderId)) return;
      visitedFolderIds.add(currentFolderId);

      const children = await driveSearch(
        accessToken,
        `'${currentFolderId}' in parents and trashed = false`
      );

      for (const child of children) {
        const childName = child.name || "unnamed";
        const childPath = currentPath ? `${currentPath}/${childName}` : childName;
        const childMimeType = child.mimeType || "";

        if (childMimeType === "application/vnd.google-apps.folder") {
          await collectFilesRecursive(child.id, childPath);
          continue;
        }

        if (childMimeType === "application/vnd.google-apps.shortcut") {
          const targetId = child.shortcutDetails?.targetId;
          const targetMimeType = child.shortcutDetails?.targetMimeType || "";
          if (!targetId) continue;

          if (targetMimeType === "application/vnd.google-apps.folder") {
            await collectFilesRecursive(targetId, childPath);
            continue;
          }

          const folderPath = currentPath ? `${rootFolder}/${currentPath}` : rootFolder;
          allFiles.push({ id: targetId, name: childName, zipPath: `${folderPath}/${childName}` });
          continue;
        }

        if (childMimeType.startsWith("application/vnd.google-apps")) {
          console.log(`Skipping non-downloadable Google file: ${childPath} (${childMimeType})`);
          continue;
        }

        const folderPath = currentPath ? `${rootFolder}/${currentPath}` : rootFolder;
        allFiles.push({ id: child.id, name: childName, zipPath: `${folderPath}/${childName}` });
      }
    };

    await collectFilesRecursive(folderId);
    return allFiles;
  };

  let folder = folderCandidates[0];
  let allFiles = await collectFromFolder(folder.id);
  console.log(`Found ${allFiles.length} files in Drive folder: ${folder.name} (${folder.id})`);

  if (allFiles.length === 0) {
    for (const candidate of folderCandidates.slice(1)) {
      const candidateFiles = await collectFromFolder(candidate.id);
      console.log(`Candidate folder ${candidate.name} (${candidate.id}) has ${candidateFiles.length} files`);
      if (candidateFiles.length > 0) {
        folder = candidate;
        allFiles = candidateFiles;
        console.log(`Using non-empty alternative folder: ${folder.name} (${folder.id})`);
        break;
      }
    }
  }

  if (allFiles.length === 0) {
    console.log(`No files found in any Drive folder for SR ${srId}`);
    return null;
  }

  console.log(`Found ${allFiles.length} files in Drive, downloading...`);

  // Download files 2 at a time
  const zipInput: Record<string, Uint8Array> = {};
  let downloadedCount = 0;
  const BATCH = 2;

  for (let i = 0; i < allFiles.length; i += BATCH) {
    const batch = allFiles.slice(i, i + BATCH);
    const downloads = await Promise.all(
      batch.map(async (file) => {
        try {
          const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!res.ok) {
            console.error(`Failed to download ${file.name}: ${res.status}`);
            return null;
          }
          const data = new Uint8Array(await res.arrayBuffer());
          console.log(`Downloaded: ${file.name} (${(data.length / 1024).toFixed(0)}KB)`);
          return { zipPath: file.zipPath, data };
        } catch (e: any) {
          console.error(`Download error for ${file.name}: ${e.message}`);
          return null;
        }
      })
    );
    for (const d of downloads) {
      if (d) {
        zipInput[d.zipPath] = d.data;
        downloadedCount++;
      }
    }
  }

  if (downloadedCount === 0) return null;

  console.log(`Building ZIP from ${downloadedCount} Drive files...`);
  const zipBytes = zipSync(zipInput, { level: 6 });
  console.log(`ZIP created: ${(zipBytes.length / 1024 / 1024).toFixed(1)}MB`);

  return { zipBytes, fileCount: downloadedCount };
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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { survey_id } = await req.json();
    if (!survey_id) {
      return new Response(JSON.stringify({ error: "Missing survey_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const orgId = survey.organization_id;

    // Get assignment info
    const { data: assignment } = await adminClient
      .from("assignments").select("customer_name, address, cab, drive_folder_url").eq("sr_id", sr_id).maybeSingle();
    const customerName = assignment?.customer_name || "";
    const address = assignment?.address || "";
    const cab = assignment?.cab || "";
    const driveFolderUrl = assignment?.drive_folder_url || "";

    // Get technician name
    const { data: techProfile } = await adminClient
      .from("profiles").select("full_name").eq("user_id", survey.technician_id).single();
    const technicianName = techProfile?.full_name || "Τεχνικός";

    // Get org email settings
    const { data: orgSettings } = await adminClient
      .from("org_settings")
      .select("setting_key, setting_value")
      .eq("organization_id", orgId);

    const settingsMap: Record<string, string> = {};
    (orgSettings || []).forEach((s: any) => {
      settingsMap[s.setting_key] = s.setting_value;
    });

    const toEmails = settingsMap["report_to_emails"] || "";
    const ccEmails = settingsMap["report_cc_emails"] || "";
    const recipients = toEmails.split(",").map((e: string) => e.trim()).filter(Boolean);
    const ccRecipients = ccEmails.split(",").map((e: string) => e.trim()).filter(Boolean);

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: "No recipients configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to get existing ZIP signed URL
    const safeSrId = sr_id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const zipStoragePath = `surveys/${safeSrId}/Autopsia_${safeSrId}.zip`;
    let zipDownloadUrl = "";

    const { data: signedData } = await adminClient.storage
      .from("photos")
      .createSignedUrl(zipStoragePath, 7 * 24 * 60 * 60);
    zipDownloadUrl = signedData?.signedUrl || "";

    // If no ZIP exists in storage, try to build one from Google Drive
    if (!zipDownloadUrl) {
      const serviceAccountKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
      if (serviceAccountKeyStr) {
        try {
          console.log(`No ZIP in storage, building from Google Drive for SR ${sr_id}...`);
          const serviceAccountKey = JSON.parse(serviceAccountKeyStr);
          const accessToken = await getAccessToken(serviceAccountKey);
          const result = await downloadDriveFilesForZip(accessToken, sr_id, customerName, driveFolderUrl);

          if (result) {
            // Upload ZIP to storage
            const { error: uploadErr } = await adminClient.storage
              .from("photos")
              .upload(zipStoragePath, result.zipBytes, {
                contentType: "application/zip",
                upsert: true,
              });

            if (uploadErr) {
              console.error(`ZIP upload error:`, uploadErr);
            } else {
              const { data: newSignedData } = await adminClient.storage
                .from("photos")
                .createSignedUrl(zipStoragePath, 7 * 24 * 60 * 60);
              zipDownloadUrl = newSignedData?.signedUrl || "";
              console.log(`ZIP created from Drive (${result.fileCount} files) and uploaded to storage`);
            }
          }
        } catch (driveErr: any) {
          console.error(`Drive ZIP creation error: ${driveErr.message}`);
        }
      }
    }

    if (!zipDownloadUrl) {
      console.error(`Resend aborted for SR ${sr_id}: ZIP link not available`);
      return new Response(JSON.stringify({ error: "ZIP_NOT_AVAILABLE", details: "Δεν βρέθηκε ZIP για αποστολή email." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isComplete = survey.status === "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ";
    const statusLabel = isComplete ? "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ" : "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ";
    const headerIcon = isComplete ? "📋" : "⚠️";

    const brandTeal = "#1a9a8a";
    const brandDark = "#1a2332";
    const headerBg = isComplete ? `linear-gradient(135deg, ${brandTeal}, #2d8a4e)` : "linear-gradient(135deg, #ea580c, #dc2626)";
    const textPrimary = "#1a2332";
    const textSecondary = "#4a5568";
    const textMuted = "#718096";
    const tableLabelBg = "#f0f4f8";
    const tableBorder = "#d1d9e0";

    const emailFrom = settingsMap["email_from"] || "noreply@deltanetwork.gr";
    const emailReplyTo = settingsMap["email_reply_to"] || "info@deltanetwork.gr";
    const emailSenderName = settingsMap["email_sender_name"] || "DeltaNet FTTH";
    const emailSignature = settingsMap["email_signature"] || DEFAULT_SIGNATURE;
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

          ${zipDownloadUrl ? `
          <div style="text-align: center; margin: 24px 0;">
            <a href="${zipDownloadUrl}" style="background: ${brandDark}; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 700; display: inline-block;">📥 Λήψη Αρχείων (ZIP)</a>
          </div>
          <p style="color: ${textMuted}; font-size: 11px; text-align: center; margin-top: 4px;">
            Ισχύει για 7 ημέρες
          </p>` : ""}

          
          <p style="color: ${textSecondary}; font-size: 14px; line-height: 1.6; margin-top: 28px;">Με εκτίμηση,</p>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          
          ${emailSignature}
        </div>
      </div>
    `;

    const emailPayload: any = {
      from: `${emailSenderName} <${emailFrom}>`,
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

    console.log(`Email resent for SR: ${sr_id} to: ${recipients.join(", ")} (zip: true)`);

    await adminClient.from("surveys").update({ email_sent: true }).eq("id", survey_id);

    return new Response(
      JSON.stringify({ success: true, has_download_link: !!zipDownloadUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Resend survey email error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
