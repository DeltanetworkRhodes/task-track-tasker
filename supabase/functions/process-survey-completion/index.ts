import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const greekMonths: Record<number, string> = {
  0: "ΙΑΝΟΥΑΡΙΟΣ", 1: "ΦΕΒΡΟΥΑΡΙΟΣ", 2: "ΜΑΡΤΙΟΣ",
  3: "ΑΠΡΙΛΙΟΣ", 4: "ΜΑΙΟΣ", 5: "ΙΟΥΝΙΟΣ",
  6: "ΙΟΥΛΙΟΣ", 7: "ΑΥΓΟΥΣΤΟΣ", 8: "ΣΕΠΤΕΜΒΡΙΟΣ",
  9: "ΟΚΤΩΒΡΙΟΣ", 10: "ΝΟΕΜΒΡΙΟΣ", 11: "ΔΕΚΕΜΒΡΙΟΣ",
};

const SHARED_DRIVE_ID = "0AN9VpmNEa7QBUk9PVA";

const areaRootFolders: Record<string, string> = {
  "ΡΟΔΟΣ": "1JvcSG3tiOplSujXhb3yj_ELQLjfrgOzO",
  "ΚΩΣ": "1X1mtK4tV_sgGM9IdizNSK7AS19qX1nYl",
};

const REQUIRED_FILE_TYPES = ["building_photo", "screenshot", "inspection_form"];

// ─── Google Drive helpers ────────────────────────────────────────────

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

async function driveSearch(accessToken: string, query: string): Promise<any[]> {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${SHARED_DRIVE_ID}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).files || [];
}

async function createDriveFolder(accessToken: string, name: string, parentId: string): Promise<any> {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  if (!res.ok) throw new Error(`Create folder failed: ${await res.text()}`);
  return await res.json();
}

async function uploadFileToDrive(
  accessToken: string, fileName: string, mimeType: string,
  fileData: Uint8Array, parentId: string
): Promise<any> {
  const metadata = { name: fileName, parents: [parentId] };
  const initRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(fileData.byteLength),
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!initRes.ok) throw new Error(`Upload init failed: ${await initRes.text()}`);
  
  const uploadUrl = initRes.headers.get("Location");
  if (!uploadUrl) throw new Error("No upload URL returned");

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(fileData.byteLength),
    },
    body: fileData,
  });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${await uploadRes.text()}`);
  return await uploadRes.json();
}

async function moveDriveFile(accessToken: string, fileId: string, fromParentId: string, toParentId: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${toParentId}&removeParents=${fromParentId}&supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    }
  );
  if (!res.ok) throw new Error(`Move failed: ${await res.text()}`);
}

async function findOrCreateFolder(accessToken: string, name: string, parentId: string): Promise<any> {
  const existing = await driveSearch(
    accessToken,
    `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  if (existing.length > 0) return existing[0];
  return await createDriveFolder(accessToken, name, parentId);
}

async function getTargetParentFolder(
  accessToken: string, area: string, isComplete: boolean
): Promise<{ folderId: string; folderType: string } | null> {
  const rootId = areaRootFolders[area];
  if (!rootId) return null;

  const currentMonth = greekMonths[new Date().getMonth()];
  const monthFolder = await findOrCreateFolder(accessToken, currentMonth, rootId);
  const targetName = isComplete ? "ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ" : "ΑΝΑΜΟΝΗ";
  const targetFolder = await findOrCreateFolder(accessToken, targetName, monthFolder.id);

  return { folderId: targetFolder.id, folderType: targetName };
}

// ─── Minimal ZIP builder (no external deps) ─────────────────────────

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const entries: { name: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];
  const parts: Uint8Array[] = [];
  let offset = 0;

  const encoder = new TextEncoder();

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true);  // signature
    view.setUint16(4, 20, true);           // version needed
    view.setUint16(6, 0, true);            // flags
    view.setUint16(8, 0, true);            // compression: store
    view.setUint16(10, 0, true);           // mod time
    view.setUint16(12, 0, true);           // mod date
    view.setUint32(14, crc, true);
    view.setUint32(18, file.data.length, true); // compressed
    view.setUint32(22, file.data.length, true); // uncompressed
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);           // extra field length
    localHeader.set(nameBytes, 30);

    entries.push({ name: nameBytes, data: file.data, crc, offset });
    parts.push(localHeader, file.data);
    offset += localHeader.length + file.data.length;
  }

  const centralDirStart = offset;
  for (const entry of entries) {
    const cdHeader = new Uint8Array(46 + entry.name.length);
    const cdView = new DataView(cdHeader.buffer);
    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 20, true);
    cdView.setUint16(8, 0, true);
    cdView.setUint16(10, 0, true);
    cdView.setUint16(12, 0, true);
    cdView.setUint16(14, 0, true);
    cdView.setUint32(16, entry.crc, true);
    cdView.setUint32(20, entry.data.length, true);
    cdView.setUint32(24, entry.data.length, true);
    cdView.setUint16(28, entry.name.length, true);
    cdView.setUint16(30, 0, true);
    cdView.setUint16(32, 0, true);
    cdView.setUint16(34, 0, true);
    cdView.setUint16(36, 0, true);
    cdView.setUint32(38, 0, true);
    cdView.setUint32(42, entry.offset, true);
    cdHeader.set(entry.name, 46);
    parts.push(cdHeader);
    offset += cdHeader.length;
  }

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, offset - centralDirStart, true);
  endView.setUint32(16, centralDirStart, true);
  endView.setUint16(20, 0, true);
  parts.push(endRecord);

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }
  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function downloadFile(adminClient: any, filePath: string): Promise<Uint8Array | null> {
  const { data, error } = await adminClient.storage.from("surveys").download(filePath);
  if (error || !data) {
    console.error(`Failed to download ${filePath}:`, error);
    return null;
  }
  return new Uint8Array(await data.arrayBuffer());
}

const mimeMap: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", pdf: "application/pdf",
};

function getMime(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return mimeMap[ext] || "application/octet-stream";
}

function escapeHtml(str: string): string {
  return str.replace(/[<>&"']/g, (c: string) => `&#${c.charCodeAt(0)};`);
}

// ─── Main handler ────────────────────────────────────────────────────

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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === serviceRoleKey;
    if (!isServiceRole) {
      const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { survey_id, sr_id, area } = await req.json();
    if (!survey_id || !sr_id || !area) {
      return new Response(JSON.stringify({ error: "Missing survey_id, sr_id or area" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing survey: SR ${sr_id}, area ${area}`);

    // 1. Get assignment info
    const { data: assignment } = await adminClient
      .from("assignments")
      .select("customer_name, address, phone, organization_id")
      .eq("sr_id", sr_id)
      .limit(1)
      .single();

    const orgId = assignment?.organization_id || null;
    const customerName = assignment?.customer_name || "UNKNOWN";
    const address = assignment?.address || "";
    const phone = assignment?.phone || "";

    // 2. Get survey info
    const { data: survey } = await adminClient
      .from("surveys")
      .select("technician_id, comments")
      .eq("id", survey_id)
      .single();

    let technicianName = "Technician";
    if (survey?.technician_id) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("full_name")
        .eq("user_id", survey.technician_id)
        .single();
      technicianName = profile?.full_name || "Technician";
    }

    // 3. Get survey files
    const { data: surveyFiles } = await adminClient
      .from("survey_files")
      .select("*")
      .eq("survey_id", survey_id);

    if (!surveyFiles || surveyFiles.length === 0) {
      return new Response(JSON.stringify({ error: "No files found for survey" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const presentTypes = [...new Set(surveyFiles.map((f: any) => f.file_type))];
    const missingTypes = REQUIRED_FILE_TYPES.filter((t) => !presentTypes.includes(t));
    const isComplete = missingTypes.length === 0;

    console.log(`File check: present=${presentTypes.join(",")}, missing=${missingTypes.join(",")}, complete=${isComplete}`);

    // 4. Google Drive: create folder structure & upload files ONE BY ONE
    const folderName = `${sr_id} - ${customerName}`;
    let driveFolderUrl = "";
    let driveTargetType = "";
    let filesUploadedCount = 0;

    const serviceAccountKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (serviceAccountKeyStr) {
      try {
        const serviceAccountKey = JSON.parse(serviceAccountKeyStr);
        const accessToken = await getAccessToken(serviceAccountKey);

        const target = await getTargetParentFolder(accessToken, area, isComplete);
        if (target) {
          driveTargetType = target.folderType;

          const existingInTarget = await driveSearch(
            accessToken,
            `name = '${folderName}' and '${target.folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
          );

          let folder: any;
          if (existingInTarget.length > 0) {
            folder = existingInTarget[0];
          } else {
            const otherTargetName = isComplete ? "ΑΝΑΜΟΝΗ" : "ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ";
            const rootId = areaRootFolders[area];
            const currentMonth = greekMonths[new Date().getMonth()];
            const monthFolders = await driveSearch(
              accessToken,
              `name = '${currentMonth}' and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
            );

            if (monthFolders.length > 0) {
              const otherFolders = await driveSearch(
                accessToken,
                `name = '${otherTargetName}' and '${monthFolders[0].id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
              );
              if (otherFolders.length > 0) {
                const existingInOther = await driveSearch(
                  accessToken,
                  `name = '${folderName}' and '${otherFolders[0].id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
                );
                if (existingInOther.length > 0) {
                  await moveDriveFile(accessToken, existingInOther[0].id, otherFolders[0].id, target.folderId);
                  folder = existingInOther[0];
                  console.log(`Moved folder from ${otherTargetName} to ${target.folderType}`);
                }
              }
            }

            if (!folder) {
              folder = await createDriveFolder(accessToken, folderName, target.folderId);
              console.log(`Created folder: ${folder.name} in ${target.folderType}`);
            }
          }

          driveFolderUrl = folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`;

          // Create subfolders
          const egrafaFolder = await findOrCreateFolder(accessToken, "ΕΓΓΡΑΦΑ", folder.id);
          const promelethFolder = await findOrCreateFolder(accessToken, "ΠΡΟΜΕΛΕΤΗ", folder.id);

          // Upload files ONE BY ONE to save memory
          const buildingFiles = surveyFiles.filter((f: any) => f.file_type === "building_photo");
          for (const sf of buildingFiles) {
            const fileData = await downloadFile(adminClient, sf.file_path);
            if (fileData) {
              await uploadFileToDrive(accessToken, sf.file_name, getMime(sf.file_name), fileData, promelethFolder.id);
              filesUploadedCount++;
            }
          }

          const screenshotFiles = surveyFiles.filter((f: any) => f.file_type === "screenshot");
          for (const sf of screenshotFiles) {
            const fileData = await downloadFile(adminClient, sf.file_path);
            if (fileData) {
              await uploadFileToDrive(accessToken, sf.file_name, getMime(sf.file_name), fileData, egrafaFolder.id);
              filesUploadedCount++;
            }
          }

          const inspectionFiles = surveyFiles.filter((f: any) => f.file_type === "inspection_form");
          for (const sf of inspectionFiles) {
            const fileData = await downloadFile(adminClient, sf.file_path);
            if (fileData) {
              await uploadFileToDrive(accessToken, sf.file_name, getMime(sf.file_name), fileData, egrafaFolder.id);
              filesUploadedCount++;
            }
          }

          // Update assignment with Drive folder URLs
          const egrafaUrl = egrafaFolder.webViewLink || `https://drive.google.com/drive/folders/${egrafaFolder.id}`;
          const promeletiUrl = promelethFolder.webViewLink || `https://drive.google.com/drive/folders/${promelethFolder.id}`;
          await adminClient
            .from("assignments")
            .update({ 
              drive_folder_url: driveFolderUrl,
              drive_egrafa_url: egrafaUrl,
              drive_promeleti_url: promeletiUrl,
            })
            .eq("sr_id", sr_id);
        }
      } catch (driveErr) {
        console.error("Drive error (non-blocking):", driveErr);
      }
    }

    // 5. Update status based on completeness
    let newAssignmentStatus = isComplete ? "construction" : "pending";
    const newSurveyStatus = isComplete ? "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ" : "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ";

    if (!isComplete) {
      const { data: gisExists } = await adminClient
        .from("gis_data")
        .select("id")
        .eq("sr_id", sr_id)
        .maybeSingle();
      if (gisExists) {
        newAssignmentStatus = "pre_committed";
      }
    }
    
    await adminClient
      .from("assignments")
      .update({ status: newAssignmentStatus })
      .eq("sr_id", sr_id);
    
    await adminClient
      .from("surveys")
      .update({ status: newSurveyStatus })
      .eq("id", survey_id);
    
    console.log(`Assignment ${sr_id} status → ${newAssignmentStatus}, Survey → ${newSurveyStatus}`);

    // 6. Build ZIP and send email — ALWAYS (complete or incomplete)
    let emailSent = false;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const { data: orgEmailSettings } = await adminClient
      .from("org_settings")
      .select("setting_key, setting_value")
      .eq("organization_id", orgId);

    const emailSettingsMap: Record<string, string> = {};
    (orgEmailSettings || []).forEach((s: any) => {
      emailSettingsMap[s.setting_key] = s.setting_value;
    });

    const toEmails = emailSettingsMap["report_to_emails"] || "";
    const ccEmails = emailSettingsMap["report_cc_emails"] || "";
    const recipients = toEmails.split(",").map((e: string) => e.trim()).filter(Boolean);
    const ccRecipients = ccEmails.split(",").map((e: string) => e.trim()).filter(Boolean);

    if (resendApiKey && recipients.length > 0) {
      try {
        // Download files for ZIP (one by one, keep in array)
        // Limit total ZIP size to ~8MB to stay within memory limits
        const MAX_ZIP_SIZE = 12 * 1024 * 1024;
        const zipFiles: { name: string; data: Uint8Array }[] = [];
        let totalSize = 0;
        let skippedFiles = 0;

        for (const sf of surveyFiles) {
          const fileData = await downloadFile(adminClient, sf.file_path);
          if (fileData) {
            if (totalSize + fileData.length > MAX_ZIP_SIZE) {
              skippedFiles++;
              console.log(`Skipping ${sf.file_name} (ZIP size limit)`);
              continue;
            }
            // Prefix with folder name based on type
            const prefix = sf.file_type === "building_photo" ? "ΠΡΟΜΕΛΕΤΗ/" 
              : sf.file_type === "screenshot" ? "ΕΓΓΡΑΦΑ/"
              : sf.file_type === "inspection_form" ? "ΕΓΓΡΑΦΑ/"
              : "";
            zipFiles.push({ name: `${prefix}${sf.file_name}`, data: fileData });
            totalSize += fileData.length;
          }
        }

        console.log(`ZIP: ${zipFiles.length} files, ${(totalSize / 1024 / 1024).toFixed(1)}MB, skipped ${skippedFiles}`);

        // Build ZIP
        const zipData = buildZip(zipFiles);
        // Free file references
        zipFiles.length = 0;

        // Upload ZIP to storage
        const zipFileName = `${sr_id}_survey_${Date.now()}.zip`;
        const zipStoragePath = `zips/${zipFileName}`;
        const { error: uploadErr } = await adminClient.storage
          .from("surveys")
          .upload(zipStoragePath, zipData, {
            contentType: "application/zip",
            upsert: true,
          });

        if (uploadErr) {
          console.error("ZIP upload error:", uploadErr);
        }

        // Generate signed URL (7 days)
        const { data: signedUrlData } = await adminClient.storage
          .from("surveys")
          .createSignedUrl(zipStoragePath, 60 * 60 * 24 * 7);

        const zipUrl = signedUrlData?.signedUrl || "";

        const statusLabel = isComplete ? "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ" : "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ";
        const statusColor = isComplete ? "#2e7d32" : "#e65100";

        const emailHtml = `
          <div style="font-family:Arial,sans-serif;padding:20px;">
            <h2 style="color:#1a73e8;">Αυτοψία - ${escapeHtml(sr_id)}</h2>
            <div style="display:inline-block;padding:4px 12px;border-radius:4px;background:${statusColor};color:#fff;font-weight:bold;margin-bottom:16px;">
              ${statusLabel}
            </div>
            <table style="border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">SR ID:</td><td>${escapeHtml(sr_id)}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Πελάτης:</td><td>${escapeHtml(customerName)}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Διεύθυνση:</td><td>${escapeHtml(address) || "—"}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Τηλέφωνο:</td><td>${escapeHtml(phone) || "—"}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Περιοχή:</td><td>${escapeHtml(area)}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Τεχνικός:</td><td>${escapeHtml(technicianName)}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Αρχεία:</td><td>${surveyFiles.length} αρχεία</td></tr>
              ${!isComplete ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;color:${statusColor};">Λείπουν:</td><td style="color:${statusColor};">${missingTypes.join(", ")}</td></tr>` : ""}
              ${driveFolderUrl ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Drive:</td><td><a href="${driveFolderUrl}">Άνοιγμα φακέλου</a></td></tr>` : ""}
            </table>
            ${zipUrl ? `<p><a href="${zipUrl}" style="display:inline-block;padding:10px 20px;background:#1a73e8;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">📥 Λήψη αρχείων (ZIP)</a></p>` : ""}
            ${skippedFiles > 0 ? `<p style="color:#999;font-size:12px;">⚠️ ${skippedFiles} αρχεία παραλείφθηκαν λόγω μεγέθους. Δείτε τα στο Google Drive.</p>` : ""}
            <p style="color:#666;font-size:13px;">Ο σύνδεσμος ZIP ισχύει για 7 ημέρες.</p>
          </div>
        `;

        const emailPayload: any = {
          from: `DeltaNet FTTH <${emailSettingsMap["email_from"] || "onboarding@resend.dev"}>`,
          to: recipients,
          subject: `Αυτοψία ${sr_id} - ${customerName} - ${statusLabel}`,
          html: emailHtml,
        };

        if (ccRecipients.length > 0) {
          emailPayload.cc = ccRecipients;
        }

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(emailPayload),
        });

        if (!emailRes.ok) {
          console.error("Resend error:", await emailRes.text());
        } else {
          console.log(`Email sent to: ${recipients.join(", ")}`);
          emailSent = true;
          await adminClient
            .from("surveys")
            .update({ email_sent: true })
            .eq("id", survey_id);
        }
      } catch (emailErr) {
        console.error("Email error (non-blocking):", emailErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        is_complete: isComplete,
        missing_types: missingTypes,
        folder_name: folderName,
        drive_folder_url: driveFolderUrl || null,
        drive_target: driveTargetType,
        email_sent: emailSent,
        files_count: filesUploadedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Process survey error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
