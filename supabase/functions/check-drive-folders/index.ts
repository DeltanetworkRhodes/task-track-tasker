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

// Search folders that may contain SR subfolders
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

    // Fetch assignments in target statuses
    const targetStatuses = ["pre_committed", "waiting_ote", "construction"];
    const { data: assignments, error: fetchErr } = await supabase
      .from("assignments")
      .select("id, sr_id, status, area, customer_name, technician_id, organization_id")
      .in("status", targetStatuses);

    if (fetchErr) throw fetchErr;
    if (!assignments || assignments.length === 0) {
      return new Response(
        JSON.stringify({ checked: 0, reverted: 0, details: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Checking ${assignments.length} assignments for Drive folders...`);

    const reverted: any[] = [];

    for (const assignment of assignments) {
      const found = await driveSearchFolder(accessToken, assignment.sr_id);
      
      if (!found) {
        console.log(`Drive folder MISSING for SR ${assignment.sr_id} (${assignment.status}) → reverting to inspection`);

        // Revert to inspection
        const { error: updateErr } = await supabase
          .from("assignments")
          .update({ 
            status: "inspection",
            comments: (assignment as any).comments 
              ? `${(assignment as any).comments}\n\n[ΑΥΤΟΜΑΤΟ]: Επαναφορά σε αυτοψία - Λείπει ο φάκελος Google Drive`
              : `[ΑΥΤΟΜΑΤΟ]: Επαναφορά σε αυτοψία - Λείπει ο φάκελος Google Drive`
          })
          .eq("id", assignment.id);

        if (updateErr) {
          console.error(`Failed to revert ${assignment.sr_id}:`, updateErr);
          continue;
        }

        // Notify technician
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

    console.log(`Done. Checked: ${assignments.length}, Reverted: ${reverted.length}`);

    return new Response(
      JSON.stringify({
        checked: assignments.length,
        reverted: reverted.length,
        details: reverted,
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
