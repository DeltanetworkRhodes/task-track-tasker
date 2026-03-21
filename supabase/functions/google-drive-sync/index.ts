import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
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

function extractSheetId(input: string): string {
  if (!input) return input;
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : input.trim();
}

// Helper: find column by header name (case-insensitive, trimmed, partial match)
function col(headers: string[], row: string[], ...names: string[]): string {
  for (const name of names) {
    const needle = name.toLowerCase().trim();
    const idx = headers.findIndex(h => h.trim() === needle || h.includes(needle));
    if (idx >= 0 && row[idx] !== undefined) return row[idx];
  }
  return "";
}

function parseNum(val: string): number {
  if (!val) return 0;
  const cleaned = val.replace(/[€\s]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function countPhotos(val: string): number {
  if (!val) return 0;
  return val.split(",").filter((s) => s.trim().startsWith("http")).length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body */ }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (roleError) throw roleError;

    const roles = new Set((roleRows || []).map((r: any) => r.role));
    const isSuperAdmin = roles.has("super_admin");
    const isAdmin = isSuperAdmin || roles.has("admin");

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (callerProfileError) throw callerProfileError;

    const targetOrgId = isSuperAdmin
      ? (body.organization_id || callerProfile?.organization_id || null)
      : (callerProfile?.organization_id || null);

    if (!targetOrgId) {
      return new Response(JSON.stringify({ error: "Missing organization context" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: orgSettings } = await adminClient
      .from("org_settings")
      .select("setting_key, setting_value")
      .eq("organization_id", targetOrgId)
      .in("setting_key", ["assignments_sheet_id", "constructions_sheet_id", "shared_drive_id", "area_root_folders", "service_account_key"]);

    const settingsMap = new Map((orgSettings || []).map((s: any) => [s.setting_key, s.setting_value]));

    // CRITICAL: Only use org-specific settings, never fall back to global env vars
    // to prevent cross-organization data leaks
    const assignmentsSheetId = extractSheetId(
      body.assignments_sheet_id ||
      settingsMap.get("assignments_sheet_id") ||
      ""
    );

    const constructionsSheetId = extractSheetId(
      body.constructions_sheet_id ||
      settingsMap.get("constructions_sheet_id") ||
      ""
    );

    const serviceAccountKeyStr = settingsMap.get("service_account_key") || settingsMap.get("service_account_json");
    if (!serviceAccountKeyStr) {
      return new Response(
        JSON.stringify({ error: "Google Service Account δεν έχει ρυθμιστεί. Ολοκληρώστε τον Οδηγό Εγκατάστασης.", setup_required: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceAccountKey = JSON.parse(serviceAccountKeyStr);
    const accessToken = await getAccessToken(serviceAccountKey);

    const sharedDriveId = settingsMap.get("shared_drive_id") || "";

    let driveFolderIds: string[] = [];

    const areaRootFoldersRaw = settingsMap.get("area_root_folders");
    if (areaRootFoldersRaw) {
      try {
        const parsed = JSON.parse(areaRootFoldersRaw);
        const parsedIds = (Array.isArray(parsed) ? parsed : [])
          .map((x: any) => x?.folderId)
          .filter((id: any) => typeof id === "string" && id.trim() && !id.includes("placeholder"));
        if (parsedIds.length > 0) {
          driveFolderIds = [...new Set(parsedIds)];
        }
      } catch {
        // keep fallback driveFolderIds
      }
    }

    // Debug mode
    if (body.debug) {
      const debugInfo: any = {};
      for (const [name, sheetId] of Object.entries({ assignments: assignmentsSheetId, constructions: constructionsSheetId })) {
        if (sheetId) {
          try {
            const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;
            const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
            const metaData = await metaRes.json();
            const tabs = metaData.sheets?.map((s: any) => s.properties.title) || [];
            const tabsData: any = {};
            for (const tab of tabs) {
              try {
                const rows = await readSheet(accessToken, sheetId as string, `'${tab}'!A1:Z2`);
                tabsData[tab] = { headers: rows[0] || [], sample_row: rows[1] || [] };
              } catch (e) { tabsData[tab] = { error: e.message }; }
            }
            debugInfo[name] = { sheet_id: sheetId, tabs, tabs_data: tabsData };
          } catch (e) { debugInfo[name] = { error: e.message }; }
        }
      }
      return new Response(JSON.stringify({ debug: debugInfo }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const results: any = {
      constructions: 0, materials: 0, work_pricing: 0,
      rodos: 0, kos: 0, drive_matched: 0, errors: []
    };

    // ===== ASSIGNMENTS SHEET =====
    if (assignmentsSheetId) {

      // --- ΡΟΔΟΣ tab ---
      try {
        const rows = await readSheet(accessToken, assignmentsSheetId, "'ΡΟΔΟΣ'!A:Z");
        if (rows.length > 1) {
          const headers = rows[0].map((h: string) => h.toLowerCase().trim());
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            // Actual headers: SR, ΟΝΟΜΑ ΠΕΛΑΤΗ, ΠΕΡΙΟΧΗ, Column 1, ΗΜΕΡΟΜΗΝΙΑ, ΚΑΜΠΙΝΑ, ΣΧΟΛΙΑ, Ε MAIL, ΚΑΤΑΣΤΑΣΗ ΑΥΤΟΨΙΑΣ
            const srId = col(headers, row, "sr");
            if (!srId) continue;

            const customerInfo = col(headers, row, "ονομα πελατη");
            const cab = col(headers, row, "καμπινα");
            const comments = col(headers, row, "σχολια");
            const email = col(headers, row, "ε mail", "e mail");
            const status = col(headers, row, "κατασταση αυτοψιασ");

            const { error } = await supabase.from("assignments").upsert(
              {
                organization_id: targetOrgId,
                sr_id: srId.trim(),
                area: "ΡΟΔΟΣ",
                status: status ? status.trim().toLowerCase() : "pending",
                customer_name: customerInfo.trim() || null,
                cab: cab.trim() || null,
                comments: comments.trim() || null,
                source_tab: "ΡΟΔΟΣ",
                google_sheet_row_id: 10000 + i,
              },
              { onConflict: "organization_id,google_sheet_row_id" }
            );
            if (error) results.errors.push(`ΡΟΔΟΣ row ${i}: ${error.message}`);
            else results.rodos++;
          }
        }
      } catch (e) { results.errors.push(`ΡΟΔΟΣ: ${e.message}`); }

      // --- ΚΩΣ tab ---
      try {
        const rows = await readSheet(accessToken, assignmentsSheetId, "'ΚΩΣ'!A:Z");
        if (rows.length > 1) {
          const headers = rows[0].map((h: string) => h.toLowerCase().trim());
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            // Actual headers: SR, ΟΝΟΜΑ ΠΕΛΑΤΗ, ΠΕΡΙΟΧΗ, Column 1, ΗΜΕΡΟΜΗΝΙΑ, ΚΑΜΠΙΝΑ, ΣΧΟΛΙΑ, Ε MAIL
            const srId = col(headers, row, "sr");
            if (!srId) continue;

            const customerInfo = col(headers, row, "ονομα πελατη");
            const cab = col(headers, row, "καμπινα");
            const comments = col(headers, row, "σχολια");

            const { error } = await supabase.from("assignments").upsert(
              {
                organization_id: targetOrgId,
                sr_id: srId.trim(),
                area: "ΚΩΣ",
                status: "pending",
                customer_name: customerInfo.trim() || null,
                cab: cab.trim() || null,
                comments: comments.trim() || null,
                source_tab: "ΚΩΣ",
                google_sheet_row_id: 20000 + i,
              },
              { onConflict: "organization_id,google_sheet_row_id" }
            );
            if (error) results.errors.push(`ΚΩΣ row ${i}: ${error.message}`);
            else results.kos++;
          }
        }
      } catch (e) { results.errors.push(`ΚΩΣ: ${e.message}`); }
    }

    // ===== DRIVE FOLDER MATCHING =====
    try {
      // Use organization-scoped Drive folders (fallbacks already prepared above)
      const srFolderMap: Record<string, string> = {};

      for (const parentId of driveFolderIds) {
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
        )}&fields=files(id,name,webViewLink)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${sharedDriveId}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) continue;
        const data = await res.json();
        for (const folder of (data.files || [])) {
          const folderName = folder.name || "";
          const cleaned = folderName.replace(/^SR\s+/i, "");
          const srMatch = cleaned.match(/^([\w-]+)/);
          if (srMatch) {
            srFolderMap[srMatch[1]] = folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`;
          }
        }
      }

      for (const [srId, driveUrl] of Object.entries(srFolderMap)) {
        const { error } = await supabase
          .from("assignments")
          .update({ drive_folder_url: driveUrl })
          .eq("organization_id", targetOrgId)
          .eq("sr_id", srId);
        if (!error) results.drive_matched++;
      }
    } catch (e) {
      results.errors.push(`Drive matching: ${e.message}`);
    }

    // ===== CONSTRUCTIONS/MATERIALS SHEET =====
    if (constructionsSheetId) {
      // --- Form Responses 8 (Constructions) ---
      try {
        const rows = await readSheet(accessToken, constructionsSheetId, "'Form Responses 8'!A:Z");
        if (rows.length > 1) {
          const headers = rows[0].map((h: string) => h.toLowerCase().trim());
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const srId = col(headers, row, "αριθμός sr", "αριθμος sr");
            const sesId = col(headers, row, "ses id");
            const ak = col(headers, row, "α/κ");
            const cab = col(headers, row, "cab");
            const floors = parseInt(col(headers, row, "οροφοι", "όροφοι") || "0") || 0;

            if (!srId) continue;

            const { error } = await supabase.from("constructions").upsert(
              {
                organization_id: targetOrgId,
                sr_id: srId.trim(),
                ses_id: sesId.trim() || null,
                ak: ak.trim() || null,
                cab: cab.trim() || null,
                floors,
                revenue: 0,
                material_cost: 0,
                status: "in_progress",
                google_sheet_row_id: i,
              },
              { onConflict: "organization_id,google_sheet_row_id" }
            );
            if (error) results.errors.push(`Construction row ${i}: ${error.message}`);
            else results.constructions++;
          }
        }
      } catch (e) { results.errors.push(`Form Responses 8: ${e.message}`); }

      // --- ΑΠΟΘΗΚΗ (Materials) ---
      try {
        const rows = await readSheet(accessToken, constructionsSheetId, "'ΑΠΟΘΗΚΗ'!A:H");
        if (rows.length > 1) {
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const code = (row[1] || "").trim();
            const name = (row[2] || "").trim();
            const price = parseNum(row[3] || "");
            const unit = (row[5] || "τεμ.").trim();
            const stock = parseNum(row[6] || "");

            if (!code) continue;

            const { error } = await supabase.from("materials").upsert(
              { organization_id: targetOrgId, code, name, stock, unit, source: "OTE", price },
              { onConflict: "organization_id,code" }
            );
            if (error) results.errors.push(`Material row ${i}: ${error.message}`);
            else results.materials++;
          }
        }
      } catch (e) { results.errors.push(`ΑΠΟΘΗΚΗ: ${e.message}`); }

      // --- ΒΑΣΗ_ΤΙΜΟΛΟΓΗΣΗΣ (Work Pricing) ---
      try {
        const rows = await readSheet(accessToken, constructionsSheetId, "'ΒΑΣΗ_ΤΙΜΟΛΟΓΗΣΗΣ'!A:Z");
        if (rows.length > 1) {
          const headers = rows[0].map((h: string) => h.toLowerCase().trim());
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            // Columns: ΚΩΔΙΚΟΣ, ΠΕΡΙΓΡΑΦΗ, Μ.Μ, ΤΙΜΗ ΜΟΝΑΔΑΣ
            const code = col(headers, row, "κωδικοσ", "κωδικός", "κωδ.");
            const description = col(headers, row, "περιγραφη", "περιγραφή");
            const unit = col(headers, row, "μ.μ", "μ.μ.", "μονάδα");
            const unitPrice = parseNum(col(headers, row, "τιμη μοναδασ", "τιμή μονάδας", "τιμη", "τιμή"));

            if (!code) continue;

            const { error } = await supabase.from("work_pricing").upsert(
              {
                organization_id: targetOrgId,
                code: code.trim(),
                description: description.trim(),
                unit: unit.trim() || "τεμ.",
                unit_price: unitPrice,
              },
              { onConflict: "organization_id,code" }
            );
            if (error) results.errors.push(`Work pricing row ${i}: ${error.message}`);
            else results.work_pricing++;
          }
        }
      } catch (e) { results.errors.push(`ΒΑΣΗ_ΤΙΜΟΛΟΓΗΣΗΣ: ${e.message}`); }
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
