import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SHARED_DRIVE_ID = "0AN9VpmNEa7QBUk9PVA";

const areaRootFolders: Record<string, string> = {
  "ΡΟΔΟΣ": "1JvcSG3tiOplSujXhb3yj_ELQLjfrgOzO",
  "ΚΩΣ": "1X1mtK4tV_sgGM9IdizNSK7AS19qX1nYl",
};

const greekMonths: Record<number, string> = {
  0: "ΙΑΝΟΥΑΡΙΟΣ", 1: "ΦΕΒΡΟΥΑΡΙΟΣ", 2: "ΜΑΡΤΙΟΣ",
  3: "ΑΠΡΙΛΙΟΣ", 4: "ΜΑΙΟΣ", 5: "ΙΟΥΝΙΟΣ",
  6: "ΙΟΥΛΙΟΣ", 7: "ΑΥΓΟΥΣΤΟΣ", 8: "ΣΕΠΤΕΜΒΡΙΟΣ",
  9: "ΟΚΤΩΒΡΙΟΣ", 10: "ΝΟΕΜΒΡΙΟΣ", 11: "ΔΕΚΕΜΒΡΙΟΣ",
};

// ─── Google Drive helpers ────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

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
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,parents)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${SHARED_DRIVE_ID}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).files || [];
}

async function findOrCreateFolder(accessToken: string, name: string, parentId: string): Promise<any> {
  const existing = await driveSearch(
    accessToken,
    `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  if (existing.length > 0) return existing[0];

  // Create the folder
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

/**
 * Move a file/folder to a new parent using the Drive API.
 * This adds the new parent and removes the old parent in a single PATCH call.
 */
async function moveFile(accessToken: string, fileId: string, newParentId: string, oldParentId: string): Promise<any> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${newParentId}&removeParents=${oldParentId}&fields=id,name,parents,webViewLink&supportsAllDrives=true`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Move file failed: ${await res.text()}`);
  return await res.json();
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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

    const { sr_id, area, assignment_id } = await req.json();

    if (!sr_id || !area) {
      return new Response(JSON.stringify({ error: "Missing sr_id or area" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize area to uppercase for folder lookup
    const areaUpper = area.toUpperCase();
    const areaFolderId = areaRootFolders[areaUpper];
    if (!areaFolderId) {
      console.log(`Area "${areaUpper}" not found in areaRootFolders, skipping folder move`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `Area "${areaUpper}" not mapped` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Google credentials
    const serviceAccountKeyRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKeyRaw) {
      return new Response(JSON.stringify({ error: "GOOGLE_SERVICE_ACCOUNT_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const serviceAccountKey = JSON.parse(serviceAccountKeyRaw);
    const accessToken = await getAccessToken(serviceAccountKey);

    // Search for the SR folder by name pattern (starts with SR_ID)
    // The folder is inside: AREA → MONTH → ΠΡΟΔΕΣΜΕΥΣΗ ΓΙΑ ΚΑΤΑΣΚΕΥΗ → SR_folder
    // We search across all months since we don't know which month it was created in
    console.log(`Searching for SR folder: ${sr_id} in area: ${areaUpper}`);

    // Search for folder containing sr_id in name, under the area root
    const srFolders = await driveSearch(
      accessToken,
      `name contains '${sr_id}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    );

    if (srFolders.length === 0) {
      console.log(`No folder found for SR ${sr_id}`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `No Drive folder found for SR ${sr_id}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the right folder - it should be named like "SR_ID - NAME - ADDRESS"
    const srFolder = srFolders.find(f => f.name.startsWith(sr_id)) || srFolders[0];
    console.log(`Found SR folder: ${srFolder.name} (${srFolder.id})`);

    // Get the current parent (should be ΠΡΟΔΕΣΜΕΥΣΗ ΓΙΑ ΚΑΤΑΣΚΕΥΗ or ΑΝΑΜΟΝΗ)
    // We need to fetch the file with parents field
    const fileInfoRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${srFolder.id}?fields=id,name,parents&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!fileInfoRes.ok) throw new Error(`Failed to get file info: ${await fileInfoRes.text()}`);
    const fileInfo = await fileInfoRes.json();
    const currentParentId = fileInfo.parents?.[0];

    if (!currentParentId) {
      console.log("No parent found for SR folder");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "No parent folder found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the parent folder info (should be ΠΡΟΔΕΣΜΕΥΣΗ ΓΙΑ ΚΑΤΑΣΚΕΥΗ or similar)
    const parentInfoRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${currentParentId}?fields=id,name,parents&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!parentInfoRes.ok) throw new Error(`Failed to get parent info: ${await parentInfoRes.text()}`);
    const parentInfo = await parentInfoRes.json();

    // The month folder is the parent of ΠΡΟΔΕΣΜΕΥΣΗ ΓΙΑ ΚΑΤΑΣΚΕΥΗ (or the parent itself if it's directly in month)
    let monthFolderId = parentInfo.parents?.[0] || currentParentId;

    // Check if the current parent IS a month folder (its name matches a Greek month)
    const monthNames = Object.values(greekMonths);
    if (monthNames.includes(parentInfo.name)) {
      // The SR folder is directly in the month folder
      monthFolderId = currentParentId;
    }

    console.log(`Month folder ID: ${monthFolderId}, current parent: ${parentInfo.name} (${currentParentId})`);

    // Find or create ΑΚΥΡΩΜΕΝΕΣ ΚΑΤΑΣΚΕΥΕΣ folder inside the month folder
    const cancelledFolder = await findOrCreateFolder(accessToken, "ΑΚΥΡΩΜΕΝΕΣ ΚΑΤΑΣΚΕΥΕΣ", monthFolderId);
    console.log(`Cancelled folder: ${cancelledFolder.name} (${cancelledFolder.id})`);

    // Move the SR folder
    const moved = await moveFile(accessToken, srFolder.id, cancelledFolder.id, currentParentId);
    console.log(`Moved SR folder to ΑΚΥΡΩΜΕΝΕΣ ΚΑΤΑΣΚΕΥΕΣ: ${moved.name}`);

    return new Response(
      JSON.stringify({
        success: true,
        moved: true,
        folder_name: srFolder.name,
        folder_id: srFolder.id,
        destination: cancelledFolder.name,
        destination_id: cancelledFolder.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error moving cancelled folder:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
