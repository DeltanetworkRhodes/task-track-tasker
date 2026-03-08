import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

const SHARED_DRIVE_ID = "0AN9VpmNEa7QBUk9PVA";

const SEARCH_FOLDER_IDS = [
  "1JvcSG3tiOplSujXhb3yj_ELQLjfrgOzO", // ΡΟΔΟΣ
  "1X1mtK4tV_sgGM9IdizNSK7AS19qX1nYl", // ΚΩΣ
  "1dal55zb0uv5__e1pDk2fLFMB0ogi1OnZ", // ΠΡΟΔΕΣΜΕΥΣΗ ΓΙΑ ΚΑΤΑΣΚΕΥΗ
  "16Dr_1g6AkaypkyoePwcfZ8IanPX5TXeZ", // ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ
  "1azAHjT8LS8R3JOq0jYNh1UdBx4SYn-iM", // ΠΑΡΑΔΩΤΕΑ
  "1pIRjzexYG_JVFkoqfaG2_o_YfziGoFy_", // ΜΑΡΤΙΟΣ
];

async function driveSearchFolder(accessToken: string, srId: string): Promise<boolean> {
  for (const folderId of SEARCH_FOLDER_IDS) {
    const query = `name contains '${srId}' and '${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${SHARED_DRIVE_ID}`;
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) continue;
    const data = await res.json();
    if (data.files && data.files.length > 0) return true;
  }
  return false;
}

// Check if a Drive folder has any files (not just subfolders)
async function driveFolderHasFiles(accessToken: string, srId: string): Promise<boolean> {
  // First find the folder
  for (const folderId of SEARCH_FOLDER_IDS) {
    const query = `name contains '${srId}' and '${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${SHARED_DRIVE_ID}`;
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) continue;
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      const srFolderId = data.files[0].id;
      // Check for any files recursively inside this folder (files + subfolders' files)
      const filesQuery = `'${srFolderId}' in parents and trashed = false`;
      const filesUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(filesQuery)}&fields=files(id,mimeType)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${SHARED_DRIVE_ID}`;
      const filesRes = await fetch(filesUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!filesRes.ok) continue;
      const filesData = await filesRes.json();
      // Has content (files or subfolders with content)
      return filesData.files && filesData.files.length > 0;
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check if called with auth (manual trigger) or as cron
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabaseAuth = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claimsData.claims.sub;
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", userId).single();
      if (!roleData || (roleData.role !== "admin" && roleData.role !== "super_admin")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get Google Drive access token
    const serviceAccountKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKeyStr) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_SERVICE_ACCOUNT_KEY not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const serviceAccountKey = JSON.parse(serviceAccountKeyStr);
    const accessToken = await getAccessToken(serviceAccountKey);

    // === PART 1: Check advanced statuses for MISSING folders → revert to inspection ===
    const revertStatuses = ["pre_committed", "waiting_ote", "construction"];
    const { data: advancedAssignments, error: fetchErr1 } = await supabase
      .from("assignments")
      .select("id, sr_id, status, area, customer_name, technician_id, organization_id, comments")
      .in("status", revertStatuses);

    if (fetchErr1) throw fetchErr1;

    const reverted: any[] = [];

    for (const assignment of (advancedAssignments || [])) {
      const found = await driveSearchFolder(accessToken, assignment.sr_id);
      
      if (!found) {
        console.log(`Drive folder MISSING for SR ${assignment.sr_id} (${assignment.status}) → reverting to inspection`);

        const { error: updateErr } = await supabase
          .from("assignments")
          .update({ 
            status: "inspection",
            comments: assignment.comments 
              ? `${assignment.comments}\n\n[ΑΥΤΟΜΑΤΟ]: Επαναφορά σε αυτοψία - Λείπει ο φάκελος Google Drive`
              : `[ΑΥΤΟΜΑΤΟ]: Επαναφορά σε αυτοψία - Λείπει ο φάκελος Google Drive`
          })
          .eq("id", assignment.id);

        if (updateErr) {
          console.error(`Failed to revert ${assignment.sr_id}:`, updateErr);
          continue;
        }

        if (assignment.technician_id) {
          await supabase.from("notifications").insert({
            user_id: assignment.technician_id,
            title: "Επαναφορά σε Αυτοψία",
            message: `Το SR ${assignment.sr_id} (${assignment.area}) επέστρεψε σε αυτοψία γιατί λείπει ο φάκελος Google Drive.`,
            data: { assignment_id: assignment.id, sr_id: assignment.sr_id },
            organization_id: assignment.organization_id,
          });
        }

        reverted.push({
          sr_id: assignment.sr_id,
          area: assignment.area,
          old_status: assignment.status,
        });
      }
    }

    // === PART 2: Check pending/inspection assignments → promote to pre_committed ===
    // First check DB for existing Drive URLs, then fallback to Drive API
    const promoteStatuses = ["pending", "inspection"];
    const { data: earlyAssignments, error: fetchErr2 } = await supabase
      .from("assignments")
      .select("id, sr_id, status, area, customer_name, technician_id, organization_id, comments, drive_folder_url, drive_egrafa_url, drive_promeleti_url")
      .in("status", promoteStatuses);

    if (fetchErr2) throw fetchErr2;

    const promoted: any[] = [];

    for (const assignment of (earlyAssignments || [])) {
      // Fast path: if DB already has Drive URLs, promote immediately
      const hasDbUrls = assignment.drive_folder_url || assignment.drive_egrafa_url || assignment.drive_promeleti_url;
      const hasFiles = hasDbUrls || await driveFolderHasFiles(accessToken, assignment.sr_id);
      
      if (hasFiles) {
        console.log(`Drive folder WITH files found for SR ${assignment.sr_id} (${assignment.status}) → promoting to pre_committed`);

        const { error: updateErr } = await supabase
          .from("assignments")
          .update({ 
            status: "pre_committed",
            comments: assignment.comments 
              ? `${assignment.comments}\n\n[ΑΥΤΟΜΑΤΟ]: Προαγωγή σε Προδέσμευση - Βρέθηκε φάκελος Google Drive με αρχεία`
              : `[ΑΥΤΟΜΑΤΟ]: Προαγωγή σε Προδέσμευση - Βρέθηκε φάκελος Google Drive με αρχεία`
          })
          .eq("id", assignment.id);

        if (updateErr) {
          console.error(`Failed to promote ${assignment.sr_id}:`, updateErr);
          continue;
        }

        // Auto-fetch Drive folder URLs for the promoted assignment
        try {
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
          // Use google-drive-files to get folder URLs
          for (const folderId of SEARCH_FOLDER_IDS) {
            const query = `name contains '${assignment.sr_id}' and '${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
            const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${SHARED_DRIVE_ID}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (!res.ok) continue;
            const data = await res.json();
            if (data.files && data.files.length > 0) {
              const srFolder = data.files[0];
              // Find ΕΓΓΡΑΦΑ and ΠΡΟΜΕΛΕΤΗ subfolders
              const subQuery = `'${srFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
              const subUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(subQuery)}&fields=files(id,name,webViewLink)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${SHARED_DRIVE_ID}`;
              const subRes = await fetch(subUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
              let egrafaUrl = null, promeletiUrl = null;
              if (subRes.ok) {
                const subData = await subRes.json();
                for (const sub of (subData.files || [])) {
                  if (sub.name === "ΕΓΓΡΑΦΑ") egrafaUrl = sub.webViewLink;
                  if (sub.name === "ΠΡΟΜΕΛΕΤΗ") promeletiUrl = sub.webViewLink;
                }
              }
              await supabase.from("assignments").update({
                drive_folder_url: srFolder.webViewLink || null,
                drive_egrafa_url: egrafaUrl,
                drive_promeleti_url: promeletiUrl,
              }).eq("id", assignment.id);
              break;
            }
          }
        } catch (driveErr) {
          console.error(`Drive URL fetch error for ${assignment.sr_id}:`, driveErr);
        }

        if (assignment.technician_id) {
          await supabase.from("notifications").insert({
            user_id: assignment.technician_id,
            title: "Προαγωγή σε Προδέσμευση",
            message: `Το SR ${assignment.sr_id} (${assignment.area}) προχώρησε αυτόματα σε Προδέσμευση Υλικών - βρέθηκε φάκελος Drive.`,
            data: { assignment_id: assignment.id, sr_id: assignment.sr_id },
            organization_id: assignment.organization_id,
          });
        }

        promoted.push({
          sr_id: assignment.sr_id,
          area: assignment.area,
          old_status: assignment.status,
        });
      }
    }

    console.log(`Done. Reverted: ${reverted.length}, Promoted: ${promoted.length}`);

    return new Response(
      JSON.stringify({
        checked: (advancedAssignments?.length || 0) + (earlyAssignments?.length || 0),
        reverted: reverted.length,
        promoted: promoted.length,
        revertDetails: reverted,
        promoteDetails: promoted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("check-drive-folders error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
