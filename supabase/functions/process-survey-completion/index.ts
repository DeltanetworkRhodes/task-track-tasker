import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

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
  // STORE only (no compression) to minimize CPU usage
  const entries: { name: Uint8Array; dataLen: number; crc: number; offset: number }[] = [];
  const parts: Uint8Array[] = [];
  let offset = 0;

  const encoder = new TextEncoder();

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crcVal = crc32(file.data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true); // bit 11 = UTF-8 filenames
    view.setUint16(8, 0, true); // 0 = STORE (no compression)
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crcVal, true);
    view.setUint32(18, file.data.length, true); // compressed = uncompressed
    view.setUint32(22, file.data.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    entries.push({ name: nameBytes, dataLen: file.data.length, crc: crcVal, offset });
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
    cdView.setUint16(8, 0x0800, true); // bit 11 = UTF-8 filenames
    cdView.setUint16(10, 0, true); // STORE
    cdView.setUint16(12, 0, true);
    cdView.setUint16(14, 0, true);
    cdView.setUint32(16, entry.crc, true);
    cdView.setUint32(20, entry.dataLen, true); // compressed = uncompressed
    cdView.setUint32(24, entry.dataLen, true);
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

// ─── PDF builder from already-downloaded inspection photos ──────────

async function buildInspectionPdf(
  inspectionData: { fileName: string; data: Uint8Array }[],
  srId: string
): Promise<Uint8Array | null> {
  if (inspectionData.length === 0) return null;
  
  try {
    const pdfDoc = await PDFDocument.create();
    
    for (const item of inspectionData) {
      const ext = item.fileName.split(".").pop()?.toLowerCase() || "";
      let image;
      try {
        if (ext === "png") {
          image = await pdfDoc.embedPng(item.data);
        } else {
          image = await pdfDoc.embedJpg(item.data);
        }
      } catch (embedErr) {
        console.error(`Failed to embed image ${item.fileName}:`, embedErr);
        continue;
      }
      
      // A4 dimensions in points (595.28 x 841.89)
      const A4_W = 595.28;
      const A4_H = 841.89;
      const margin = 40;
      const availW = A4_W - margin * 2;
      const availH = A4_H - margin * 2;
      
      const imgW = image.width;
      const imgH = image.height;
      const scale = Math.min(availW / imgW, availH / imgH, 1);
      const drawW = imgW * scale;
      const drawH = imgH * scale;
      
      const page = pdfDoc.addPage([A4_W, A4_H]);
      page.drawImage(image, {
        x: margin + (availW - drawW) / 2,
        y: A4_H - margin - drawH + (availH - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    }
    
    if (pdfDoc.getPageCount() === 0) return null;
    
    const pdfBytes = await pdfDoc.save();
    console.log(`Built inspection PDF: ${pdfDoc.getPageCount()} pages, ${(pdfBytes.length / 1024).toFixed(0)}KB`);
    return new Uint8Array(pdfBytes);
  } catch (pdfErr) {
    console.error("PDF generation error:", pdfErr);
    return null;
  }
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
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
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
    // Complete survey → pre_committed (waiting for GIS upload to move to construction)
    // If GIS already exists → construction
    const newSurveyStatus = isComplete ? "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ" : "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ";
    // Always set pre_committed for complete surveys — construction requires GIS + manual transition
    const newAssignmentStatus = isComplete ? "pre_committed" : "pending";
    
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
        // No size limit — ZIP is uploaded to storage and only a link is sent
        const zipFiles: { name: string; data: Uint8Array }[] = [];
        let totalSize = 0;

        for (const sf of surveyFiles) {
          const fileData = await downloadFile(adminClient, sf.file_path);
          if (fileData) {
            // Prefix with folder name based on type (ASCII for ZIP compatibility)
            const prefix = sf.file_type === "building_photo" ? "PROMELETI/" 
              : sf.file_type === "screenshot" ? "EGRAFA/"
              : sf.file_type === "inspection_form" ? "EGRAFA/"
              : "";
            zipFiles.push({ name: `${prefix}${sf.file_name}`, data: fileData });
            totalSize += fileData.length;
          }
        }

        // Generate PDF from inspection_form photos already in zipFiles (avoid re-downloading)
        const inspectionInZip = zipFiles
          .filter(f => f.name.startsWith("EGRAFA/") && !f.name.endsWith(".pdf"))
          .filter(f => {
            const matchingSf = surveyFiles.find((sf: any) => f.name === `EGRAFA/${sf.file_name}` && sf.file_type === "inspection_form");
            return !!matchingSf;
          })
          .map(f => ({ fileName: f.name.replace("EGRAFA/", ""), data: f.data }));
        
        if (inspectionInZip.length > 0) {
          const pdfData = await buildInspectionPdf(inspectionInZip, sr_id);
          if (pdfData) {
            zipFiles.push({ name: `EGRAFA/Deltio_Autopsias_${sr_id}.pdf`, data: pdfData });
            totalSize += pdfData.length;
            console.log(`Added inspection PDF to ZIP: ${(pdfData.length / 1024).toFixed(0)}KB`);
          }
        }

        console.log(`ZIP: ${zipFiles.length} files, ${(totalSize / 1024 / 1024).toFixed(1)}MB`);

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
        const headerIcon = isComplete ? "📋" : "⚠️";

        // Brand colors matching the app's Dark Industrial identity
        const brandDark = "#1a2332";       // Σκούρο ανθρακί (--background)
        const brandTeal = "#1a9a8a";       // Teal primary
        const brandGreen = "#2d8a4e";      // Green accent
        const brandGradient = "linear-gradient(135deg, #1a9a8a, #2d8a4e)";
        const headerBg = isComplete ? brandGradient : "linear-gradient(135deg, #ea580c, #dc2626)";
        const accentColor = isComplete ? brandTeal : "#ea580c";
        const tableLabelBg = "#f0f4f8";
        const tableBorder = "#d1d9e0";
        const textPrimary = "#1a2332";
        const textSecondary = "#4a5568";
        const textMuted = "#718096";

        const emailFrom = emailSettingsMap["email_from"] || "noreply@deltanetwork.gr";
        const emailReplyTo = emailSettingsMap["email_reply_to"] || "info@deltanetwork.gr";

        const surveyComments = survey?.comments || "";

        const emailHtml = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f7fa;">
            <!-- Header with brand gradient -->
            <div style="background: ${headerBg}; color: white; padding: 24px 28px; border-radius: 12px 12px 0 0;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 24px;">${headerIcon}</span>
                <div>
                  <h2 style="margin: 0; font-size: 18px; font-weight: 700; letter-spacing: 0.3px;">${escapeHtml(statusLabel)}</h2>
                  <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">SR: ${escapeHtml(sr_id)} · ${escapeHtml(area)}</p>
                </div>
              </div>
            </div>
            
            <div style="background: white; border: 1px solid ${tableBorder}; border-top: none; padding: 28px; border-radius: 0 0 12px 12px;">
              <p style="color: ${textSecondary}; font-size: 14px; line-height: 1.7; margin: 0 0 8px;">Αξιότιμοι συνεργάτες,</p>
              <p style="color: ${textSecondary}; font-size: 14px; line-height: 1.7; margin: 0 0 20px;">
                Ο τεχνικός <strong style="color: ${textPrimary};">${escapeHtml(technicianName)}</strong> μετέβη για αυτοψία στο <strong style="color: ${textPrimary};">SR: ${escapeHtml(sr_id)}</strong>.${isComplete ? " Σας αποστέλλουμε τα αρχεία για προδέσμευση υλικών." : " Η αυτοψία είναι ελλιπής."}
              </p>
              
              <!-- Info table -->
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

              ${!isComplete ? `
              <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 14px 18px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                <p style="font-weight: 700; color: #991b1b; font-size: 13px; margin: 0 0 6px;">⚠️ Ελλιπή Αρχεία</p>
                <p style="color: #dc2626; font-size: 14px; margin: 0;">${missingTypes.map(t => t === "building_photo" ? "Φωτογραφίες κτιρίου" : t === "screenshot" ? "Screenshots" : t === "inspection_form" ? "Έντυπο αυτοψίας" : t).join(", ")}</p>
              </div>` : ""}

              ${zipUrl ? `
              <div style="text-align: center; margin: 24px 0;">
                <a href="${zipUrl}" style="background: ${brandDark}; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 700; display: inline-block; letter-spacing: 0.3px;">📥 Λήψη Αρχείων (ZIP)</a>
              </div>
              <p style="color: ${textMuted}; font-size: 11px; text-align: center; margin-top: 4px;">
                ${surveyFiles.length} αρχεία · Ισχύει για 7 ημέρες
              </p>` : ""}

              
              <p style="color: ${textSecondary}; font-size: 14px; line-height: 1.6; margin-top: 28px;">Με εκτίμηση,</p>
              
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              
              <!-- Footer with brand styling -->
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
