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
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  }));

  const pemContent = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signatureInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signatureInput);
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${header}.${payload}.${signatureB64}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Failed to get access token");
  return tokenData.access_token;
}

function parsePrice(val: string): number {
  if (!val) return 0;
  const cleaned = val.replace(/[€\s]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function parseNumber(val: string): number {
  if (!val) return 0;
  const cleaned = val.replace(/[,\s]/g, "");
  return parseFloat(cleaned) || 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceAccountKey = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") || "{}");
    const accessToken = await getAccessToken(serviceAccountKey);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const spreadsheetId = "1H7W4_SnDpnrHvFGGDhAWAf4KjRbilpUhmzdaO7fN2qU";
    const results: any = { materials: 0, work_pricing: 0, errors: [] };

    // ========== 1. ΑΠΟΘΗΚΗ → materials (DELTANETWORK items with stock) ==========
    const apothikiRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("ΑΠΟΘΗΚΗ")}!A1:H100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const apothikiData = await apothikiRes.json();
    const apothikiRows = (apothikiData.values || []).slice(1); // skip header

    // Separate DELTANETWORK (top section with prices) and OTE (bottom section, price=0)
    for (const row of apothikiRows) {
      const code = (row[1] || "").trim();
      const name = (row[2] || "").trim();
      if (!code || !name) continue;

      const price = parsePrice(row[3] || "0");
      const stock = parseNumber(row[6] || "0");
      const unit = (row[5] || "τεμ.").trim();

      // Items with price > 0 are DELTANETWORK, price = 0 are OTE
      const source = price > 0 ? "DELTANETWORK" : "OTE";

      const { error } = await supabase.from("materials").upsert(
        { code, name, price, stock, unit, source },
        { onConflict: "code" }
      );
      if (error) {
        results.errors.push(`Material ${code}: ${error.message}`);
      } else {
        results.materials++;
      }
    }

    // ========== 2. ΒΑΣΗ_ΥΛΙΚΩΝ → materials (catalog with prices, update existing) ==========
    const basiYlikonRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("ΒΑΣΗ_ΥΛΙΚΩΝ")}!A2:G100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const basiYlikonData = await basiYlikonRes.json();
    const basiYlikonRows = (basiYlikonData.values || []).slice(1); // skip header row

    for (const row of basiYlikonRows) {
      const code = (row[1] || "").trim();
      const name = (row[2] || "").trim();
      if (!code || !name) continue;

      const price = parsePrice(row[3] || "0");
      const unit = (row[5] || "τεμ.").trim();
      const source = price > 0 ? "DELTANETWORK" : "OTE";

      // Update price if material already exists from ΑΠΟΘΗΚΗ, otherwise insert
      const { error } = await supabase.from("materials").upsert(
        { code, name, price, unit, source },
        { onConflict: "code" }
      );
      if (error) {
        results.errors.push(`BasiYlikon ${code}: ${error.message}`);
      }
    }

    // ========== 3. ΒΑΣΗ_ΤΙΜΟΛΟΓΗΣΗΣ → work_pricing ==========
    const basiTimRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("ΒΑΣΗ_ΤΙΜΟΛΟΓΗΣΗΣ")}!A1:F100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const basiTimData = await basiTimRes.json();
    const basiTimRows = basiTimData.values || [];

    let currentCategory = "";
    for (const row of basiTimRows) {
      const col1 = (row[0] || "").trim();
      const col2 = (row[1] || "").trim();
      const col3 = (row[2] || "").trim();
      const col4 = (row[3] || "").trim();

      // Category headers (like "BCP 1991", "BΕP 1970", etc.)
      if (col2 && !col3 && !col4) {
        // This is a category/subcategory header
        currentCategory = col2;
        continue;
      }

      // Skip pure header rows
      if (col2 === "ΠΕΡΙΓΡΑΦΗ" || col1 === "OTE" || !col2) continue;

      // Data row: code in col2, description in col3, price in col4
      if (col2 && col3 && col4) {
        const code = col2;
        const description = col3;
        const unitPrice = parsePrice(col4);

        const { error } = await supabase.from("work_pricing").upsert(
          { code, description, unit_price: unitPrice, category: currentCategory, unit: "τεμ." },
          { onConflict: "code" }
        );
        if (error) {
          results.errors.push(`WorkPricing ${code}: ${error.message}`);
        } else {
          results.work_pricing++;
        }
      }
    }

    // ========== 4. ΚΕΡΔΟΣ_ΑΝΑ_SR → return data (not stored, displayed live) ==========
    const kerdosRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("ΚΕΡΔΟΣ_ΑΝΑ_SR")}!A1:D100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const kerdosData = await kerdosRes.json();
    const kerdosRows = (kerdosData.values || []).slice(1); // skip header
    const profitPerSR = kerdosRows
      .filter((r: string[]) => r[0] && r[0].trim())
      .map((r: string[]) => ({
        sr_id: (r[0] || "").trim(),
        revenue: parsePrice(r[1] || "0"),
        expenses: parsePrice(r[2] || "0"),
        profit: parsePrice(r[3] || "0"),
      }));

    return new Response(JSON.stringify({
      success: true,
      synced: {
        materials: results.materials,
        work_pricing: results.work_pricing,
      },
      profit_per_sr: profitPerSR,
      errors: results.errors,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Sync error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
