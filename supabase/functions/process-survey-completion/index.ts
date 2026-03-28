import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { zipSync } from "https://esm.sh/fflate@0.8.2";

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

const DEFAULT_SIGNATURE = `<div style="font-size: 12px; color: #718096;">
  <img src="https://task-track-tasker.lovable.app/assets/delta-network-logo.png" alt="Delta Network Inc." style="width: 180px; margin-bottom: 12px; display: block;" />
  <p style="margin: 0; font-weight: 700; color: #1a2332;">Κούλλαρος Μιχαήλ Άγγελος</p>
  <p style="margin: 2px 0; color: #4a5568;">Technical Operations Manager | FTTx Projects | South Aegean</p>
  <p style="margin: 2px 0;">M: +30 690 710 5282 | E: <a href="mailto:info@deltanetwork.gr" style="color: #1a9a8a; text-decoration: none;">info@deltanetwork.gr</a></p>
</div>`;

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

const REQUIRED_FILE_TYPES = ["building_photo", "screenshot"];

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

async function driveSearch(accessToken: string, query: string, useFallback = true): Promise<any[]> {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,createdTime,shortcutDetails(targetId,targetMimeType))&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${SHARED_DRIVE_ID}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    if (useFallback) {
      console.log(`Drive search failed with corpora=drive, falling back to allDrives`);
      const fallbackUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,createdTime,shortcutDetails(targetId,targetMimeType))&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`;
      const fallbackRes = await fetch(fallbackUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!fallbackRes.ok) throw new Error(await fallbackRes.text());
      return (await fallbackRes.json()).files || [];
    }
    throw new Error(await res.text());
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
    console.log(`Assignment drive_folder_url exists but folder is inaccessible for SR ${srId}; falling back to search`);
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

// ─── Build inspection PDF from image bytes using pdf-lib ────────────
async function buildInspectionPdf(
  images: { fileName: string; data: Uint8Array }[]
): Promise<Uint8Array | null> {
  if (images.length === 0) return null;
  try {
    const pdfDoc = await PDFDocument.create();
    for (const item of images) {
      const ext = item.fileName.split(".").pop()?.toLowerCase() || "";
      let image;
      try {
        image = ext === "png" ? await pdfDoc.embedPng(item.data) : await pdfDoc.embedJpg(item.data);
      } catch { continue; }
      const A4_W = 595.28, A4_H = 841.89, margin = 40;
      const availW = A4_W - margin * 2, availH = A4_H - margin * 2;
      const scale = Math.min(availW / image.width, availH / image.height, 1);
      const drawW = image.width * scale, drawH = image.height * scale;
      const page = pdfDoc.addPage([A4_W, A4_H]);
      page.drawImage(image, {
        x: margin + (availW - drawW) / 2,
        y: A4_H - margin - drawH + (availH - drawH) / 2,
        width: drawW, height: drawH,
      });
    }
    if (pdfDoc.getPageCount() === 0) return null;
    const pdfBytes = await pdfDoc.save();
    console.log(`Built inspection PDF: ${pdfDoc.getPageCount()} pages, ${(pdfBytes.length / 1024).toFixed(0)}KB`);
    return new Uint8Array(pdfBytes);
  } catch (err) {
    console.error("PDF error:", err);
    return null;
  }
}

// ─── ZIP builder (STORE method, no compression) ─────────────────────

function buildZipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const centralDir: Uint8Array[] = [];
  const localParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header (30 + name + data)
    const local = new Uint8Array(30 + nameBytes.length + size);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // flags: bit 11 = UTF-8 filenames
    lv.setUint16(8, 0, true); // compression: STORE
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0, true); // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed
    lv.setUint32(22, size, true); // uncompressed
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra length
    local.set(nameBytes, 30);
    local.set(file.data, 30 + nameBytes.length);
    localParts.push(local);

    // Central directory entry (46 + name)
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // flags: bit 11 = UTF-8 filenames
    cv.setUint16(10, 0, true); // compression
    cv.setUint16(12, 0, true); // mod time
    cv.setUint16(14, 0, true); // mod date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // disk
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true); // local header offset
    central.set(nameBytes, 46);
    centralDir.push(central);

    offset += local.length;
  }

  const cdSize = centralDir.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true); // disk
  ev.setUint16(6, 0, true); // disk with cd
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + cdSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const part of localParts) {
    result.set(part, pos);
    pos += part.length;
  }
  for (const cd of centralDir) {
    result.set(cd, pos);
    pos += cd.length;
  }
  result.set(eocd, pos);
  return result;
}

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  const table = getCrc32Table();
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

let _crc32Table: Uint32Array | null = null;
function getCrc32Table(): Uint32Array {
  if (_crc32Table) return _crc32Table;
  _crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    _crc32Table[i] = c >>> 0;
  }
  return _crc32Table;
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

// ─── Download files from Google Drive when no local files exist ──────
async function downloadDriveFiles(
  accessToken: string,
  srId: string,
  preferredFolderUrl?: string
): Promise<{ sf: { file_name: string; file_type: string; folder_path?: string }; data: Uint8Array }[]> {
  console.log(`Fetching files from Google Drive for SR ${srId}...`);

  // Try preferred/best folder first
  let folder = await resolveSrDriveFolder(accessToken, srId, preferredFolderUrl);
  if (!folder) {
    console.log(`No Drive folder found for SR ${srId}`);
    return [];
  }

  console.log(`Found Drive folder: ${folder.name} (${folder.id})`);

  const inferFileTypeFromPath = (relativePath: string): string => {
    const upper = relativePath.toUpperCase();
    if (upper.includes("ΠΡΟΜΕΛΕΤΗ") || upper.includes("ΦΩΤΟ")) return "building_photo";
    if (upper.includes("ΕΓΓΡΑΦΑ") || upper.includes("SCREENSHOT")) return "screenshot";
    return "other";
  };

  const collectFromFolder = async (folderId: string): Promise<{ id: string; name: string; folderPath: string; fileType: string }[]> => {
    const allFiles: { id: string; name: string; folderPath: string; fileType: string }[] = [];
    const visitedFolderIds = new Set<string>();

    const collectFilesRecursive = async (fId: string, currentPath = ""): Promise<void> => {
      if (visitedFolderIds.has(fId)) return;
      visitedFolderIds.add(fId);

      const children = await driveSearch(
        accessToken,
        `'${fId}' in parents and trashed = false`
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

          allFiles.push({
            id: targetId,
            name: childName,
            folderPath: currentPath,
            fileType: inferFileTypeFromPath(childPath),
          });
          continue;
        }

        if (childMimeType.startsWith("application/vnd.google-apps")) {
          console.log(`Skipping non-downloadable Google file: ${childPath} (${childMimeType})`);
          continue;
        }

        allFiles.push({
          id: child.id,
          name: childName,
          folderPath: currentPath,
          fileType: inferFileTypeFromPath(childPath),
        });
      }
    };

    await collectFilesRecursive(folderId);
    return allFiles;
  };

  let allFiles = await collectFromFolder(folder.id);
  console.log(`Found ${allFiles.length} files in Drive folder: ${folder.name}`);

  // If the selected folder is empty, scan all SR-matching folders and pick the first with real files
  if (allFiles.length === 0) {
    console.log(`Selected folder is empty — scanning all matching SR folders for ${srId}...`);
    const escapedSrId = escapeDriveQueryValue(srId);
    const candidates = await driveSearch(
      accessToken,
      `name contains '${escapedSrId}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    );

    const sortedCandidates = candidates
      .filter((c) => c?.id && c.id !== folder.id)
      .sort((a, b) => {
        const scoreDiff = scoreSrFolderCandidate(b?.name || "", srId) - scoreSrFolderCandidate(a?.name || "", srId);
        if (scoreDiff !== 0) return scoreDiff;
        const aTs = a?.createdTime ? Date.parse(a.createdTime) : 0;
        const bTs = b?.createdTime ? Date.parse(b.createdTime) : 0;
        return bTs - aTs;
      });

    for (const candidate of sortedCandidates) {
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
  
  // Download files serially (2 at a time) to manage memory
  const result: { sf: { file_name: string; file_type: string; folder_path?: string }; data: Uint8Array }[] = [];
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
          console.log(`Downloaded: ${file.folderPath ? file.folderPath + "/" : ""}${file.name} (${(data.length / 1024).toFixed(0)}KB)`);
          return {
            sf: {
              file_name: file.name,
              file_type: file.fileType,
              folder_path: file.folderPath,
            },
            data,
          };
        } catch (e: any) {
          console.error(`Download error for ${file.name}: ${e.message}`);
          return null;
        }
      })
    );
    for (const d of downloads) {
      if (d) result.push(d);
    }
  }
  
  console.log(`Successfully downloaded ${result.length}/${allFiles.length} files from Drive`);
  return result;
}

function escapeHtml(str: string): string {
  return str.replace(/[<>&"']/g, (c: string) => `&#${c.charCodeAt(0)};`);
}

// Map file_type to folder path inside ZIP (relative to SR root)
function getZipFolder(fileType: string): string {
  switch (fileType) {
    case "building_photo": return "ΠΡΟΜΕΛΕΤΗ/ΦΩΤΟΓΡΑΦΙΕΣ_ΚΤΙΡΙΟΥ";
    case "screenshot": return "ΕΓΓΡΑΦΑ/SCREENSHOTS";
    case "inspection_pdf": return "ΕΓΓΡΑΦΑ/ΔΕΛΤΙΟ_ΑΥΤΟΨΙΑΣ";
    default: return "ΕΓΓΡΑΦΑ/ΑΛΛΑ";
  }
}

const MAX_ZIP_SIZE_FOR_EMAIL = 15 * 1024 * 1024; // kept for logging reference

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

    // 1. Get assignment + survey info in parallel
    const [assignmentRes, surveyRes] = await Promise.all([
      adminClient.from("assignments")
        .select("customer_name, address, phone, cab, organization_id, drive_folder_url")
        .eq("sr_id", sr_id).limit(1).single(),
      adminClient.from("surveys")
        .select("technician_id, comments")
        .eq("id", survey_id).single(),
    ]);

    const assignment = assignmentRes.data;
    const survey = surveyRes.data;
    const orgId = assignment?.organization_id || null;
    const customerName = assignment?.customer_name || "—";
    const address = assignment?.address || "—";
    const phone = assignment?.phone || "";
    const cab = assignment?.cab || "—";

    // Get technician name + survey files in parallel
    const profilePromise = survey?.technician_id
      ? adminClient.from("profiles").select("full_name").eq("user_id", survey.technician_id).single()
      : Promise.resolve({ data: null });
    const filesPromise = adminClient.from("survey_files").select("*").eq("survey_id", survey_id);

    const [profileRes, filesRes] = await Promise.all([profilePromise, filesPromise]);
    const technicianName = profileRes.data?.full_name || "Technician";
    const surveyFiles = filesRes.data;

    const hasLocalFiles = surveyFiles && surveyFiles.length > 0;

    // For trigger-created surveys with no local files, check if Drive folder already exists
    const existingDriveUrl = assignment?.drive_folder_url || "";
    let hasDriveFolder = !!existingDriveUrl;

    const presentTypes = hasLocalFiles ? [...new Set(surveyFiles.map((f: any) => f.file_type))] : [];
    const missingTypes = REQUIRED_FILE_TYPES.filter((t) => !presentTypes.includes(t));
    // Complete if local files are present and valid, OR if no local files but Drive folder exists
    let isComplete = hasLocalFiles ? missingTypes.length === 0 : hasDriveFolder;

    console.log(`File check: present=${presentTypes.join(",")}, missing=${missingTypes.join(",")}, complete=${isComplete}`);

    // 2. Download ALL files ONCE (used for Drive upload, ZIP, and email)
    const downloadedFiles: { sf: any; data: Uint8Array }[] = [];
    if (hasLocalFiles) {
      const BATCH_SIZE = 3;
      for (let i = 0; i < surveyFiles.length; i += BATCH_SIZE) {
        const batch = surveyFiles.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (sf: any) => {
            const data = await downloadFile(adminClient, sf.file_path);
            return data ? { sf, data } : null;
          })
        );
        for (const r of results) {
          if (r) downloadedFiles.push(r);
        }
      }
      console.log(`Downloaded ${downloadedFiles.length}/${surveyFiles.length} files`);
    } else if (Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY")) {
      // No local survey_files — always try Drive by SR, even if drive_folder_url is missing/stale
      console.log(`No local survey_files — trying Google Drive download for SR ${sr_id}...`);
      try {
        const saKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY")!;
        const serviceAccountKey = JSON.parse(saKeyStr);
        const driveAccessToken = await getAccessToken(serviceAccountKey);
        const driveFiles = await downloadDriveFiles(driveAccessToken, sr_id, existingDriveUrl);
        for (const df of driveFiles) {
          downloadedFiles.push(df);
        }
        if (driveFiles.length > 0) hasDriveFolder = true;
        console.log(`Downloaded ${downloadedFiles.length} files from Drive for ZIP creation`);
      } catch (driveDownloadErr: any) {
        console.error(`Drive download error: ${driveDownloadErr.message}`);
      }
    } else {
      console.log(`No local survey_files and no Drive folder — skipping file processing`);
    }

    if (!hasLocalFiles) {
      isComplete = hasDriveFolder || downloadedFiles.length > 0;
      console.log(`Drive-backed completeness for SR ${sr_id}: folder=${hasDriveFolder}, files=${downloadedFiles.length}, complete=${isComplete}`);
    }

    // 3. Google Drive: create folder structure & upload
    const folderName = `${sr_id} - ${customerName}`;
    let driveFolderUrl = "";
    let driveTargetType = "";
    let filesUploadedCount = 0;
    let inspectionPdfBytes: Uint8Array | null = null;

    const serviceAccountKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    let accessToken = "";

    if (serviceAccountKeyStr) {
      try {
        const serviceAccountKey = JSON.parse(serviceAccountKeyStr);
        accessToken = await getAccessToken(serviceAccountKey);

        const target = await getTargetParentFolder(accessToken, area, isComplete);
        if (target) {
          driveTargetType = target.folderType;

          // Search by SR ID (contains) instead of exact name to avoid duplicates
          const escapedSrIdForFolder = sr_id.replace(/'/g, "\\'");
          const existingInTarget = await driveSearch(
            accessToken,
            `name contains '${escapedSrIdForFolder}' and '${target.folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
          );

          // Pick the best match by score
          const scoredInTarget = existingInTarget
            .map(f => ({ ...f, score: scoreSrFolderCandidate(f.name, sr_id) }))
            .filter(f => f.score > 0)
            .sort((a, b) => b.score - a.score);

          let folder: any;
          if (scoredInTarget.length > 0) {
            folder = scoredInTarget[0];
            console.log(`Found existing folder in ${target.folderType}: ${folder.name} (${folder.id})`);
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
                // Also search by contains in the other folder
                const existingInOther = await driveSearch(
                  accessToken,
                  `name contains '${escapedSrIdForFolder}' and '${otherFolders[0].id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
                );
                const scoredInOther = existingInOther
                  .map(f => ({ ...f, score: scoreSrFolderCandidate(f.name, sr_id) }))
                  .filter(f => f.score > 0)
                  .sort((a, b) => b.score - a.score);
                if (scoredInOther.length > 0) {
                  await moveDriveFile(accessToken, scoredInOther[0].id, otherFolders[0].id, target.folderId);
                  folder = scoredInOther[0];
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

          // Create subfolders in parallel
          const [egrafaFolder, promelethFolder] = await Promise.all([
            findOrCreateFolder(accessToken, "ΕΓΓΡΑΦΑ", folder.id),
            findOrCreateFolder(accessToken, "ΠΡΟΜΕΛΕΤΗ", folder.id),
          ]);

          // Upload files using already-downloaded data (2 concurrent uploads)
          const UPLOAD_BATCH = 2;
          const uploadQueue = downloadedFiles.map(({ sf, data }) => {
            const targetFolder = sf.file_type === "building_photo" ? promelethFolder : egrafaFolder;
            return { sf, data, targetFolder };
          });

          for (let i = 0; i < uploadQueue.length; i += UPLOAD_BATCH) {
            const batch = uploadQueue.slice(i, i + UPLOAD_BATCH);
            const results = await Promise.all(
              batch.map(async ({ sf, data, targetFolder }) => {
                try {
                  const uploaded = await uploadFileToDrive(accessToken, sf.file_name, getMime(sf.file_name), data, targetFolder.id);
                  filesUploadedCount++;
                } catch (e: any) {
                  console.error(`Drive upload failed for ${sf.file_name}: ${e.message}`);
                }
                return null;
              })
            );
          }

          // Generate PDF locally with pdf-lib from inspection images, then upload to Drive
          const inspectionImages = downloadedFiles
            .filter(({ sf }) => sf.file_type === "inspection_form" && !sf.file_name.endsWith(".pdf"))
            .map(({ sf, data }) => ({ fileName: sf.file_name, data }));

          if (inspectionImages.length > 0) {
            const totalImageSize = inspectionImages.reduce((s, i) => s + i.data.length, 0);
            if (totalImageSize <= 8 * 1024 * 1024) {
              console.log(`Building inspection PDF from ${inspectionImages.length} images (${(totalImageSize / 1024 / 1024).toFixed(1)}MB)`);
              inspectionPdfBytes = await buildInspectionPdf(inspectionImages);
              if (inspectionPdfBytes) {
                try {
                  await uploadFileToDrive(accessToken, `Deltio_Autopsias_${sr_id}.pdf`, "application/pdf", inspectionPdfBytes, egrafaFolder.id);
                  console.log(`Uploaded inspection PDF to Drive ΕΓΓΡΑΦΑ`);
                } catch (e: any) {
                  console.error(`PDF Drive upload failed: ${e.message}`);
                }
              }
            } else {
              console.log(`Skipping PDF: inspection images too large (${(totalImageSize / 1024 / 1024).toFixed(1)}MB > 8MB)`);
            }
          }

          // Only update drive_folder_url if we actually uploaded files (avoid overwriting with empty folder)
          if (filesUploadedCount > 0) {
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
            console.log(`Updated drive_folder_url for SR ${sr_id}`);
          } else {
            console.log(`No files uploaded — keeping existing drive_folder_url for SR ${sr_id}`);
          }
        }
      } catch (driveErr) {
        console.error("Drive error (non-blocking):", driveErr);
      }
    }

    // 4. Update status based on completeness — but don't downgrade trigger-created surveys
    if (hasLocalFiles || !hasDriveFolder) {
      const newSurveyStatus = isComplete ? "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ" : "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ";
      const newAssignmentStatus = isComplete ? "pre_committed" : "pending";
      
      await Promise.all([
        adminClient.from("assignments").update({ status: newAssignmentStatus }).eq("sr_id", sr_id),
        adminClient.from("surveys").update({ status: newSurveyStatus }).eq("id", survey_id),
      ]);
      
      console.log(`Assignment ${sr_id} status → ${newAssignmentStatus}, Survey → ${newSurveyStatus}`);
    } else {
      console.log(`Skipping status update for trigger-created survey with existing Drive folder`);
    }

    // 5. Build ZIP and upload to Storage, then create signed download URL
    let zipBytes: Uint8Array | null = null;
    let zipDownloadUrl = "";
    let zipTooLarge = false;
    
    // First check total size of downloaded files to avoid building a huge ZIP
    const totalDownloadedSize = downloadedFiles.reduce((s, { data }) => s + data.length, 0);
    const estimatedZipSize = totalDownloadedSize + (downloadedFiles.length * 100); // STORE zip overhead
    
    if (estimatedZipSize > MAX_ZIP_SIZE_FOR_EMAIL) {
      console.log(`Files too large for email attachment (${(totalDownloadedSize / 1024 / 1024).toFixed(1)}MB), will upload to storage`);
      zipTooLarge = true;
    }

    try {
      // Build folder name: SR_XXXXXXX_ΠΕΛΑΤΗΣ
      const safeName = (customerName || "").replace(/[\/\\:*?"<>|]/g, "_").trim();
      const rootFolder = `SR ${sr_id}${safeName ? ` ${safeName}` : ""}`;
      
      const zipFiles: { name: string; data: Uint8Array }[] = downloadedFiles.map(({ sf, data }) => ({
        name: sf.folder_path
          ? `${rootFolder}/${String(sf.folder_path).replace(/^\/+|\/+$/g, "")}/${sf.file_name}`
          : `${rootFolder}/${getZipFolder(sf.file_type)}/${sf.file_name}`,
        data,
      }));
      
      // Add inspection PDF to ZIP if generated
      if (inspectionPdfBytes) {
        zipFiles.push({
          name: `${rootFolder}/ΕΓΓΡΑΦΑ/ΔΕΛΤΙΟ_ΑΥΤΟΨΙΑΣ/Deltio_Autopsias_${sr_id}.pdf`,
          data: inspectionPdfBytes,
        });
      }
      
      if (zipFiles.length > 0) {
        const zipInput: Record<string, Uint8Array> = {};
        for (const file of zipFiles) zipInput[file.name] = file.data;
        zipBytes = zipSync(zipInput, { level: 6 });
        console.log(`Built ZIP: ${zipFiles.length} files, ${(zipBytes.length / 1024 / 1024).toFixed(1)}MB, root=${rootFolder}`);

        // Always upload ZIP to storage for signed URL
        const safeSrId = sr_id.replace(/[^a-zA-Z0-9_-]/g, "_");
        const zipStoragePath = `surveys/${safeSrId}/Autopsia_${safeSrId}.zip`;

        const { error: uploadErr } = await adminClient.storage
          .from("photos")
          .upload(zipStoragePath, zipBytes, {
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
    } catch (zipErr) {
      console.error("ZIP build error (non-blocking):", zipErr);
    }

    // Free downloaded files memory BEFORE base64 conversion
    downloadedFiles.length = 0;
    inspectionPdfBytes = null;

    // 6. Send email only when ZIP link exists (never fallback to Drive link)
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

    if (!zipDownloadUrl) {
      console.error(`Skipping email for SR ${sr_id}: ZIP link not available`);
    } else if (resendApiKey && recipients.length > 0) {
      try {
        const statusLabel = isComplete ? "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ" : "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ";
        const headerIcon = isComplete ? "📋" : "⚠️";
        const brandTeal = "#1a9a8a";
        const brandDark = "#1a2332";
        const headerBg = isComplete ? "linear-gradient(135deg, #1a9a8a, #2d8a4e)" : "linear-gradient(135deg, #ea580c, #dc2626)";
        const tableLabelBg = "#f0f4f8";
        const tableBorder = "#d1d9e0";
        const textPrimary = "#1a2332";
        const textSecondary = "#4a5568";
        const textMuted = "#718096";

        const emailFrom = emailSettingsMap["email_from"] || "noreply@deltanetwork.gr";
        const emailReplyTo = emailSettingsMap["email_reply_to"] || "info@deltanetwork.gr";
        const emailSenderName = emailSettingsMap["email_sender_name"] || "DeltaNet FTTH";
        const emailSignature = emailSettingsMap["email_signature"] || DEFAULT_SIGNATURE;
        const surveyComments = survey?.comments || "";

        // ZIP-only email (never include Drive folder fallback)
        const showDownloadLink = !!zipDownloadUrl;

        const emailHtml = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f7fa;">
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
                <p style="color: #dc2626; font-size: 14px; margin: 0;">${missingTypes.map(t => t === "building_photo" ? "Φωτογραφίες κτιρίου" : t === "screenshot" ? "Screenshots" : t).join(", ")}</p>
              </div>` : ""}


              ${showDownloadLink ? `
              <div style="text-align: center; margin: 24px 0;">
                <a href="${zipDownloadUrl}" style="background: ${brandDark}; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 700; display: inline-block; letter-spacing: 0.3px;">📥 Λήψη Αρχείων (ZIP)</a>
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
          const errText = await emailRes.text();
          console.error("Resend error:", errText);
        } else {
          console.log(`Email sent to: ${recipients.join(", ")} (zip link: ${showDownloadLink})`);
          emailSent = true;
        }
        
        if (emailSent) {
          await adminClient
            .from("surveys")
            .update({ email_sent: true })
            .eq("id", survey_id);
        }
      } catch (emailErr) {
        console.error("Email error (non-blocking):", emailErr);
      }
    }

    // Free ZIP memory
    zipBytes = null;

    return new Response(
      JSON.stringify({
        success: true,
        is_complete: isComplete,
        missing_types: missingTypes,
        folder_name: folderName,
        drive_folder_url: driveFolderUrl || null,
        drive_target: driveTargetType,
        email_sent: emailSent,
        zip_available: !!zipDownloadUrl,
        files_count: filesUploadedCount,
      }),
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
