const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getAccessToken(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    iss: serviceAccountKey.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  }));
  const pemContent = serviceAccountKey.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signatureInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signatureInput);
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${header}.${payload}.${signatureB64}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  return (await tokenRes.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const serviceAccountKey = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY")!);
    const accessToken = await getAccessToken(serviceAccountKey);
    const spreadsheetId = "1Rc0rrrNbixf9G64G71aWDrQ_cFezADTt4JYbTeCSzic";
    const sheetName = "ΦΥΛΛΟ ΑΠΟΛΟΓΙΣΜΟΥ FTTH";
    
    const rangeParam = `${sheetName}!A1:Z200`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeParam)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const rows = data.values || [];
    
    // Extract ALL work codes from column B (index 1) starting from row 10
    const allWorkCodes: { row: number; code: string; qty: string }[] = [];
    const allMatCodes: { row: number; code: string; qty: string }[] = [];
    
    for (let r = 10; r < rows.length; r++) {
      const row = rows[r] || [];
      const workCode = (row[1] || "").toString().trim();
      const workQty = (row[7] || "").toString().trim();
      if (workCode) {
        allWorkCodes.push({ row: r + 1, code: workCode, qty: workQty || "0" });
      }
      const matCode = (row[9] || "").toString().trim();
      const matQty = (row[12] || "").toString().trim();
      if (matCode) {
        allMatCodes.push({ row: r + 1, code: matCode, qty: matQty || "0" });
      }
    }
    
    return new Response(JSON.stringify({
      totalRows: rows.length,
      allWorkCodes,
      allMatCodes,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
