const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getAccessToken(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    iss: serviceAccountKey.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  }));
  const pemContent = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
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
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceAccountKey = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY")!);
    const accessToken = await getAccessToken(serviceAccountKey);
    
    const spreadsheetId = "1Rc0rrrNbixf9G64G71aWDrQ_cFezADTt4JYbTeCSzic";
    
    // First get sheet names
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
    const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const meta = await metaRes.json();
    const sheetNames = meta.sheets?.map((s: any) => s.properties.title) || [];
    
    // Read each sheet's first 200 rows
    const results: any = { sheetNames, sheets: {} };
    
    for (const name of sheetNames) {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(name)}'!A1:Z200`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) continue;
      const data = await res.json();
      const rows = data.values || [];
      
      // Find work codes and quantities
      const sheetResult: any = { totalRows: rows.length, headers: {}, works: {}, materials: {} };
      
      let workCodeCol = -1, workQtyCol = -1, matCodeCol = -1, matQtyCol = -1, headerRow = -1;
      
      for (let r = 0; r < Math.min(rows.length, 20); r++) {
        for (let c = 0; c < (rows[r]?.length || 0); c++) {
          const val = (rows[r][c] || "").trim();
          if (val === "Άρθρο") { headerRow = r; workCodeCol = c; }
          if (val === "ΠΟΣΟΤΗΤΑ" && headerRow === r) workQtyCol = c;
          if (val === "ΚΑΥ") matCodeCol = c;
          if (["SR ID:", "ΠΕΡΙΟΧΗ", "SES ID:", "CAB:", "ΔΙΕΥΘΥΝΣΗ:", "ΕΙΔΟΣ ΟΔΕΥΣΗΣ:", "ΑΝΑΜΟΝΗ:", "ΟΡΟΦΟΙ:", "ΗΜ/ΝΙΑ", "Α/Κ:"].includes(val)) {
            sheetResult.headers[val] = rows[r]?.[c + 1] || "";
          }
        }
      }
      
      if (matCodeCol >= 0 && headerRow >= 0) {
        for (let r = headerRow; r < headerRow + 3; r++) {
          for (let c = matCodeCol + 1; c < (rows[r]?.length || 0); c++) {
            if ((rows[r]?.[c] || "").trim() === "ΠΟΣΟΤΗΤΑ") { matQtyCol = c; break; }
          }
          if (matQtyCol >= 0) break;
        }
      }
      
      sheetResult.columnPositions = { workCodeCol, workQtyCol, matCodeCol, matQtyCol, headerRow };
      
      if (headerRow >= 0) {
        const dataStart = headerRow + 2;
        for (let r = dataStart; r < rows.length; r++) {
          const row = rows[r] || [];
          const code = (row[workCodeCol] || "").trim().replace(/\.+$/, "");
          const qty = (row[workQtyCol] || "").toString().trim();
          if (code && qty && qty !== "0" && qty !== "") {
            sheetResult.works[code] = { row: r + 1, quantity: qty };
          }
          if (matCodeCol >= 0) {
            const matCode = (row[matCodeCol] || "").trim();
            const matQty = matQtyCol >= 0 ? (row[matQtyCol] || "").toString().trim() : "";
            if (matCode && matQty && matQty !== "0" && matQty !== "") {
              sheetResult.materials[matCode] = { row: r + 1, quantity: matQty };
            }
          }
        }
      }
      
      // Include first 5 rows as sample
      sheetResult.sampleRows = rows.slice(0, 8);
      
      results.sheets[name] = sheetResult;
    }
    
    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
