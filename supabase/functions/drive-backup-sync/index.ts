import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function getAccessToken(serviceAccountKey: any): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccountKey.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj: any) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsignedToken = `${enc(header)}.${enc(claim)}`;

  const keyData = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");

  const binaryKey = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsignedToken));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${unsignedToken}.${sig}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function findOrCreateFolder(accessToken: string, name: string, parentId: string, sharedDriveId?: string): Promise<string> {
  // Search for existing folder
  const q = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)${sharedDriveId ? `&corpora=drive&driveId=${sharedDriveId}&includeItemsFromAllDrives=true&supportsAllDrives=true` : ""}`;
  const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

  // Create folder
  const metadata: any = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentId],
  };
  const createRes = await fetch(`https://www.googleapis.com/drive/v3/files?supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  const created = await createRes.json();
  return created.id;
}

async function uploadFileToDrive(accessToken: string, fileName: string, mimeType: string, fileData: Uint8Array, parentId: string): Promise<any> {
  const metadata = { name: fileName, parents: [parentId] };
  const boundary = "backup_boundary_" + Date.now();
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${uint8ToBase64(fileData)}\r\n--${boundary}--`;

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all active organizations
    const { data: orgs } = await supabase.from("organizations").select("id, name").eq("status", "active");

    const results: any[] = [];

    for (const org of (orgs || [])) {
      // Get org settings
      const { data: settings } = await supabase
        .from("org_settings")
        .select("setting_key, setting_value")
        .eq("organization_id", org.id)
        .in("setting_key", ["service_account_key", "shared_drive_id", "area_root_folders"]);

      const settingsMap = new Map((settings || []).map((s: any) => [s.setting_key, s.setting_value]));
      const saKeyStr = settingsMap.get("service_account_key");
      const sharedDriveId = settingsMap.get("shared_drive_id");

      if (!saKeyStr || !sharedDriveId) {
        results.push({ org: org.name, skipped: true, reason: "No service account or drive ID" });
        continue;
      }

      let saKey: any;
      try { saKey = JSON.parse(saKeyStr); } catch { continue; }

      const accessToken = await getAccessToken(saKey);

      // Parse area root folders
      let areaFolders: { area: string; folderId: string }[] = [];
      try { areaFolders = JSON.parse(settingsMap.get("area_root_folders") || "[]"); } catch {}

      if (areaFolders.length === 0) {
        results.push({ org: org.name, skipped: true, reason: "No area folders configured" });
        continue;
      }

      // Get all assignments with files in storage that have a drive_folder_url
      const { data: assignments } = await supabase
        .from("assignments")
        .select("id, sr_id, area, drive_folder_url, status")
        .eq("organization_id", org.id)
        .not("status", "eq", "pending");

      let synced = 0;
      let errors = 0;

      for (const assignment of (assignments || [])) {
        try {
          // Find the area's root folder
          const areaFolder = areaFolders.find(af => af.area === assignment.area);
          if (!areaFolder) continue;

          // Get surveys with files for this assignment
          const { data: surveys } = await supabase
            .from("surveys")
            .select("id")
            .eq("organization_id", org.id)
            .eq("sr_id", assignment.sr_id);

          if (!surveys || surveys.length === 0) continue;

          // Check survey_files
          const surveyIds = surveys.map((s: any) => s.id);
          const { data: surveyFiles } = await supabase
            .from("survey_files")
            .select("id, file_name, file_path, file_type")
            .in("survey_id", surveyIds);

          if (!surveyFiles || surveyFiles.length === 0) continue;

          // Create/find SR folder in Drive
          const srFolderName = assignment.sr_id;

          // Determine parent - use ΑΥΤΟΨΙΕΣ subfolder
          const surveyParent = await findOrCreateFolder(accessToken, "ΑΥΤΟΨΙΕΣ", areaFolder.folderId, sharedDriveId);
          const srFolder = await findOrCreateFolder(accessToken, srFolderName, surveyParent, sharedDriveId);

          // Check which files already exist in Drive
          const existingQ = `'${srFolder}' in parents and trashed=false`;
          const existingUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(existingQ)}&fields=files(name)&corpora=drive&driveId=${sharedDriveId}&includeItemsFromAllDrives=true&supportsAllDrives=true`;
          const existingRes = await fetch(existingUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
          const existingData = await existingRes.json();
          const existingNames = new Set((existingData.files || []).map((f: any) => f.name));

          // Upload missing files
          for (const file of surveyFiles) {
            if (existingNames.has(file.file_name)) continue;

            // Determine bucket based on file_type
            const bucket = file.file_type === "gis" ? "gis-files" : "surveys";
            const { data: fileData, error: dlError } = await supabase.storage.from(bucket).download(file.file_path);
            if (dlError || !fileData) { errors++; continue; }

            const arrayBuf = await fileData.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuf);
            const mimeType = file.file_name.endsWith(".pdf") ? "application/pdf" : 
                             file.file_name.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" :
                             file.file_name.match(/\.(jpg|jpeg)$/i) ? "image/jpeg" :
                             file.file_name.endsWith(".png") ? "image/png" : "application/octet-stream";

            await uploadFileToDrive(accessToken, file.file_name, mimeType, uint8, srFolder);
            synced++;
          }

          // Update drive_folder_url if not set
          if (!assignment.drive_folder_url) {
            await supabase
              .from("assignments")
              .update({ drive_folder_url: `https://drive.google.com/drive/folders/${srFolder}` })
              .eq("id", assignment.id);
          }
        } catch (e: any) {
          console.error(`Error syncing ${assignment.sr_id}:`, e.message);
          errors++;
        }
      }

      results.push({ org: org.name, synced, errors });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Drive backup error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
