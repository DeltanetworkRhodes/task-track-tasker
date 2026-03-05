import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SPREADSHEET_ID = "1H7W4_SnDpnrHvFGGDhAWAf4KjRbilpUhmzdaO7fN2qU";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) throw new Error("No file uploaded");

    // Convert PDF to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Use Gemini to extract materials from PDF
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are extracting material delivery data from OTE delivery note PDFs (Δελτίο Αποστολής).
Extract each material line item with its code, name, quantity, and unit.
The codes are typically alphanumeric (e.g. "ΚΩΔ.123", "ABC-456", etc).
Return ONLY a JSON array with objects having "code" (string), "name" (string - material description), "quantity" (number), and "unit" (string - e.g. "τεμ.", "μ.", "kg").
IMPORTANT: For quantities, "1.000" means 1000 (Greek thousands separator). Convert to actual numbers.
Example: [{"code": "ABC-001", "name": "Καλώδιο UTP", "quantity": 1000, "unit": "μ."}]
If you cannot find any materials, return an empty array [].
IMPORTANT: Return ONLY the JSON array, no markdown, no explanation.`
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${base64}` }
              },
              {
                type: "text",
                text: "Εξήγαγε τα υλικά και τις ποσότητες από αυτό το δελτίο αποστολής OTE. Επέστρεψε μόνο JSON array."
              }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_materials",
              description: "Extract materials and quantities from a delivery note PDF",
              parameters: {
                type: "object",
                properties: {
                  materials: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        code: { type: "string", description: "Material code" },
                        name: { type: "string", description: "Material description/name" },
                        quantity: { type: "number", description: "Quantity delivered (1.000 = 1000)" },
                        unit: { type: "string", description: "Unit of measurement (τεμ., μ., kg, etc.)" }
                      },
                      required: ["code", "name", "quantity", "unit"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["materials"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_materials" } }
      }),
    });

    if (!aiResponse.ok) {
      const statusCode = aiResponse.status;
      const body = await aiResponse.text();
      if (statusCode === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded, δοκιμάστε ξανά σε λίγο" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (statusCode === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error [${statusCode}]: ${body}`);
    }

    const aiData = await aiResponse.json();
    
    // Extract from tool call response
    let extractedMaterials: { code: string; quantity: number }[] = [];
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      extractedMaterials = parsed.materials || [];
    }

    // Update stock for each extracted material (ADD to existing stock)
    let updated = 0;
    let created = 0;
    const notFound: string[] = [];

    for (const item of extractedMaterials) {
      const { data: existing } = await supabase
        .from("materials")
        .select("id, code, stock")
        .eq("source", "OTE")
        .ilike("code", `%${item.code}%`)
        .limit(1);

      if (existing && existing.length > 0) {
        const newStock = Number(existing[0].stock) + item.quantity;
        const { error } = await supabase
          .from("materials")
          .update({ stock: newStock })
          .eq("id", existing[0].id);
        
        if (!error) updated++;
      } else {
        // Auto-create missing OTE material
        const { error } = await supabase.from("materials").insert({
          code: item.code,
          name: item.name || item.code,
          stock: item.quantity,
          source: "OTE",
          price: 0,
          unit: item.unit || "τεμ.",
        });
        if (!error) {
          created++;
        } else {
          notFound.push(item.code);
        }
      }
    }

    // ===== Write back to Google Sheet ΑΠΟΘΗΚΗ =====
    let sheetUpdated = 0;
    try {
      const serviceAccountKey = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") || "{}");
      const accessToken = await getAccessToken(serviceAccountKey);

     // Read current ΑΠΟΘΗΚΗ sheet to find matching rows
      const sheetRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent("ΑΠΟΘΗΚΗ")}!A1:H500`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const sheetData = await sheetRes.json();
      const rows = sheetData.values || [];
      console.log(`Sheet ΑΠΟΘΗΚΗ: ${rows.length} rows found`);

      // Get all materials from DB with latest stock (both OTE and DELTA)
      const { data: allMaterials } = await supabase
        .from("materials")
        .select("code, stock");

      const stockMap = new Map((allMaterials || []).map(m => [m.code.trim(), Number(m.stock)]));
      console.log(`DB materials: ${stockMap.size} items`);

      // Update stock column (G = index 6) for matching rows
      const updates: { range: string; values: any[][] }[] = [];
      for (let i = 1; i < rows.length; i++) {
        const rowCode = (rows[i]?.[1] || "").toString().trim();
        if (rowCode && stockMap.has(rowCode)) {
          updates.push({
            range: `ΑΠΟΘΗΚΗ!G${i + 1}`,
            values: [[stockMap.get(rowCode)]],
          });
        }
      }
      console.log(`Sheet updates to write: ${updates.length}`);

      if (updates.length > 0) {
        const batchRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchUpdate`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              valueInputOption: "RAW",
              data: updates,
            }),
          }
        );
        const batchResult = await batchRes.json();
        sheetUpdated = batchResult.totalUpdatedCells || 0;
      }
    } catch (sheetErr: any) {
      console.error("Sheet write-back error:", sheetErr);
    }

    return new Response(JSON.stringify({
      success: true,
      extracted: extractedMaterials,
      updated,
      created,
      not_found: notFound,
      sheet_updated: sheetUpdated,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Parse delivery note error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
