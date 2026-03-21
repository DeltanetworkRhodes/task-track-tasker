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
    scope: "https://www.googleapis.com/auth/spreadsheets",
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

function parseValue(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  // If already a number (from UNFORMATTED_VALUE), return as-is
  if (typeof val === "number") return val;
  // String fallback: handle Greek format "1.000,50" or plain "0.65"
  const str = String(val).replace(/[€\s]/g, "");
  // If has both dot and comma, it's Greek: 1.000,50
  if (str.includes(".") && str.includes(",")) {
    return parseFloat(str.replace(/\./g, "").replace(",", ".")) || 0;
  }
  // If only comma, it's decimal: 0,65
  if (str.includes(",")) {
    return parseFloat(str.replace(",", ".")) || 0;
  }
  // Plain number or dot-decimal: 0.65 or 464
  return parseFloat(str) || 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const organizationId = body.organizationId || null;

    const serviceAccountKey = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") || "{}");
    const accessToken = await getAccessToken(serviceAccountKey);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const spreadsheetId = "1H7W4_SnDpnrHvFGGDhAWAf4KjRbilpUhmzdaO7fN2qU";
    const results: any = { materials: 0, work_pricing: 0, errors: [] };

    // ========== 1. ΑΠΟΘΗΚΗ → materials (DELTANETWORK items with stock) ==========
    const apothikiRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("ΑΠΟΘΗΚΗ")}!A1:H100?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const apothikiData = await apothikiRes.json();
    const apothikiRows = (apothikiData.values || []).slice(1); // skip header

    // Separate DELTANETWORK (top section with prices) and OTE (bottom section, price=0)
    for (const row of apothikiRows) {
      const code = String(row[1] || "").trim();
      const name = String(row[2] || "").trim();
      if (!code || !name) continue;

      const price = parseValue(row[3] || 0);
      const stock = parseValue(row[6] || 0);
      const unit = String(row[5] || "τεμ.").trim();

      // Items with price > 0 are DELTANETWORK, price = 0 are OTE
      const source = price > 0 ? "DELTANETWORK" : "OTE";

      // Check if material already exists for this org
      const q = supabase.from("materials").select("id").eq("code", code);
      if (organizationId) q.eq("organization_id", organizationId);
      const { data: existing } = await q.limit(1);

      if (existing && existing.length > 0) {
        const { error } = await supabase
          .from("materials")
          .update({ name, price, unit, source })
          .eq("code", code)
          .eq("organization_id", organizationId);
        if (error) {
          results.errors.push(`Material ${code}: ${error.message}`);
        } else {
          results.materials++;
        }
      } else {
        const { error } = await supabase.from("materials").insert(
          { code, name, price, stock, unit, source, organization_id: organizationId }
        );
        if (error) {
          results.errors.push(`Material ${code}: ${error.message}`);
        } else {
          results.materials++;
        }
      }
    }

    // ========== 2. ΒΑΣΗ_ΥΛΙΚΩΝ → materials (catalog with prices, update existing) ==========
    const basiYlikonRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("ΒΑΣΗ_ΥΛΙΚΩΝ")}!A2:G100?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const basiYlikonData = await basiYlikonRes.json();
    const basiYlikonRows = (basiYlikonData.values || []).slice(1); // skip header row

    for (const row of basiYlikonRows) {
      const code = String(row[1] || "").trim();
      const name = String(row[2] || "").trim();
      if (!code || !name) continue;

      const price = parseValue(row[3] || 0);
      const unit = String(row[5] || "τεμ.").trim();
      const source = price > 0 ? "DELTANETWORK" : "OTE";

      // Update price if material already exists from ΑΠΟΘΗΚΗ, otherwise insert
      const { error } = await supabase.from("materials").upsert(
        { code, name, price, unit, source, organization_id: organizationId },
        { onConflict: "code,organization_id" }
      );
      if (error) {
        results.errors.push(`BasiYlikon ${code}: ${error.message}`);
      }
    }

    // ========== 3. ΒΑΣΗ_ΤΙΜΟΛΟΓΗΣΗΣ → work_pricing ==========
    const basiTimRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("ΒΑΣΗ_ΤΙΜΟΛΟΓΗΣΗΣ")}!A1:F100?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const basiTimData = await basiTimRes.json();
    const basiTimRows = basiTimData.values || [];

    // Category mapping by code prefix
    const categoryMap: Record<string, string> = {
      "1956": "Αυτοψία",
      "1991": "BCP 1991",
      "1993": "BCP 1993 — Από BCP έως ΒΕΡ",
      "1963": "BEP 1963 — ΕΣΚΑΛΙΤ",
      "1965": "BEP 1965 — Σκάψιμο έως BEP",
      "1970": "BEP 1970 — Τοποθέτηση ΒΕΡ",
      "1984": "2 BOX 1984",
      "1985": "FB 1985 — Κατακόρυφη ΚΟΙ",
      "1986": "FB 1986 — Κολλήσεις & Διασυνδέσεις",
      "1980": "1980 — Εμφύσηση CAB",
      "1955": "Γ' ΦΑΣΗ 1955 — Σύνδεση Πελάτη",
      "1930": "Λοιπά",
    };

    function getCategoryForCode(code: string): string {
      for (const [prefix, cat] of Object.entries(categoryMap)) {
        if (code.startsWith(prefix)) return cat;
      }
      return "Λοιπά";
    }

    for (const row of basiTimRows) {
      const col1 = String(row[0] || "").trim();
      const col2 = String(row[1] || "").trim();
      const col3 = String(row[2] || "").trim();
      const col4 = row[3];

      // Skip header/category rows
      if (col2 === "ΠΕΡΙΓΡΑΦΗ" || col1 === "OTE" || !col2) continue;
      if (col2 && !col3 && (col4 === undefined || col4 === null || col4 === "")) continue;

      // Data row: code in col2, description in col3, price in col4
      if (col2 && col3 && col4 !== undefined && col4 !== null && col4 !== "") {
        const code = col2;
        const description = col3;
        const unitPrice = parseValue(col4);
        const category = getCategoryForCode(code);

        const { error } = await supabase.from("work_pricing").upsert(
          { code, description, unit_price: unitPrice, category, unit: "τεμ.", organization_id: organizationId },
          { onConflict: "code,organization_id" }
        );
        if (error) {
          results.errors.push(`WorkPricing ${code}: ${error.message}`);
        } else {
          results.work_pricing++;
        }
      }
    }

    // ========== 4. ΚΕΡΔΟΣ_ΑΝΑ_SR → profit_per_sr table ==========
    const kerdosRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("ΚΕΡΔΟΣ_ΑΝΑ_SR")}!A1:D100?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const kerdosData = await kerdosRes.json();
    const kerdosRows = (kerdosData.values || []).slice(1); // skip header
    let profitCount = 0;

    for (const r of kerdosRows) {
      const sr_id = String(r[0] || "").trim();
      if (!sr_id) continue;
      const revenue = parseValue(r[1] || 0);
      const expenses = parseValue(r[2] || 0);
      const profit = parseValue(r[3] || 0);

      const { error } = await supabase.from("profit_per_sr").upsert(
        { sr_id, revenue, expenses, profit },
        { onConflict: "sr_id" }
      );
      if (error) {
        results.errors.push(`ProfitSR ${sr_id}: ${error.message}`);
      } else {
        profitCount++;
      }
    }
    return new Response(JSON.stringify({
      success: true,
      synced: {
        materials: results.materials,
        work_pricing: results.work_pricing,
        profit_per_sr: profitCount,
      },
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
