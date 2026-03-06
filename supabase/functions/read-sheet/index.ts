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
    
    // First get all sheet names
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
    const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const meta = await metaRes.json();
    const sheets = meta.sheets?.map((s: any) => ({ title: s.properties.title, gid: s.properties.sheetId })) || [];
    
    // Find the ΦΥΛΛΟ sheet
    const target = sheets.find((s: any) => s.title.includes("ΦΥΛΛΟ") || s.title.includes("ΑΠΟΛΟΓΙΣΜΟΥ"));
    if (!target) {
      return new Response(JSON.stringify({ error: "Sheet not found", sheets }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Read using ranges API with sheet title
    const rangeParam = `${target.title}!A1:Z200`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeParam)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const rows = data.values || [];
    
    let workCodeCol = -1, workQtyCol = -1, matCodeCol = -1, matQtyCol = -1, headerRow = -1;
    const headerFields: Record<string, string> = {};
    
    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      for (let c = 0; c < (rows[r]?.length || 0); c++) {
        const val = (rows[r][c] || "").trim();
        if (val === "Άρθρο") { headerRow = r; workCodeCol = c; }
        if (val === "ΠΟΣΟΤΗΤΑ" && headerRow === r) workQtyCol = c;
        if (val === "ΚΑΥ") matCodeCol = c;
        for (const label of ["SR ID:", "ΠΕΡΙΟΧΗ", "SES ID:", "CAB:", "ΔΙΕΥΘΥΝΣΗ:", "ΕΙΔΟΣ ΟΔΕΥΣΗΣ:", "ΑΝΑΜΟΝΗ:", "ΟΡΟΦΟΙ:", "ΗΜ/ΝΙΑ", "Α/Κ:"]) {
          if (val === label || val.includes(label)) {
            headerFields[label] = (rows[r]?.[c + 1] || "").toString();
          }
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
    
    const dataStart = headerRow >= 0 ? headerRow + 2 : 0;
    const filledWorks: Record<string, any> = {};
    const filledMaterials: Record<string, any> = {};
    
    for (let r = dataStart; r < rows.length; r++) {
      const row = rows[r] || [];
      if (workCodeCol >= 0 && workQtyCol >= 0) {
        const code = (row[workCodeCol] || "").trim().replace(/\.+$/, "");
        const qty = (row[workQtyCol] || "").toString().trim();
        if (code && qty && qty !== "0" && qty !== "") {
          filledWorks[code] = { row: r + 1, col: String.fromCharCode(65 + workQtyCol), quantity: qty };
        }
      }
      if (matCodeCol >= 0 && matQtyCol >= 0) {
        const matCode = (row[matCodeCol] || "").trim();
        const matQty = (row[matQtyCol] || "").toString().trim();
        if (matCode && matQty && matQty !== "0" && matQty !== "") {
          filledMaterials[matCode] = { row: r + 1, col: String.fromCharCode(65 + matQtyCol), quantity: matQty };
        }
      }
    }
    
    return new Response(JSON.stringify({
      sheetTitle: target.title,
      allSheets: sheets,
      totalRows: rows.length,
      positions: { workCodeCol, workQtyCol, matCodeCol, matQtyCol, headerRow, dataStart },
      headerFields,
      filledWorks,
      filledMaterials,
      sampleHeaderRows: rows.slice(0, 15),
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
