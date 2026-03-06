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
    // New spreadsheet from last generation
    const spreadsheetId = "1-NmmmLiIKWAbYQErlImVdw32-ErDG-0TssbXCt6ajmA";
    const sheetName = "ΦΥΛΛΟ ΑΠΟΛΟΓΙΣΜΟΥ FTTH";
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName + "!B19:H19,B30:H30,B49:H49,B54:H54")}`;
    // Use batch get for specific rows
    const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${encodeURIComponent(sheetName+"!B19:H19")}&ranges=${encodeURIComponent(sheetName+"!B30:H30")}&ranges=${encodeURIComponent(sheetName+"!B49:H49")}&ranges=${encodeURIComponent(sheetName+"!B54:H54")}`;
    const res = await fetch(batchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    
    const result: any = {};
    const labels = ["1956.II (row 19)", "1970.I (row 30)", "1985.2 (row 49)", "1986.III (row 54)"];
    for (let i = 0; i < data.valueRanges?.length; i++) {
      const row = data.valueRanges[i].values?.[0] || [];
      result[labels[i]] = { code: row[0], description: row[1], quantity_H: row[6] };
    }
    
    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
