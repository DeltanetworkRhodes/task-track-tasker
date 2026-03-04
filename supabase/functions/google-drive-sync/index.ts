import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

async function getAccessToken(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: serviceAccountKey.client_email,
      scope:
        "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  // Import private key and sign JWT
  const pemContent = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signatureInput
  );

  const signatureB64 = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${payload}.${signatureB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const tokenData: GoogleTokenResponse = await tokenRes.json();
  return tokenData.access_token;
}

async function readSheet(
  accessToken: string,
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API error: ${err}`);
  }
  const data = await res.json();
  return data.values || [];
}

// Extract sheet ID from a full Google Sheets URL or return as-is if already an ID
function extractSheetId(input: string): string {
  if (!input) return input;
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : input.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // empty body is fine
    }

    const serviceAccountKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKeyStr) {
      return new Response(
        JSON.stringify({
          error: "GOOGLE_SERVICE_ACCOUNT_KEY not configured",
          setup_required: true,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceAccountKey = JSON.parse(serviceAccountKeyStr);
    const accessToken = await getAccessToken(serviceAccountKey);

    const assignmentsSheetId = extractSheetId(
      body.assignments_sheet_id || Deno.env.get("GOOGLE_SHEET_ASSIGNMENTS_ID") || ""
    );
    const constructionsSheetId = extractSheetId(
      body.constructions_sheet_id || Deno.env.get("GOOGLE_SHEET_CONSTRUCTIONS_ID") || ""
    );
    const materialsSheetId = extractSheetId(
      body.materials_sheet_id || Deno.env.get("GOOGLE_SHEET_MATERIALS_ID") || ""
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: any = { assignments: 0, constructions: 0, materials: 0, errors: [] };

    // Sync Assignments (Form Responses 4)
    if (assignmentsSheetId) {
      try {
        const rows = await readSheet(accessToken, assignmentsSheetId, "A:Z");
        if (rows.length > 1) {
          const headers = rows[0].map((h: string) => h.toLowerCase().trim());
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const srId = row[headers.indexOf("sr id")] || row[headers.indexOf("sr_id")] || row[1] || "";
            const area = row[headers.indexOf("area")] || row[headers.indexOf("περιοχή")] || row[2] || "";
            const status = row[headers.indexOf("status")] || row[headers.indexOf("κατάσταση")] || "pending";
            const comments = row[headers.indexOf("comments")] || row[headers.indexOf("σχόλια")] || "";

            if (!srId) continue;

            const { error } = await supabase.from("assignments").upsert(
              {
                sr_id: srId.trim(),
                area: area.trim(),
                status: status.trim().toLowerCase().replace(/\s+/g, "_"),
                comments: comments.trim(),
                google_sheet_row_id: i,
              },
              { onConflict: "google_sheet_row_id" }
            );
            if (error) {
              results.errors.push(`Assignment row ${i}: ${error.message}`);
            } else {
              results.assignments++;
            }
          }
        }
      } catch (e) {
        results.errors.push(`Assignments sheet: ${e.message}`);
      }
    }

    // Sync Constructions (Form Responses 8)
    if (constructionsSheetId) {
      try {
        const rows = await readSheet(accessToken, constructionsSheetId, "A:Z");
        if (rows.length > 1) {
          const headers = rows[0].map((h: string) => h.toLowerCase().trim());
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const srId = row[headers.indexOf("sr id")] || row[headers.indexOf("sr_id")] || row[1] || "";
            const sesId = row[headers.indexOf("ses id")] || row[headers.indexOf("ses_id")] || row[2] || "";
            const ak = row[headers.indexOf("ak")] || row[3] || "";
            const cab = row[headers.indexOf("cab")] || row[4] || "";
            const floors = parseInt(row[headers.indexOf("floors")] || row[headers.indexOf("όροφοι")] || row[5] || "0") || 0;
            const revenue = parseFloat(row[headers.indexOf("revenue")] || row[headers.indexOf("έσοδα")] || row[6] || "0") || 0;
            const materialCost = parseFloat(row[headers.indexOf("material_cost")] || row[headers.indexOf("κόστος υλικών")] || row[7] || "0") || 0;
            const status = row[headers.indexOf("status")] || row[headers.indexOf("κατάσταση")] || "in_progress";

            if (!srId) continue;

            const { error } = await supabase.from("constructions").upsert(
              {
                sr_id: srId.trim(),
                ses_id: sesId.trim() || null,
                ak: ak.trim() || null,
                cab: cab.trim() || null,
                floors,
                revenue,
                material_cost: materialCost,
                status: status.trim().toLowerCase().replace(/\s+/g, "_"),
                google_sheet_row_id: i,
              },
              { onConflict: "google_sheet_row_id" }
            );
            if (error) {
              results.errors.push(`Construction row ${i}: ${error.message}`);
            } else {
              results.constructions++;
            }
          }
        }
      } catch (e) {
        results.errors.push(`Constructions sheet: ${e.message}`);
      }
    }

    // Sync Materials
    if (materialsSheetId) {
      try {
        const rows = await readSheet(accessToken, materialsSheetId, "A:Z");
        if (rows.length > 1) {
          const headers = rows[0].map((h: string) => h.toLowerCase().trim());
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const code = row[headers.indexOf("code")] || row[headers.indexOf("κωδικός")] || row[0] || "";
            const name = row[headers.indexOf("name")] || row[headers.indexOf("όνομα")] || row[1] || "";
            const stock = parseFloat(row[headers.indexOf("stock")] || row[headers.indexOf("απόθεμα")] || row[2] || "0") || 0;
            const unit = row[headers.indexOf("unit")] || row[headers.indexOf("μονάδα")] || row[3] || "τεμ.";
            const source = row[headers.indexOf("source")] || row[headers.indexOf("πηγή")] || row[4] || "OTE";
            const price = parseFloat(row[headers.indexOf("price")] || row[headers.indexOf("τιμή")] || row[5] || "0") || 0;

            if (!code) continue;

            const { error } = await supabase.from("materials").upsert(
              {
                code: code.trim(),
                name: name.trim(),
                stock,
                unit: unit.trim(),
                source: source.trim(),
                price,
              },
              { onConflict: "code" }
            );
            if (error) {
              results.errors.push(`Material row ${i}: ${error.message}`);
            } else {
              results.materials++;
            }
          }
        }
      } catch (e) {
        results.errors.push(`Materials sheet: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, synced: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
