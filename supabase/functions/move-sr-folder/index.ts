import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

  if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
  return (await tokenRes.json()).access_token;
}

async function driveSearch(accessToken: string, query: string, sharedDriveId: string): Promise<any[]> {
  const url =
    `https://www.googleapis.com/drive/v3/files` +
    `?q=${encodeURIComponent(query)}` +
    `&fields=files(id,name,mimeType,parents)` +
    `&pageSize=100` +
    `&supportsAllDrives=true` +
    `&includeItemsFromAllDrives=true` +
    `&corpora=drive&driveId=${sharedDriveId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    // Fallback to allDrives
    const fallbackUrl =
      `https://www.googleapis.com/drive/v3/files` +
      `?q=${encodeURIComponent(query)}` +
      `&fields=files(id,name,mimeType,parents)` +
      `&pageSize=100` +
      `&supportsAllDrives=true` +
      `&includeItemsFromAllDrives=true` +
      `&corpora=allDrives`;
    const fallbackRes = await fetch(fallbackUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!fallbackRes.ok) throw new Error(await fallbackRes.text());
    return (await fallbackRes.json()).files || [];
  }
  return (await res.json()).files || [];
}

async function findOrCreateFolder(accessToken: string, name: string, parentId: string): Promise<any> {
  const q = `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const url =
    `https://www.googleapis.com/drive/v3/files` +
    `?q=${encodeURIComponent(q)}` +
    `&fields=files(id,name)` +
    `&pageSize=10` +
    `&supportsAllDrives=true` +
    `&includeItemsFromAllDrives=true` +
    `&corpora=allDrives`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.ok) {
    const data = await res.json();
    if (data.files?.length > 0) return data.files[0];
  }

  // Create
  const createRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name&supportsAllDrives=true",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    }
  );
  if (!createRes.ok) throw new Error(`Create folder failed: ${await createRes.text()}`);
  return await createRes.json();
}

async function moveFile(accessToken: string, fileId: string, newParentId: string, oldParentId: string): Promise<any> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${newParentId}&removeParents=${oldParentId}&fields=id,name,parents&supportsAllDrives=true`;
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
    const { sr_id, target_folder, organization_id } = await req.json();

    if (!sr_id || !target_folder) {
      return new Response(
        JSON.stringify({ error: "Missing sr_id or target_folder" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get org settings for Drive config
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get service account key from org_settings or env
    let serviceAccountKey: any;
    let sharedDriveId = "";

    if (organization_id) {
      const { data: settings } = await supabase
        .from("org_settings")
        .select("setting_key, setting_value")
        .eq("organization_id", organization_id)
        .in("setting_key", ["service_account_key", "shared_drive_id"]);

      const settingsMap = new Map((settings || []).map((s: any) => [s.setting_key, s.setting_value]));
      const saKeyStr = settingsMap.get("service_account_key");
      sharedDriveId = settingsMap.get("shared_drive_id") || "";

      if (saKeyStr) {
        try { serviceAccountKey = JSON.parse(saKeyStr); } catch {}
      }
    }

    // Fallback to env
    if (!serviceAccountKey) {
      const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
      if (!raw) {
        return new Response(
          JSON.stringify({ error: "No Google service account configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      serviceAccountKey = JSON.parse(raw);
    }
    if (!sharedDriveId) sharedDriveId = "0AN9VpmNEa7QBUk9PVA";

    const accessToken = await getAccessToken(serviceAccountKey);

    // Find the SR folder
    console.log(`Searching for SR folder: ${sr_id}`);
    const srFolders = await driveSearch(
      accessToken,
      `name contains '${sr_id}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      sharedDriveId
    );

    if (srFolders.length === 0) {
      console.log(`No folder found for SR ${sr_id}`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `No Drive folder found for SR ${sr_id}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const srFolder = srFolders.find((f: any) => f.name.includes(sr_id)) || srFolders[0];
    console.log(`Found SR folder: ${srFolder.name} (${srFolder.id})`);

    // Get current parent
    const fileInfoRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${srFolder.id}?fields=id,name,parents&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!fileInfoRes.ok) throw new Error(`Failed to get file info: ${await fileInfoRes.text()}`);
    const fileInfo = await fileInfoRes.json();
    const currentParentId = fileInfo.parents?.[0];

    if (!currentParentId) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "No parent folder found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get parent's parent (month folder) by walking up
    const parentInfoRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${currentParentId}?fields=id,name,parents&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!parentInfoRes.ok) throw new Error(`Failed to get parent info`);
    const parentInfo = await parentInfoRes.json();

    // Determine month folder — the SR could be in a sub-category folder (ΠΡΟΔΕΣΜΕΥΣΗ, ΣΕ ΚΑΤΑΣΚΕΥΗ, etc.)
    // or directly in the month folder. Walk up until we find the month folder.
    const greekMonths = [
      "ΙΑΝΟΥΑΡΙΟΣ", "ΦΕΒΡΟΥΑΡΙΟΣ", "ΜΑΡΤΙΟΣ", "ΑΠΡΙΛΙΟΣ",
      "ΜΑΙΟΣ", "ΙΟΥΝΙΟΣ", "ΙΟΥΛΙΟΣ", "ΑΥΓΟΥΣΤΟΣ",
      "ΣΕΠΤΕΜΒΡΙΟΣ", "ΟΚΤΩΒΡΙΟΣ", "ΝΟΕΜΒΡΙΟΣ", "ΔΕΚΕΜΒΡΙΟΣ",
    ];

    let monthFolderId: string;

    if (greekMonths.includes(parentInfo.name)) {
      // Current parent IS the month folder
      monthFolderId = currentParentId;
    } else {
      // Current parent is a category folder, its parent should be the month folder
      monthFolderId = parentInfo.parents?.[0] || currentParentId;
    }

    console.log(`Month folder: ${monthFolderId}, moving to: ${target_folder}`);

    // Find or create target folder inside month folder
    const targetFolder = await findOrCreateFolder(accessToken, target_folder, monthFolderId);
    console.log(`Target folder: ${targetFolder.name} (${targetFolder.id})`);

    // Move the SR folder
    const moved = await moveFile(accessToken, srFolder.id, targetFolder.id, currentParentId);
    console.log(`Moved SR folder "${moved.name}" to "${target_folder}"`);

    return new Response(
      JSON.stringify({
        success: true,
        moved: true,
        folder_name: srFolder.name,
        folder_id: srFolder.id,
        destination: target_folder,
        destination_id: targetFolder.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("move-sr-folder error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
