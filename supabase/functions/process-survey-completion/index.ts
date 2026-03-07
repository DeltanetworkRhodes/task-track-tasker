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

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  // Use DecompressionStream/CompressionStream unavailable for raw deflate,
  // so we use the "deflate" format and strip the 2-byte header and 4-byte trailer
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }
  const full = new Uint8Array(totalLen);
  let pos = 0;
  for (const c of chunks) { full.set(c, pos); pos += c.length; }
  // Strip zlib header (2 bytes) and adler32 checksum (4 bytes) to get raw deflate
  return full.subarray(2, full.length - 4);
}

async function buildZip(files: { name: string; data: Uint8Array }[]): Promise<Uint8Array> {
  const entries: { name: Uint8Array; compressedData: Uint8Array; uncompressedSize: number; crc: number; offset: number; isCompressed: boolean }[] = [];
  const parts: Uint8Array[] = [];
  let offset = 0;

  const encoder = new TextEncoder();

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crcVal = crc32(file.data);
    
    // Try to compress; only use if smaller
    let compressedData: Uint8Array;
    let isCompressed = false;
    try {
      const deflated = await deflateRaw(file.data);
      if (deflated.length < file.data.length) {
        compressedData = deflated;
        isCompressed = true;
      } else {
        compressedData = file.data;
      }
    } catch {
      compressedData = file.data;
    }

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, isCompressed ? 8 : 0, true); // 8 = deflate, 0 = store
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crcVal, true);
    view.setUint32(18, compressedData.length, true);
    view.setUint32(22, file.data.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    entries.push({ name: nameBytes, compressedData, uncompressedSize: file.data.length, crc: crcVal, offset, isCompressed });
    parts.push(localHeader, compressedData);
    offset += localHeader.length + compressedData.length;
  }

  const centralDirStart = offset;
  for (const entry of entries) {
    const cdHeader = new Uint8Array(46 + entry.name.length);
    const cdView = new DataView(cdHeader.buffer);
    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 20, true);
    cdView.setUint16(8, 0, true);
    cdView.setUint16(10, entry.isCompressed ? 8 : 0, true);
    cdView.setUint16(12, 0, true);
    cdView.setUint16(14, 0, true);
    cdView.setUint32(16, entry.crc, true);
    cdView.setUint32(20, entry.compressedData.length, true);
    cdView.setUint32(24, entry.uncompressedSize, true);
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
      .select("customer_name, address, phone, cab, organization_id")
      .eq("sr_id", sr_id)
      .limit(1)
      .single();

    const orgId = assignment?.organization_id || null;
    const customerName = assignment?.customer_name || "—";
    const address = assignment?.address || "—";
    const phone = assignment?.phone || "";
    const cab = assignment?.cab || "—";

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
        // Limit total ZIP size to 30MB
        const MAX_ZIP_SIZE = 30 * 1024 * 1024;
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
            // Prefix with folder name based on type (ASCII-safe for ZIP compatibility)
            const prefix = sf.file_type === "building_photo" ? "PROMELETI/" 
              : sf.file_type === "screenshot" ? "EGRAFA/"
              : sf.file_type === "inspection_form" ? "EGRAFA/"
              : "";
            zipFiles.push({ name: `${prefix}${sf.file_name}`, data: fileData });
            totalSize += fileData.length;
          }
        }

        console.log(`ZIP: ${zipFiles.length} files, ${(totalSize / 1024 / 1024).toFixed(1)}MB, skipped ${skippedFiles}`);

        // Build ZIP
        const zipData = await buildZip(zipFiles);
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
        const headerColor = isComplete ? "#2563eb" : "#ea580c";
        const headerIcon = isComplete ? "📋" : "⚠️";
        const labelBgColor = isComplete ? "#f0f9ff" : "#fff7ed";
        const labelBorderColor = isComplete ? "#bfdbfe" : "#fed7aa";
        const labelTextColor = isComplete ? "#1e40af" : "#9a3412";

        const emailFrom = emailSettingsMap["email_from"] || "noreply@deltanetwork.gr";
        const emailReplyTo = emailSettingsMap["email_reply_to"] || "info@deltanetwork.gr";

        const surveyComments = survey?.comments || "";

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: ${headerColor}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
              <h2 style="margin: 0; font-size: 18px;">${headerIcon} ${escapeHtml(statusLabel)} — SR: ${escapeHtml(sr_id)}</h2>
              <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Περιοχή: ${escapeHtml(area)}</p>
            </div>
            
            <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
              <p style="color: #374151; font-size: 14px; line-height: 1.6;">Αξιότιμοι συνεργάτες,</p>
              <p style="color: #374151; font-size: 14px; line-height: 1.6;">
                Σας ενημερώνουμε ότι ο τεχνικός <strong>${escapeHtml(technicianName)}</strong> μετέβη για αυτοψία στο <strong>SR: ${escapeHtml(sr_id)}</strong>.${isComplete ? " Σας αποστέλλουμε τα αρχεία για προδέσμευση υλικών." : " Η αυτοψία είναι ελλιπής."}
              </p>
              
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr>
                  <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #374151; width: 120px;">SR ID</td>
                  <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px; font-weight: bold;">${escapeHtml(sr_id)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #374151;">Περιοχή</td>
                  <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${escapeHtml(area)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #374151;">Πελάτης</td>
                  <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${escapeHtml(customerName || "—")}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #374151;">Διεύθυνση</td>
                  <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${escapeHtml(address || "—")}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #374151;">CAB</td>
                  <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${escapeHtml(cab)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; color: #374151;">Τεχνικός</td>
                  <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 14px;">${escapeHtml(technicianName)}</td>
                </tr>
              </table>

              ${surveyComments ? `
              <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
                <p style="font-weight: bold; color: #1f2937; font-size: 13px; margin: 0 0 6px;">📝 Σχόλια:</p>
                <p style="color: #374151; font-size: 14px; margin: 0;">${escapeHtml(surveyComments)}</p>
              </div>` : ""}

              ${!isComplete ? `
              <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
                <p style="font-weight: bold; color: #991b1b; font-size: 13px; margin: 0 0 6px;">⚠️ Ελλιπή αρχεία:</p>
                <p style="color: #dc2626; font-size: 14px; margin: 0;">${missingTypes.map(t => t === "building_photo" ? "Φωτογραφίες κτιρίου" : t === "screenshot" ? "Screenshots" : t === "inspection_form" ? "Έντυπο αυτοψίας" : t).join(", ")}</p>
              </div>` : ""}

              ${zipUrl ? `
              <div style="text-align: center; margin: 20px 0;">
                <a href="${zipUrl}" style="background: #2563eb; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: bold; display: inline-block;">📥 Κατέβασε τα αρχεία (ZIP)</a>
              </div>
              <p style="color: #9ca3af; font-size: 11px; text-align: center; margin-top: 4px;">
                ${surveyFiles.length} αρχεία · Ισχύει για 7 ημέρες
              </p>` : ""}

              ${skippedFiles > 0 ? `
              <p style="color: #ea580c; font-size: 12px; margin-top: 8px;">⚠️ ${skippedFiles} αρχεία παραλείφθηκαν λόγω μεγέθους.</p>` : ""}
              
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
          from: `DeltaNet FTTH <${emailFrom}>`,
          to: recipients,
          reply_to: emailReplyTo,
          subject: `[ΑΥΤΟΨΙΑ] SR: ${sr_id} — ${area}`,
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
