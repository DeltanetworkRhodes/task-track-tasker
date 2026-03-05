const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getAccessToken(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    iss: serviceAccountKey.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  }));
  const pemContent = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${header}.${payload}.${sig}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  return (await tokenRes.json()).access_token;
}

async function listFolder(accessToken: string, folderId: string): Promise<any[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return (await res.json()).files || [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const saKey = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY")!);
    const accessToken = await getAccessToken(saKey);
    
    const rhodosRoot = "1JvcSG3tiOplSujXhb3yj_ELQLjfrgOzO";
    const kosRoot = "1X1mtK4tV_sgGM9IdizNSK7AS19qX1nYl";
    
    const rhodosChildren = await listFolder(accessToken, rhodosRoot);
    const kosChildren = await listFolder(accessToken, kosRoot);
    
    // Try to go deeper - find subfolders
    const results: any = { rhodosRoot: rhodosChildren, kosRoot: kosChildren, deeper: {} };
    
    for (const child of rhodosChildren) {
      if (child.mimeType === "application/vnd.google-apps.folder") {
        const subChildren = await listFolder(accessToken, child.id);
        results.deeper[`ΡΟΔΟΣ/${child.name}`] = subChildren.map((f: any) => ({ name: f.name, id: f.id, type: f.mimeType }));
      }
    }
    
    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
