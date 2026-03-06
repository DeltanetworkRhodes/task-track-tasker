import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SHARED_DRIVE_ID = "0AN9VpmNEa7QBUk9PVA";

const areaRootFolders: Record<string, string> = {
  "ΡΟΔΟΣ": "1JvcSG3tiOplSujXhb3yj_ELQLjfrgOzO",
  "ΚΩΣ": "1X1mtK4tV_sgGM9IdizNSK7AS19qX1nYl",
};

const greekMonths: Record<number, string> = {
  0: "ΙΑΝΟΥΑΡΙΟΣ", 1: "ΦΕΒΡΟΥΑΡΙΟΣ", 2: "ΜΑΡΤΙΟΣ",
  3: "ΑΠΡΙΛΙΟΣ", 4: "ΜΑΙΟΣ", 5: "ΙΟΥΝΙΟΣ",
  6: "ΙΟΥΛΙΟΣ", 7: "ΑΥΓΟΥΣΤΟΣ", 8: "ΣΕΠΤΕΜΒΡΙΟΣ",
  9: "ΟΚΤΩΒΡΙΟΣ", 10: "ΝΟΕΜΒΡΙΟΣ", 11: "ΔΕΚΕΜΒΡΙΟΣ",
};

// ─── Google Drive helpers ────────────────────────────────────────────

async function getAccessToken(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: serviceAccountKey.client_email,
      scope: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets",
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
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signatureInput);

  const signatureB64 = uint8ToBase64(new Uint8Array(signature))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${payload}.${signatureB64}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
  return (await tokenRes.json()).access_token;
}

async function driveSearch(accessToken: string, query: string): Promise<any[]> {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${SHARED_DRIVE_ID}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).files || [];
}

async function createDriveFolder(accessToken: string, name: string, parentId: string): Promise<any> {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  if (!res.ok) throw new Error(`Create folder failed: ${await res.text()}`);
  return await res.json();
}

async function findOrCreateFolder(accessToken: string, name: string, parentId: string): Promise<any> {
  const existing = await driveSearch(
    accessToken,
    `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  if (existing.length > 0) return existing[0];
  return await createDriveFolder(accessToken, name, parentId);
}

async function uploadFileToDrive(
  accessToken: string, fileName: string, mimeType: string,
  fileData: Uint8Array, parentId: string
): Promise<any> {
  // Step 1: Initiate resumable upload session
  const metadata = { name: fileName, parents: [parentId] };
  const initRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(fileData.byteLength),
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!initRes.ok) throw new Error(`Upload init failed: ${await initRes.text()}`);
  
  const uploadUrl = initRes.headers.get("Location");
  if (!uploadUrl) throw new Error("No upload URL returned");

  // Step 2: Upload file content
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(fileData.byteLength),
    },
    body: fileData,
  });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${await uploadRes.text()}`);
  return await uploadRes.json();
}

// ─── Template-based Spreadsheet (Google Sheets API) ─────────────────

async function createAndFillTemplate(
  accessToken: string,
  parentFolderId: string,
  fileName: string,
  assignment: any,
  construction: any,
  works: any[],
  oteMaterials: any[],
  deltaMaterials: any[],
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ id: string; name: string }> {
  // 1. Download template from Supabase Storage
  const templateUrl = `${supabaseUrl}/storage/v1/object/authenticated/photos/templates/construction_template.xlsx`;
  const templateRes = await fetch(templateUrl, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!templateRes.ok) throw new Error(`Template download failed: ${templateRes.status}`);
  const templateData = new Uint8Array(await templateRes.arrayBuffer());
  console.log(`Template downloaded: ${templateData.length} bytes`);

  // 2. Upload to Drive as Google Sheet (with conversion) preserving all formatting
  const boundary = "boundary_" + Date.now();
  const metadata = JSON.stringify({
    name: fileName,
    parents: [parentFolderId],
    mimeType: "application/vnd.google-apps.spreadsheet",
  });

  const encoder = new TextEncoder();
  const preamble = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
  );
  const epilogue = encoder.encode(`\r\n--${boundary}--`);

  const body = new Uint8Array(preamble.length + templateData.length + epilogue.length);
  body.set(preamble, 0);
  body.set(templateData, preamble.length);
  body.set(epilogue, preamble.length + templateData.length);

  const uploadRes = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!uploadRes.ok) throw new Error(`Template upload failed: ${await uploadRes.text()}`);
  const uploadedFile = await uploadRes.json();
  const spreadsheetId = uploadedFile.id;
  console.log(`Template uploaded as Google Sheet: ${spreadsheetId}`);

  // 3. Get sheet name
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!metaRes.ok) throw new Error(`Sheet meta failed: ${await metaRes.text()}`);
  const metaData = await metaRes.json();
  const sheetName = metaData.sheets?.[0]?.properties?.title || "Sheet1";
  const s = (cell: string) => `'${sheetName}'!${cell}`;

  // 4. Read work codes (col A) and material codes (col I) to find row positions
  // First, read a broad range to understand the structure
  const debugUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${encodeURIComponent(s("A1:A15"))}&ranges=${encodeURIComponent(s("I1:I15"))}&ranges=${encodeURIComponent(s("A1:N1"))}`;
  const debugRes = await fetch(debugUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (debugRes.ok) {
    const debugData = await debugRes.json();
    const colAFirst = (debugData.valueRanges?.[0]?.values || []).map((r: any[]) => r[0] || "");
    const colIFirst = (debugData.valueRanges?.[1]?.values || []).map((r: any[]) => r[0] || "");
    const row1 = (debugData.valueRanges?.[2]?.values?.[0] || []);
    console.log("Col A first 15:", JSON.stringify(colAFirst));
    console.log("Col I first 15:", JSON.stringify(colIFirst));
    console.log("Row 1 cols:", JSON.stringify(row1));
  }

  // Now find where "Άρθρο" and "ΚΑΥ" headers are
  const scanUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(s("A1:N200"))}`;
  const scanRes = await fetch(scanUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!scanRes.ok) throw new Error(`Scan failed: ${await scanRes.text()}`);
  const scanData = await scanRes.json();
  const allRows: any[][] = scanData.values || [];

  // Find header row containing "Άρθρο"
  let workHeaderRow = -1;
  let workCodeCol = 0; // Column A
  let workQtyCol = -1;
  let matCodeCol = -1;
  let matQtyCol = -1;

  for (let r = 0; r < Math.min(allRows.length, 20); r++) {
    const row = allRows[r];
    for (let c = 0; c < (row?.length || 0); c++) {
      const val = (row[c] || "").toString().trim();
      if (val === "Άρθρο") {
        workHeaderRow = r;
        workCodeCol = c;
        console.log(`Found "Άρθρο" at row ${r + 1}, col ${c}`);
      }
      if (val === "ΠΟΣΟΤΗΤΑ" && workHeaderRow === r) {
        workQtyCol = c;
        console.log(`Found work "ΠΟΣΟΤΗΤΑ" at row ${r + 1}, col ${c}`);
      }
      if (val === "ΚΑΥ") {
        matCodeCol = c;
        console.log(`Found "ΚΑΥ" at row ${r + 1}, col ${c}`);
      }
    }
  }

  // Find material ΠΟΣΟΤΗΤΑ in the row after ΚΑΥ or same row
  if (matCodeCol >= 0) {
    for (let r = workHeaderRow; r < Math.min(allRows.length, workHeaderRow + 3); r++) {
      const row = allRows[r];
      for (let c = matCodeCol + 1; c < (row?.length || 0); c++) {
        if ((row[c] || "").toString().trim() === "ΠΟΣΟΤΗΤΑ") {
          matQtyCol = c;
          console.log(`Found material "ΠΟΣΟΤΗΤΑ" at row ${r + 1}, col ${c}`);
          break;
        }
      }
      if (matQtyCol >= 0) break;
    }
  }

  // Determine data start row (row after headers)
  const dataStartRow = workHeaderRow + 2; // Skip header + sub-header rows
  console.log(`Data starts at row ${dataStartRow + 1}`);

  // Extract work codes and material codes from actual positions
  const workCodes: string[] = [];
  const matCodes: string[] = [];
  for (let r = dataStartRow; r < allRows.length; r++) {
    const row = allRows[r] || [];
    workCodes.push((row[workCodeCol] || "").toString().trim());
    matCodes.push(matCodeCol >= 0 ? (row[matCodeCol] || "").toString().trim() : "");
  }
  console.log(`Template has ${workCodes.filter(Boolean).length} work codes, ${matCodes.filter(Boolean).length} material codes`);

  // Helper: column index to letter (0=A, 1=B, etc.)
  const colLetter = (c: number): string => String.fromCharCode(65 + c);

  // 5. Build batch update
  const updates: { range: string; values: any[][] }[] = [];

  // ── Header fields (find dynamically) ──
  const findLabel = (label: string): { r: number; c: number } | null => {
    for (let r = 0; r < Math.min(allRows.length, 15); r++) {
      for (let c = 0; c < (allRows[r]?.length || 0); c++) {
        const val = (allRows[r][c] || "").toString().trim();
        if (val === label || val.includes(label)) return { r, c };
      }
    }
    return null;
  };

  const fillHeader = (label: string, value: any, offset = 1) => {
    const pos = findLabel(label);
    if (pos) {
      const cellRef = `${colLetter(pos.c + offset)}${pos.r + 1}`;
      updates.push({ range: s(cellRef), values: [[value]] });
    }
  };

  fillHeader("ΠΕΡΙΟΧΗ", assignment.area || "");
  fillHeader("SR ID:", assignment.sr_id || "");
  fillHeader("SES ID:", construction.ses_id || "");
  fillHeader("ΗΜ/ΝΙΑ", new Date().toLocaleDateString("el-GR"));
  fillHeader("Α/Κ:", construction.ak || "");
  fillHeader("ΔΙΕΥΘΥΝΣΗ:", assignment.address || "");
  fillHeader("CAB:", construction.cab || "");
  fillHeader("ΕΙΔΟΣ ΟΔΕΥΣΗΣ:", construction.routing_type || "");
  fillHeader("ΑΝΑΜΟΝΗ:", construction.pending_note || "");
  fillHeader("ΟΡΟΦΟΙ:", construction.floors || 0);

  // ── Routes (KOI / ΦΥΡΑ) ──
  const koiPos = findLabel("KOI(m)");
  const fyraPos = findLabel("ΦΥΡΑ");
  const routes: any[] = construction.routes || [];
  if (koiPos && fyraPos) {
    // Route rows are below the KOI header
    for (const route of routes) {
      const label = (route.label || "").toLowerCase();
      // Search route rows for matching label
      for (let r = koiPos.r + 1; r < koiPos.r + 6 && r < allRows.length; r++) {
        const rowText = (allRows[r] || []).join(" ").toLowerCase();
        if (
          (label.includes("υπογ") && rowText.includes("υπογ")) ||
          (label.includes("εναεριο") && label.includes("δδ") && rowText.includes("εναεριο") && rowText.includes("δδ") && !rowText.includes("συνδρομ")) ||
          (label.includes("συνδρομ") && rowText.includes("συνδρομ")) ||
          (label.includes("inhouse") && rowText.includes("inhouse"))
        ) {
          updates.push({ range: s(`${colLetter(koiPos.c)}${r + 1}`), values: [[route.koi || 0]] });
          updates.push({ range: s(`${colLetter(fyraPos.c)}${r + 1}`), values: [[route.fyra_koi || 0]] });
          break;
        }
      }
    }
    // Totals row
    const totalKoi = routes.reduce((sum: number, r: any) => sum + (r.koi || 0), 0);
    const totalFyra = routes.reduce((sum: number, r: any) => sum + (r.fyra_koi || 0), 0);
    const totalPos = findLabel("Συνολο");
    if (totalPos) {
      updates.push({ range: s(`${colLetter(koiPos.c)}${totalPos.r + 1}`), values: [[totalKoi]] });
      updates.push({ range: s(`${colLetter(fyraPos.c)}${totalPos.r + 1}`), values: [[totalFyra]] });
    }
  }

  // ── Work quantities ──
  // Normalize codes: convert Roman numerals (I,II,III,...) to Arabic (1,2,3,...) and vice versa
  const romanToArabic: Record<string, string> = {
    "I": "1", "II": "2", "III": "3", "IV": "4", "V": "5",
    "VI": "6", "VII": "7", "VIII": "8", "IX": "9", "X": "10",
    "i": "1", "ii": "2", "iii": "3", "iv": "4", "v": "5",
    "vi": "6", "vii": "7", "viii": "8", "ix": "9", "x": "10",
  };
  const arabicToRoman: Record<string, string> = {
    "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V",
    "6": "VI", "7": "VII", "8": "VIII", "9": "IX", "10": "X",
  };

  // Normalize a code by converting all Roman numeral parts to Arabic
  const normalizeCode = (code: string): string => {
    return code.replace(/\.+$/, "").split(".").map(part => {
      const upper = part.toUpperCase();
      return romanToArabic[upper] || part;
    }).join(".");
  };

  const worksMap = new Map<string, number>();
  for (const w of works) {
    const code = (w.code || "").trim().replace(/\.+$/, "");
    if (code) {
      const normalized = normalizeCode(code);
      worksMap.set(normalized, w.quantity || 0);
      // Also store original in case of exact match
      worksMap.set(code, w.quantity || 0);
    }
  }
  if (workQtyCol >= 0) {
    for (let i = 0; i < workCodes.length; i++) {
      const rawCode = workCodes[i].replace(/\.+$/, "");
      if (!rawCode) continue;
      const normalized = normalizeCode(rawCode);
      const qty = worksMap.get(rawCode) ?? worksMap.get(normalized);
      if (qty !== undefined && qty > 0) {
        const row = dataStartRow + i + 1; // +1 for 1-indexed
        updates.push({ range: s(`${colLetter(workQtyCol)}${row}`), values: [[qty]] });
        console.log(`Work code ${rawCode} (normalized: ${normalized}) → qty ${qty} at row ${row}`);
      }
    }
  }

  // ── Material quantities ──
  const allMaterials = [...oteMaterials, ...deltaMaterials];
  const matsMap = new Map<string, number>();
  for (const m of allMaterials) {
    if (m.code) {
      const key = m.code.trim();
      matsMap.set(key, (matsMap.get(key) || 0) + (m.quantity || 0));
    }
  }
  if (matQtyCol >= 0) {
    for (let i = 0; i < matCodes.length; i++) {
      const code = matCodes[i];
      if (!code) continue;
      const qty = matsMap.get(code);
      if (qty !== undefined && qty > 0) {
        const row = dataStartRow + i + 1;
        updates.push({ range: s(`${colLetter(matQtyCol)}${row}`), values: [[qty]] });
      }
    }
  }

  // 6. Apply batch update
  console.log(`Applying ${updates.length} cell updates to spreadsheet`);
  if (updates.length > 0) {
    const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
    const batchRes = await fetch(batchUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: updates,
      }),
    });
    if (!batchRes.ok) {
      const errText = await batchRes.text();
      console.error("Batch update error:", errText);
      throw new Error(`Batch update failed: ${errText}`);
    }
    await batchRes.json();
  }

  return { id: spreadsheetId, name: fileName };
}

// ─── Font Loading ────────────────────────────────────────────────────

let _fontCache: { regular: Uint8Array; bold: Uint8Array } | null = null;

async function loadGreekFonts(): Promise<{ regular: Uint8Array; bold: Uint8Array }> {
  if (_fontCache) return _fontCache;
  
  // Use fonts.googleapis.com CSS to discover TTF URLs
  const cssRes = await fetch("https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!cssRes.ok) {
    console.error("CSS fetch failed:", cssRes.status, await cssRes.text());
    throw new Error("Failed to fetch font CSS");
  }
  const css = await cssRes.text();
  
  // Extract TTF URLs from CSS
  const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/g)].map(m => m[1]);
  console.log("Found font URLs:", urls.length);
  
  if (urls.length < 2) {
    // Fallback: use known static URLs
    const [regularRes, boldRes] = await Promise.all([
      fetch("https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf"),
      fetch("https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc9.ttf"),
    ]);
    if (!regularRes.ok || !boldRes.ok) {
      throw new Error("Failed to fetch Greek fonts (fallback)");
    }
    _fontCache = {
      regular: new Uint8Array(await regularRes.arrayBuffer()),
      bold: new Uint8Array(await boldRes.arrayBuffer()),
    };
    return _fontCache;
  }
  
  // Last 2 URLs are typically the latin/greek ones for 400 and 700
  const regularUrl = urls.find(u => css.indexOf(u) > css.indexOf("font-weight: 400")) || urls[0];
  const boldUrl = urls.find(u => css.indexOf(u) > css.lastIndexOf("font-weight: 700")) || urls[urls.length - 1];
  
  const [regularRes, boldRes] = await Promise.all([
    fetch(regularUrl),
    fetch(boldUrl),
  ]);
  
  if (!regularRes.ok || !boldRes.ok) {
    throw new Error("Failed to fetch Greek fonts");
  }
  
  _fontCache = {
    regular: new Uint8Array(await regularRes.arrayBuffer()),
    bold: new Uint8Array(await boldRes.arrayBuffer()),
  };
  return _fontCache;
}

// ─── PDF Generation ──────────────────────────────────────────────────

async function generateWorksPdf(
  assignment: any,
  construction: any,
  works: any[]
): Promise<Uint8Array> {
  const fonts = await loadGreekFonts();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fonts.regular);
  const boldFont = await pdf.embedFont(fonts.bold);
  
  let page = pdf.addPage([595, 842]); // A4
  let y = 800;
  const margin = 40;

  // Title
  page.drawText("ΤΙΜΟΛΟΓΗΣΗ ΕΡΓΑΣΙΩΝ FTTH", {
    x: margin, y, font: boldFont, size: 14, color: rgb(0, 0, 0.6),
  });
  y -= 25;

  // Header info
  const headerLines = [
    `SR ID: ${assignment.sr_id}    SES ID: ${construction.ses_id || "-"}`,
    `CAB: ${construction.cab || "-"}    Α/Κ: ${construction.ak || "-"}    Όροφοι: ${construction.floors || 0}`,
    `Πελάτης: ${assignment.customer_name || "-"}    Περιοχή: ${assignment.area}`,
    `Είδος Όδευσης: ${construction.routing_type || "-"}    Αναμονή: ${construction.pending_note || "-"}`,
    `Ημερομηνία: ${new Date().toLocaleDateString("el-GR")}`,
  ];
  for (const line of headerLines) {
    page.drawText(line, { x: margin, y, font, size: 9, color: rgb(0.2, 0.2, 0.2) });
    y -= 15;
  }

  // Routes section
  const routes = construction.routes || [];
  if (routes.length > 0) {
    y -= 5;
    page.drawText("ΔΙΑΔΡΟΜΕΣ:", { x: margin, y, font: boldFont, size: 9, color: rgb(0, 0, 0.5) });
    y -= 14;
    for (const r of routes) {
      if (r.koi || r.fyra_koi) {
        page.drawText(`${r.label}: KOI ${r.koi || 0}m | ΦΥΡΑ ${r.fyra_koi || 0}m`, {
          x: margin + 10, y, font, size: 8, color: rgb(0.3, 0.3, 0.3),
        });
        y -= 12;
      }
    }
  }
  y -= 10;

  // Table header
  page.drawRectangle({ x: margin, y: y - 2, width: 515, height: 16, color: rgb(0.9, 0.9, 0.95) });
  const cols = [margin, margin + 70, margin + 330, margin + 390, margin + 440, margin + 490];
  const headers = ["Κωδικός", "Περιγραφή", "Ποσότητα", "Τιμή", "Σύνολο"];
  headers.forEach((h, i) => {
    page.drawText(h, { x: cols[i], y, font: boldFont, size: 8, color: rgb(0, 0, 0) });
  });
  y -= 18;

  // Works rows
  let totalRevenue = 0;
  for (const w of works) {
    if (y < 60) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    const subtotal = (w.unit_price || 0) * (w.quantity || 0);
    totalRevenue += subtotal;
    
    const desc = (w.description || "").substring(0, 55);
    
    page.drawText(w.code || "", { x: cols[0], y, font, size: 7.5 });
    page.drawText(desc, { x: cols[1], y, font, size: 7 });
    page.drawText(String(w.quantity || 0), { x: cols[2], y, font, size: 7.5 });
    page.drawText(`${(w.unit_price || 0).toFixed(2)}`, { x: cols[3], y, font, size: 7.5 });
    page.drawText(`${subtotal.toFixed(2)}`, { x: cols[4], y, font, size: 7.5 });
    y -= 14;
  }

  // Total
  y -= 10;
  page.drawRectangle({ x: margin, y: y - 2, width: 515, height: 18, color: rgb(0.85, 0.92, 0.85) });
  page.drawText(`ΣΥΝΟΛΟ ΕΡΓΑΣΙΩΝ: ${totalRevenue.toFixed(2)}€`, {
    x: cols[3] - 60, y, font: boldFont, size: 10, color: rgb(0, 0.4, 0),
  });

  return pdf.save();
}

async function generateMaterialsPdf(
  assignment: any,
  construction: any,
  materials: any[],
  source: string,
  title: string
): Promise<Uint8Array> {
  const fonts = await loadGreekFonts();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fonts.regular);
  const boldFont = await pdf.embedFont(fonts.bold);
  
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const margin = 40;

  // Title
  page.drawText(title, {
    x: margin, y, font: boldFont, size: 14, color: rgb(0, 0, 0.6),
  });
  y -= 25;

  // Header
  const headerLines = [
    `SR ID: ${assignment.sr_id}    CAB: ${construction.cab || "-"}`,
    `Πελάτης: ${assignment.customer_name || "-"}    Περιοχή: ${assignment.area}`,
    `Ημερομηνία: ${new Date().toLocaleDateString("el-GR")}`,
  ];
  for (const line of headerLines) {
    page.drawText(line, { x: margin, y, font, size: 9, color: rgb(0.2, 0.2, 0.2) });
    y -= 15;
  }
  y -= 10;

  // Table header
  page.drawRectangle({ x: margin, y: y - 2, width: 515, height: 16, color: rgb(0.9, 0.9, 0.95) });
  const cols = [margin, margin + 80, margin + 370, margin + 420, margin + 470];
  const headers = ["Κωδικός", "Περιγραφή", "ΜΜ", "Ποσότητα"];
  headers.forEach((h, i) => {
    page.drawText(h, { x: cols[i], y, font: boldFont, size: 8 });
  });
  y -= 18;

  for (const m of materials) {
    if (y < 60) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    const desc = (m.name || "").substring(0, 60);
    
    page.drawText(m.code || "", { x: cols[0], y, font, size: 7.5 });
    page.drawText(desc, { x: cols[1], y, font, size: 7 });
    page.drawText(m.unit || "", { x: cols[2], y, font, size: 7.5 });
    page.drawText(String(m.quantity || 0), { x: cols[3], y, font, size: 7.5 });
    y -= 14;
  }

  // Total count
  y -= 10;
  const totalItems = materials.reduce((s: number, m: any) => s + (m.quantity || 0), 0);
  page.drawText(`Σύνολο ειδών: ${materials.length} | Σύνολο ποσότητας: ${totalItems}`, {
    x: margin, y, font: boldFont, size: 9,
  });

  return pdf.save();
}

// ─── Main Handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { construction_id, photo_paths } = body;

    if (!construction_id) {
      return new Response(JSON.stringify({ error: "construction_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch construction with assignment
    const { data: construction, error: constErr } = await adminClient
      .from("constructions")
      .select("*")
      .eq("id", construction_id)
      .single();
    if (constErr || !construction) throw new Error("Construction not found");

    const { data: assignment, error: assignErr } = await adminClient
      .from("assignments")
      .select("*")
      .eq("id", construction.assignment_id)
      .single();
    if (assignErr || !assignment) throw new Error("Assignment not found");

    // Fetch works with pricing info
    const { data: worksRaw } = await adminClient
      .from("construction_works")
      .select("*, work_pricing:work_pricing_id(code, description, unit)")
      .eq("construction_id", construction_id);

    const works = (worksRaw || []).map((w: any) => ({
      code: w.work_pricing?.code || "",
      description: w.work_pricing?.description || "",
      unit: w.work_pricing?.unit || "",
      unit_price: w.unit_price,
      quantity: w.quantity,
      subtotal: w.subtotal,
    }));

    // Fetch materials with material info
    const { data: matsRaw } = await adminClient
      .from("construction_materials")
      .select("*, material:material_id(code, name, unit, price, source)")
      .eq("construction_id", construction_id);

    const allMaterials = (matsRaw || []).map((m: any) => ({
      code: m.material?.code || "",
      name: m.material?.name || "",
      unit: m.material?.unit || "",
      price: m.material?.price || 0,
      source: m.material?.source || m.source,
      quantity: m.quantity,
    }));

    const oteMaterials = allMaterials.filter((m: any) => m.source === "OTE");
    const deltaMaterials = allMaterials.filter((m: any) => m.source === "DELTANETWORK");

    console.log(`Generating docs for SR ${assignment.sr_id}: ${works.length} works, ${oteMaterials.length} OTE mats, ${deltaMaterials.length} DN mats`);

    // Generate PDFs
    const worksPdf = await generateWorksPdf(assignment, construction, works);
    const otePdf = oteMaterials.length > 0
      ? await generateMaterialsPdf(assignment, construction, oteMaterials, "OTE", "ΔΕΛΤΙΟ ΑΠΟΣΤΟΛΗΣ ΥΛΙΚΩΝ ΟΤΕ")
      : null;
    const deltaPdf = deltaMaterials.length > 0
      ? await generateMaterialsPdf(assignment, construction, deltaMaterials, "DELTANETWORK", "ΔΕΛΤΙΟ ΑΠΟΣΤΟΛΗΣ ΥΛΙΚΩΝ DELTANETWORK")
      : null;

    // Google Drive upload
    const serviceAccountKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKeyStr) {
      return new Response(JSON.stringify({
        success: true,
        drive_uploaded: false,
        message: "Files generated but Google Drive not configured",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const serviceAccountKey = JSON.parse(serviceAccountKeyStr);
    const accessToken = await getAccessToken(serviceAccountKey);

    // Find existing SR folder
    const rootId = areaRootFolders[assignment.area];
    if (!rootId) throw new Error(`Unknown area: ${assignment.area}`);

    const currentMonth = greekMonths[new Date().getMonth()];
    const monthFolder = await findOrCreateFolder(accessToken, currentMonth, rootId);

    // Search in all possible parent folders for the SR folder
    const searchParents = [monthFolder.id];
    const subfolderNames = ["ΑΝΑΜΟΝΗ", "ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ", "ΠΡΟΔΕΣΜΕΥΣΗ ΓΙΑ ΚΑΤΑΣΚΕΥΗ", "ΠΑΡΑΔΩΤΕΑ"];
    for (const sfName of subfolderNames) {
      const sf = await driveSearch(
        accessToken,
        `name = '${sfName}' and '${monthFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      );
      if (sf.length > 0) searchParents.push(sf[0].id);
    }

    let srFolder: any = null;
    for (const parentId of searchParents) {
      const found = await driveSearch(
        accessToken,
        `name contains '${assignment.sr_id}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      );
      if (found.length > 0) {
        srFolder = found[0];
        break;
      }
    }

    // If no SR folder found, create one
    if (!srFolder) {
      const folderName = `${assignment.sr_id} - ${assignment.customer_name || "ΠΕΛΑΤΗΣ"} - ${assignment.address || ""}`.trim();
      srFolder = await createDriveFolder(accessToken, folderName, monthFolder.id);
      console.log(`Created new SR folder: ${srFolder.name}`);
    }

    // Create ΚΑΤΑΣΚΕΥΗ subfolder
    const constructionFolder = await findOrCreateFolder(accessToken, "ΚΑΤΑΣΚΕΥΗ", srFolder.id);
    console.log(`Construction folder: ${constructionFolder.id}`);

    // Upload all files
    const srId = assignment.sr_id;
    const uploadResults: any[] = [];

    // 1. ΦΥΛΛΟ ΑΠΟΛΟΓΙΣΜΟΥ — upload template as Google Sheet & fill via Sheets API
    const templateResult = await createAndFillTemplate(
      accessToken, constructionFolder.id,
      `ΦΥΛΛΟ_ΑΠΟΛΟΓΙΣΜΟΥ_${srId}`,
      assignment, construction, works, oteMaterials, deltaMaterials,
      supabaseUrl, serviceRoleKey
    );
    uploadResults.push({ type: "spreadsheet", name: templateResult.name, id: templateResult.id });

    // 2. Works PDF
    const worksPdfResult = await uploadFileToDrive(
      accessToken, `ΤΙΜΟΛΟΓΗΣΗ_ΕΡΓΑΣΙΩΝ_${srId}.pdf`,
      "application/pdf",
      new Uint8Array(worksPdf), constructionFolder.id
    );
    uploadResults.push({ type: "works_pdf", name: worksPdfResult.name, id: worksPdfResult.id });

    // 3. OTE Materials PDF
    if (otePdf) {
      const oteResult = await uploadFileToDrive(
        accessToken, `ΔΕΛΤΙΟ_ΑΠΟΣΤΟΛΗΣ_ΟΤΕ_${srId}.pdf`,
        "application/pdf",
        new Uint8Array(otePdf), constructionFolder.id
      );
      uploadResults.push({ type: "ote_pdf", name: oteResult.name, id: oteResult.id });
    }

    // 4. DELTANETWORK Materials PDF
    if (deltaPdf) {
      const deltaResult = await uploadFileToDrive(
        accessToken, `ΔΕΛΤΙΟ_ΑΠΟΣΤΟΛΗΣ_DELTANETWORK_${srId}.pdf`,
        "application/pdf",
        new Uint8Array(deltaPdf), constructionFolder.id
      );
      uploadResults.push({ type: "delta_pdf", name: deltaResult.name, id: deltaResult.id });
    }

    // 5. Upload photos from Supabase storage
    if (photo_paths && photo_paths.length > 0) {
      for (const photoPath of photo_paths) {
        try {
          const { data: fileData, error: dlErr } = await adminClient.storage
            .from("photos")
            .download(photoPath);
          if (dlErr || !fileData) {
            console.error(`Failed to download photo ${photoPath}:`, dlErr);
            continue;
          }
          const arrayBuf = await fileData.arrayBuffer();
          const fileName = photoPath.split("/").pop() || `photo_${Date.now()}.jpg`;
          const mimeType = fileName.endsWith(".png") ? "image/png" : "image/jpeg";
          
          const photoResult = await uploadFileToDrive(
            accessToken, fileName, mimeType,
            new Uint8Array(arrayBuf), constructionFolder.id
          );
          uploadResults.push({ type: "photo", name: photoResult.name, id: photoResult.id });
        } catch (photoErr: any) {
          console.error(`Photo upload error: ${photoErr.message}`);
        }
      }
    }

    // Update construction drive folder URL
    await adminClient
      .from("constructions")
      .update({ status: "completed" })
      .eq("id", construction_id);

    // Update assignment drive_folder_url if not set
    if (!assignment.drive_folder_url) {
      await adminClient
        .from("assignments")
        .update({ drive_folder_url: srFolder.webViewLink || `https://drive.google.com/drive/folders/${srFolder.id}` })
        .eq("id", assignment.id);
    }

    return new Response(JSON.stringify({
      success: true,
      drive_uploaded: true,
      sr_folder: { id: srFolder.id, name: srFolder.name, url: srFolder.webViewLink },
      construction_folder: { id: constructionFolder.id, url: constructionFolder.webViewLink },
      files: uploadResults,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
