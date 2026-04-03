import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getAccessToken(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    iss: serviceAccountKey.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  }));
  const pemContent = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(`${header}.${payload}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const jwt = `${header}.${payload}.${sigB64}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  return (await tokenRes.json()).access_token;
}

const SHARED_DRIVE_ID = "0AN9VpmNEa7QBUk9PVA";

async function driveSearch(accessToken: string, query: string, fallback = false): Promise<any[]> {
  const corpora = fallback ? "allDrives" : `drive&driveId=${SHARED_DRIVE_ID}`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,createdTime)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=${corpora}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    if (!fallback) return driveSearch(accessToken, query, true);
    return [];
  }
  return (await res.json()).files || [];
}

function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

const normalizedMap = new Map<string, string>();
const mapping: Record<string, string> = {
  "ΣΚΑΜΑ": "ΣΚΑΜΑ", "ΣΚΑΜΜΑ": "ΣΚΑΜΑ", "SKAMA": "ΣΚΑΜΑ",
  "ΟΔΕΥΣΗ": "ΟΔΕΥΣΗ", "ODEFSI": "ΟΔΕΥΣΗ",
  "BCP": "BCP", "BEP": "BEP", "BMO": "BMO", "FB": "FB",
  "FLOOR BOX": "FB", "FLOORBOX": "FB",
  "ΚΑΜΠΙΝΑ": "ΚΑΜΠΙΝΑ", "KAMPINA": "ΚΑΜΠΙΝΑ",
  "Γ_ΦΑΣΗ": "Γ_ΦΑΣΗ", "Γ ΦΑΣΗ": "Γ_ΦΑΣΗ", "G_FASI": "Γ_ΦΑΣΗ", "Γ' ΦΑΣΗ": "Γ_ΦΑΣΗ",
};
for (const [k, v] of Object.entries(mapping)) {
  normalizedMap.set(normalizeName(k), v);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const saKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!saKeyStr) throw new Error("No GOOGLE_SERVICE_ACCOUNT_KEY");
    const accessToken = await getAccessToken(JSON.parse(saKeyStr));

    const { data: constructions } = await supabase.from("constructions").select("id, sr_id, photo_counts");
    const results: any[] = [];
    let updated = 0, skipped = 0;

    for (const c of (constructions || [])) {
      try {
        const folders = await driveSearch(accessToken,
          `name contains '${c.sr_id}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        if (folders.length === 0) { skipped++; continue; }

        const folder = folders.sort((a: any, b: any) =>
          new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime())[0];

        const subfolders = await driveSearch(accessToken,
          `'${folder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);

        const photoCounts: Record<string, number> = {};
        for (const sub of subfolders) {
          const normalized = normalizeName(sub.name);
          const categoryKey = normalizedMap.get(normalized);
          if (!categoryKey) continue;

          const files = await driveSearch(accessToken,
            `'${sub.id}' in parents and mimeType contains 'image/' and trashed = false`);
          if (files.length > 0) photoCounts[categoryKey] = files.length;
        }

        if (Object.keys(photoCounts).length > 0) {
          await supabase.from("constructions").update({ photo_counts: photoCounts }).eq("id", c.id);
          results.push({ sr_id: c.sr_id, counts: photoCounts });
          updated++;
        } else {
          skipped++;
        }
      } catch (e: any) {
        results.push({ sr_id: c.sr_id, error: e.message });
      }
    }

    return new Response(JSON.stringify({ updated, skipped, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
