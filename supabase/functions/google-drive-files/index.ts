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
    const err = await tokenRes.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

const SHARED_DRIVE_ID = "0AN9VpmNEa7QBUk9PVA";

async function driveSearch(
  accessToken: string,
  query: string,
  fallback = false
): Promise<any[]> {
  const corpora = fallback
    ? "allDrives"
    : `drive&driveId=${SHARED_DRIVE_ID}`;

  const url =
    `https://www.googleapis.com/drive/v3/files` +
    `?q=${encodeURIComponent(query)}` +
    `&fields=files(id,name,mimeType,thumbnailLink,webViewLink,size,createdTime)` +
    `&pageSize=100` +
    `&supportsAllDrives=true` +
    `&includeItemsFromAllDrives=true` +
    `&corpora=${corpora}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    if (!fallback) return driveSearch(accessToken, query, true);
    throw new Error(await res.text());
  }
  const data = await res.json();
  return data.files || [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", userId).single();
    if (!roleData || !["admin", "super_admin", "technician"].includes(roleData.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, folder_id, file_id, sr_id } = body;

    const serviceAccountKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKeyStr) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_SERVICE_ACCOUNT_KEY not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceAccountKey = JSON.parse(serviceAccountKeyStr);
    const accessToken = await getAccessToken(serviceAccountKey);

    // Search for SR folder and list all contents with subfolders
    if (action === "sr_folder" && sr_id) {
      // Αναζήτηση σε ΟΛΟ το Shared Drive χωρίς περιορισμό σε συγκεκριμένους φακέλους
      const folders = await driveSearch(
        accessToken,
        `name contains '${sr_id}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      );

      if (folders.length === 0) {
        return new Response(
          JSON.stringify({ found: false, sr_id, folder: null, subfolders: {} }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Αν βρεθούν πολλοί, προτίμησε τον πιο πρόσφατο
      const folder = folders.length === 1
        ? folders[0]
        : folders.sort((a: any, b: any) =>
            new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
          )[0];
      
      // List subfolders
      const subfolders = await driveSearch(
        accessToken,
        `'${folder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      );

      // List files in main folder
      const mainFiles = await driveSearch(
        accessToken,
        `'${folder.id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`
      );

      // List files in each subfolder
      const subfoldersData: any = {};
      for (const sub of subfolders) {
        const files = await driveSearch(
          accessToken,
          `'${sub.id}' in parents and trashed = false`
        );
        subfoldersData[sub.name] = {
          id: sub.id,
          webViewLink: sub.webViewLink,
          files,
        };
      }

      return new Response(
        JSON.stringify({
          found: true,
          sr_id,
          folder: {
            id: folder.id,
            name: folder.name,
            webViewLink: folder.webViewLink,
          },
          files: mainFiles,
          subfolders: subfoldersData,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "list") {
      const query = folder_id
        ? `'${folder_id}' in parents and trashed = false`
        : "trashed = false";
      const files = await driveSearch(accessToken, query);
      return new Response(JSON.stringify({ files }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "download" && file_id) {
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file_id}?fields=name,mimeType&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!metaRes.ok) throw new Error(await metaRes.text());
      const meta = await metaRes.json();

      const fileRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file_id}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!fileRes.ok) throw new Error(await fileRes.text());
      const fileBlob = await fileRes.blob();

      const supabase = createClient(supabaseUrl, serviceRoleKey);

      const filePath = `drive/${file_id}/${meta.name}`;
      const { error: uploadError } = await supabase.storage
        .from("photos")
        .upload(filePath, fileBlob, {
          contentType: meta.mimeType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage
        .from("photos")
        .getPublicUrl(filePath);

      return new Response(
        JSON.stringify({
          success: true,
          file_name: meta.name,
          storage_path: filePath,
          public_url: publicUrl.publicUrl,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'sr_folder', 'list', or 'download'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
