import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Google Service Account JWT auth ──
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
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signatureInput
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${payload}.${signatureB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
  }
  return (await tokenRes.json()).access_token;
}

// ── Drive helpers ──
async function driveSearch(
  accessToken: string,
  query: string,
  driveId?: string,
  fallback = false
): Promise<any[]> {
  const SHARED_DRIVE_ID = driveId || "0AN9VpmNEa7QBUk9PVA";
  const corpora = fallback
    ? "allDrives"
    : `drive&driveId=${SHARED_DRIVE_ID}`;

  const url =
    `https://www.googleapis.com/drive/v3/files` +
    `?q=${encodeURIComponent(query)}` +
    `&fields=files(id,name,mimeType,createdTime)` +
    `&pageSize=100` +
    `&supportsAllDrives=true` +
    `&includeItemsFromAllDrives=true` +
    `&corpora=${corpora}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    if (!fallback) return driveSearch(accessToken, query, driveId, true);
    throw new Error(await res.text());
  }
  return (await res.json()).files || [];
}

// Search for a subfolder by name inside a specific parent, with direct list as fallback
async function findSubfolder(
  accessToken: string,
  parentId: string,
  folderName: string
): Promise<string | null> {
  // Method 1: Search query
  const results = await driveSearch(
    accessToken,
    `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`
  );
  if (results.length > 0) return results[0].id;

  // Method 2: List children of parent directly (more reliable for shared drives)
  const listUrl =
    `https://www.googleapis.com/drive/v3/files` +
    `?q=${encodeURIComponent(`'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)}` +
    `&fields=files(id,name)` +
    `&pageSize=100` +
    `&supportsAllDrives=true` +
    `&includeItemsFromAllDrives=true` +
    `&corpora=allDrives`;

  const res = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) {
    const data = await res.json();
    const match = (data.files || []).find(
      (f: any) => f.name.toLowerCase() === folderName.toLowerCase()
    );
    if (match) return match.id;
  }

  return null;
}

async function createDriveFolder(
  accessToken: string,
  name: string,
  parentId: string
): Promise<string> {
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    }
  );
  if (!res.ok) throw new Error(`Create folder failed: ${await res.text()}`);
  return (await res.json()).id;
}

interface DriveUploadResult {
  id: string;
  webViewLink: string;
}

async function uploadFileToDrive(
  accessToken: string,
  fileBytes: Uint8Array,
  fileName: string,
  mimeType: string,
  parentFolderId: string
): Promise<DriveUploadResult> {
  const metadata = JSON.stringify({
    name: fileName,
    parents: [parentFolderId],
  });

  const boundary = "===upload_boundary===";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metaPart =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    metadata;

  const filePart =
    delimiter +
    `Content-Type: ${mimeType}\r\n` +
    "Content-Transfer-Encoding: binary\r\n\r\n";

  const encoder = new TextEncoder();
  const metaBytes = encoder.encode(metaPart);
  const filePartBytes = encoder.encode(filePart);
  const closeBytes = encoder.encode(closeDelimiter);

  const body = new Uint8Array(
    metaBytes.length + filePartBytes.length + fileBytes.length + closeBytes.length
  );
  body.set(metaBytes, 0);
  body.set(filePartBytes, metaBytes.length);
  body.set(fileBytes, metaBytes.length + filePartBytes.length);
  body.set(closeBytes, metaBytes.length + filePartBytes.length + fileBytes.length);

  // Request webViewLink in the response fields
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
  const data = await res.json();
  return { id: data.id, webViewLink: data.webViewLink || "" };
}

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sr_id, category, file_path, file_name } = await req.json();

    if (!sr_id || !category || !file_path) {
      return new Response(
        JSON.stringify({ error: "Missing sr_id, category, or file_path" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth: get service account key
    const serviceAccountKeyRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKeyRaw) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not configured");
    }
    const serviceAccountKey = JSON.parse(serviceAccountKeyRaw);
    const accessToken = await getAccessToken(serviceAccountKey);

    // Step A: Find SR folder in Drive
    const srFolders = await driveSearch(
      accessToken,
      `name contains '${sr_id}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    );

    if (srFolders.length === 0) {
      // SR folder not found — keep file in Storage as fallback, don't delete
      return new Response(
        JSON.stringify({ error: `SR folder not found for ${sr_id}`, uploaded: false, deleted: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pick most recent if multiple
    const srFolder =
      srFolders.length === 1
        ? srFolders[0]
        : srFolders.sort(
            (a: any, b: any) =>
              new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
          )[0];

    // Step B: Find category subfolder — search across ALL SR folders first
    let categoryFolderId: string | null = null;

    // Check all SR folders for existing category subfolder (handles duplicates)
    for (const folder of srFolders) {
      const found = await findSubfolder(accessToken, folder.id, category);
      if (found) {
        categoryFolderId = found;
        console.log(`Found existing '${category}' folder (${found}) in SR folder ${folder.name}`);
        break;
      }
    }

    // Only create if truly not found anywhere
    if (!categoryFolderId) {
      categoryFolderId = await createDriveFolder(accessToken, category, srFolder.id);
      console.log(`Created new '${category}' folder (${categoryFolderId}) in SR folder ${srFolder.name}`);
    }
    }

    // Step D: Download the file from Supabase Storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: fileData, error: downloadErr } = await supabase.storage
      .from("photos")
      .download(file_path);

    if (downloadErr || !fileData) {
      throw new Error(`Failed to download from storage: ${downloadErr?.message || "no data"}`);
    }

    const fileBytes = new Uint8Array(await fileData.arrayBuffer());
    const mimeType = fileData.type || "image/jpeg";
    const finalFileName = file_name || file_path.split("/").pop() || "photo.jpg";

    // Step E: Upload to Drive
    const driveResult = await uploadFileToDrive(
      accessToken,
      fileBytes,
      finalFileName,
      mimeType,
      categoryFolderId
    );

    // Step F (CRITICAL): Delete from Supabase Storage to save costs
    let deleted = false;
    try {
      const { error: removeErr } = await supabase.storage
        .from("photos")
        .remove([file_path]);
      if (removeErr) {
        console.error(`Failed to delete ${file_path} from storage:`, removeErr);
      } else {
        deleted = true;
        console.log(`Deleted ${file_path} from storage after Drive upload`);
      }
    } catch (delErr) {
      console.error(`Storage delete error for ${file_path}:`, delErr);
    }

    return new Response(
      JSON.stringify({
        uploaded: true,
        deleted,
        driveFileId: driveResult.id,
        webViewLink: driveResult.webViewLink,
        srFolderId: srFolder.id,
        categoryFolderId,
        categoryName: category,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("upload-photo-to-drive error:", err);
    return new Response(
      JSON.stringify({ error: err.message, uploaded: false, deleted: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
