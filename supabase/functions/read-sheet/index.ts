const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
async function getAccessToken(sk: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const h = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const p = btoa(JSON.stringify({ iss: sk.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now }));
  const pem = sk.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\n/g, "");
  const bin = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", bin, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${h}.${p}`));
  const s64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${h}.${p}.${s64}` });
  return (await r.json()).access_token;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sk = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY")!);
    const at = await getAccessToken(sk);
    const sid = "1gGf66JFCUrwei4RzMwpRL0FAgwNbJ_t-LXEnC_8Gi5Y";
    const sn = "ΦΥΛΛΟ ΑΠΟΛΟΓΙΣΜΟΥ FTTH";
    // Routes section is in the header area rows 3-8, columns J-N (10-14)
    // Read rows 2-9 for the routes area + totals
    const ranges = [
      `${sn}!J3:N8`,  // Route rows and totals
      `${sn}!L3:N8`,  // KOI and ΦΥΡΑ columns specifically
    ];
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values:batchGet?${ranges.map(r => `ranges=${encodeURIComponent(r)}`).join("&")}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${at}` } });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return new Response(JSON.stringify({
      routeSection: data.valueRanges?.[0]?.values || [],
      koiFyraSection: data.valueRanges?.[1]?.values || [],
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
