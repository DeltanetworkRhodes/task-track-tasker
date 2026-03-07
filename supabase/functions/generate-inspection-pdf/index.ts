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

// ─── Google Drive helpers ────────────────────────────────────────────

async function getAccessToken(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: serviceAccountKey.client_email,
      scope: "https://www.googleapis.com/auth/drive",
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
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signatureInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signatureInput);
  const signatureB64 = uint8ToBase64(new Uint8Array(signature))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${header}.${payload}.${signatureB64}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
  return (await tokenRes.json()).access_token;
}

const SHARED_DRIVE_ID = "0AN9VpmNEa7QBUk9PVA";

async function driveSearch(accessToken: string, query: string): Promise<any[]> {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${SHARED_DRIVE_ID}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).files || [];
}

async function findOrCreateDriveFolder(accessToken: string, name: string, parentId: string): Promise<any> {
  const existing = await driveSearch(
    accessToken,
    `name = '${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  if (existing.length > 0) return existing[0];

  const createRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    }
  );

  if (!createRes.ok) throw new Error(`Create folder failed: ${await createRes.text()}`);
  return await createRes.json();
}

async function uploadFileToDrive(
  accessToken: string, fileName: string, mimeType: string,
  fileData: Uint8Array, parentId: string
): Promise<any> {
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
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType, "Content-Length": String(fileData.byteLength) },
    body: fileData,
  });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${await uploadRes.text()}`);
  return await uploadRes.json();
}

// ─── PDF Generation (Template Overlay) ───────────────────────────────

const BLACK = rgb(0, 0, 0);

const FLOOR_CHECK_COORDS: Record<string, { x: number; y: number }> = {
  basement: { x: 95, y: 714 },
  "semi-basement": { x: 365, y: 714 },
  ground: { x: 95, y: 641 },
  "half-floor": { x: 365, y: 641 },
  "1": { x: 95, y: 568 },
  "2": { x: 365, y: 568 },
  "3": { x: 95, y: 495 },
  "4": { x: 365, y: 495 },
  "5": { x: 95, y: 422 },
  "6": { x: 365, y: 422 },
  "7": { x: 95, y: 349 },
  "8": { x: 365, y: 349 },
};

interface InspectionData {
  [key: string]: any;
}

function normalizeFloor(value: string | null | undefined): string {
  const v = (value || "").toLowerCase().trim();
  if (v.includes("υπογ") && !v.includes("ημι")) return "basement";
  if (v.includes("ημιυπο")) return "semi-basement";
  if (v.includes("ισο")) return "ground";
  if (v.includes("ημιο")) return "half-floor";
  const n = v.replace(/[^0-9]/g, "");
  return n || "";
}

function drawText(page: any, text: string, x: number, y: number, font: any, size = 8.5) {
  if (!text) return;
  page.drawText(text, { x, y, size, font, color: BLACK });
}

function drawCheck(page: any, checked: boolean, x: number, y: number, font: any) {
  if (!checked) return;
  page.drawText("X", { x, y, size: 9, font, color: BLACK });
}

function drawWrappedText(page: any, text: string, x: number, startY: number, maxWidth: number, lineHeight: number, font: any, size: number, maxLines = 6) {
  if (!text) return;
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let y = startY;
  let lines = 0;

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
      continue;
    }

    drawText(page, line, x, y, font, size);
    y -= lineHeight;
    lines += 1;
    if (lines >= maxLines) return;
    line = word;
  }

  if (line && lines < maxLines) drawText(page, line, x, y, font, size);
}

async function embedSignature(pdfDoc: any, page: any, dataUrl: string, x: number, y: number, maxW = 130, maxH = 32) {
  if (!dataUrl || !dataUrl.startsWith("data:image/png;base64,")) return;
  try {
    const base64 = dataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const img = await pdfDoc.embedPng(bytes);
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    page.drawImage(img, { x, y, width: img.width * scale, height: img.height * scale });
  } catch (e) {
    console.error("Signature embed error:", e);
  }
}

async function generateInspectionPdf(data: InspectionData, templateBytes: Uint8Array): Promise<Uint8Array> {
  const [fontBytes, boldFontBytes] = await Promise.all([
    fetch("https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/greek-400-normal.woff").then((r) => r.arrayBuffer()),
    fetch("https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/greek-700-normal.woff").then((r) => r.arrayBuffer()),
  ]);

  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });
  const boldFont = await pdfDoc.embedFont(boldFontBytes, { subset: true });

  const pages = pdfDoc.getPages();
  if (pages.length < 4) throw new Error("Το template PDF πρέπει να έχει 4 σελίδες");

  // ─── Page 1: Στοιχεία Πελάτη / Διαχειριστή / Τεχν. Υπηρεσίας ───
  const p1 = pages[0];
  const pageHeight = p1.getHeight();
  console.log(`Page 1 dimensions: ${p1.getWidth()} x ${pageHeight}`);
  
  // Row positions (Y from bottom) - calibrated v4
  drawText(p1, data.customer_name || "", 185, 652, font);         // ΟΝΟΜΑΤΕΠΩΝΥΜΟ
  drawText(p1, data.customer_father_name || "", 466, 652, font);  // ΟΝΟΜΑ ΠΑΤΡΟΣ
  drawText(p1, data.customer_mobile || "", 172, 616, font);       // ΤΗΛΕΦΩΝΟ (κινητό)
  drawText(p1, data.customer_phone || "", 176, 586, font);        // ΤΗΛΕΦΩΝΟ (σταθερό)
  drawText(p1, data.customer_email || "", 82, 554, font);         // EMAIL
  drawText(p1, data.customer_street || "", 72, 506, font);        // ΟΔΟΣ
  drawText(p1, data.customer_number || "", 292, 506, font);       // ΑΡΙΘ.
  drawText(p1, data.customer_postal_code || "", 385, 506, font);  // Τ.Κ.
  drawText(p1, data.customer_floor || "", 92, 474, font);         // ΟΡΟΦΟΣ
  drawText(p1, data.customer_apartment_code || "", 250, 474, font); // ΚΩΔ. ΔΙΑΜ/ΤΟΣ
  drawText(p1, data.customer_county || "", 368, 474, font);       // ΝΟΜΟΣ
  drawText(p1, data.customer_municipality || "", 470, 474, font); // ΔΗΜΟΣ
  drawWrappedText(p1, data.customer_notes || "", 35, 424, 520, 12, font, 8, 6); // Παρατηρήσεις

  drawText(p1, data.manager_name || "", 170, 301, font);          // Διαχειριστής ΟΝΟΜΑΤΕΠΩΝΥΜΟ
  drawText(p1, data.manager_mobile || "", 214, 269, font);        // Τηλέφωνο Διαχειριστή
  drawText(p1, data.manager_email || "", 82, 236, font);          // Email Διαχειριστή

  drawText(p1, data.service_address || "", 190, 176, font);       // Αρμόδια Τεχνική Υπηρεσία
  drawText(p1, data.service_phone || "", 224, 146, font);         // Τηλέφωνο Υπηρεσίας
  drawText(p1, data.service_email || "", 82, 114, font);          // Email Υπηρεσίας
  drawText(p1, data.technician_name || "", 350, 74, font);        // Τεχνικός

  const p2 = pages[1];
  drawCheck(p2, !!data.routing_escalit, 123, 730, boldFont);
  drawCheck(p2, !!data.routing_external_pipe, 311, 730, boldFont);
  drawCheck(p2, !!data.routing_aerial, 427, 730, boldFont);
  drawCheck(p2, !!data.routing_other, 542, 730, boldFont);
  drawText(p2, data.routing_other || "", 468, 707, font, 7);

  drawCheck(p2, data.excavation_to_pipe === true, 132, 657, boldFont);
  drawCheck(p2, data.excavation_to_pipe === false, 172, 657, boldFont);
  drawCheck(p2, data.excavation_to_rg === true, 332, 657, boldFont);
  drawCheck(p2, data.excavation_to_rg === false, 374, 657, boldFont);
  drawCheck(p2, !!data.pipe_placement, 322, 592, boldFont);
  drawCheck(p2, !!data.wall_mount, 542, 592, boldFont);
  drawCheck(p2, !!data.fence_building_mount, 542, 578, boldFont);
  drawCheck(p2, !!data.excavation_to_building, 542, 550, boldFont);

  const bepCoords: Record<string, { x: number; y: number }> = {
    internal: { x: 106, y: 580 },
    external: { x: 106, y: 564 },
    fence: { x: 219, y: 580 },
    building: { x: 219, y: 564 },
    pole: { x: 327, y: 580 },
    pillar: { x: 327, y: 564 },
    basement: { x: 439, y: 580 },
    ground: { x: 439, y: 564 },
    rooftop: { x: 525, y: 580 },
    piloti: { x: 525, y: 564 },
  };
  const bep = bepCoords[data.bep_position || ""];
  if (bep) drawCheck(p2, true, bep.x, bep.y, boldFont);

  const vertCoords: Record<string, { x: number; y: number }> = {
    shaft: { x: 100, y: 528 },
    staircase: { x: 258, y: 528 },
    lightwell: { x: 376, y: 528 },
    other: { x: 477, y: 528 },
    elevator: { x: 100, y: 512 },
    internal_external: { x: 258, y: 512 },
    lantern: { x: 376, y: 512 },
  };
  const vertical = vertCoords[data.vertical_routing || ""];
  if (vertical) drawCheck(p2, true, vertical.x, vertical.y, boldFont);

  drawWrappedText(p2, data.sketch_notes || "", 35, 168, 525, 12, font, 8, 4);
  drawText(p2, data.optical_socket_position || "", 125, 133, font, 8);

  if (data.engineer_signature) await embedSignature(pdfDoc, p2, data.engineer_signature, 420, 122);
  if (data.customer_signature) await embedSignature(pdfDoc, p2, data.customer_signature, 420, 93);
  if (data.manager_signature) await embedSignature(pdfDoc, p2, data.manager_signature, 420, 64);

  const p3 = pages[2];
  drawText(p3, data.declarant_name || "", 180, 678, font);
  drawText(p3, data.declarant_id_number || "", 456, 678, font);
  drawText(p3, data.declarant_city || "", 92, 648, font);
  drawText(p3, data.declarant_street || "", 246, 648, font);
  drawText(p3, data.declarant_number || "", 394, 648, font);
  drawText(p3, data.declarant_postal_code || "", 467, 648, font);

  drawCheck(p3, data.cost_option === "ote_covers", 47, 522, boldFont);
  drawCheck(p3, data.cost_option !== "ote_covers", 47, 500, boldFont);

  drawText(p3, data.declaration_date || "", 170, 450, font);
  if (data.declaration_signature) await embedSignature(pdfDoc, p3, data.declaration_signature, 125, 365, 210, 45);

  const p4 = pages[3];
  drawText(p4, data.building_address || "", 102, 790, font);
  drawText(p4, data.building_id || "", 367, 766, font);

  const floorKey = normalizeFloor(data.customer_floor_select);
  if (floorKey && FLOOR_CHECK_COORDS[floorKey]) {
    const c = FLOOR_CHECK_COORDS[floorKey];
    drawCheck(p4, true, c.x, c.y, boldFont);
  }

  drawText(p4, String(data.total_apartments ?? ""), 188, 360, font);
  drawText(p4, String(data.total_shops ?? ""), 188, 327, font);
  drawText(p4, String(data.total_spaces ?? ""), 188, 294, font);
  drawText(p4, String(data.total_floors ?? ""), 188, 261, font);

  drawText(p4, data.sr_id || "", 395, 360, font);
  drawText(p4, data.cabinet || "", 395, 327, font);
  drawText(p4, data.pipe_code || "", 395, 294, font);

  const bcpRowY: Record<string, number> = { SMALL: 264, MEDIUM: 246 };
  const bcpBrandX: Record<string, number> = { RAYCAP: 214, ZTT: 277 };
  const bcpSize = (data.bcp_size || "").toUpperCase();
  const bcpBrand = (data.bcp_brand || "").toUpperCase();
  if (bcpRowY[bcpSize] && bcpBrandX[bcpBrand]) drawCheck(p4, true, bcpBrandX[bcpBrand], bcpRowY[bcpSize], boldFont);

  drawCheck(p4, !!data.bcp_floorbox, 385, 266, boldFont);
  drawCheck(p4, !!data.bcp_drop_4, 436, 266, boldFont);
  drawCheck(p4, !!data.bcp_drop_6, 486, 266, boldFont);
  drawCheck(p4, !!data.bcp_drop_12, 536, 266, boldFont);

  const bepRowY: Record<string, number> = { SMALL: 202, MEDIUM: 184, LARGE: 166, XLARGE: 148 };
  const bepBrandX: Record<string, number> = { RAYCAP: 214, ZTT: 277 };
  const bepSize = (data.bep_size || "").toUpperCase();
  const bepBrand = (data.bep_brand || "").toUpperCase();
  if (bepRowY[bepSize] && bepBrandX[bepBrand]) drawCheck(p4, true, bepBrandX[bepBrand], bepRowY[bepSize], boldFont);
  if (bepRowY[bepSize]) drawText(p4, data.bep_capacity || "", 350, bepRowY[bepSize], font, 8);

  const bmoRowY: Record<string, number> = { SMALL: 102, MEDIUM: 84, LARGE: 66 };
  const bmoBrandX: Record<string, number> = { RAYCAP: 214, ZTT: 277 };
  const bmoSize = (data.bmo_size || "").toUpperCase();
  const bmoBrand = (data.bmo_brand || "").toUpperCase();
  if (bmoRowY[bmoSize] && bmoBrandX[bmoBrand]) drawCheck(p4, true, bmoBrandX[bmoBrand], bmoRowY[bmoSize], boldFont);
  if (bmoRowY[bmoSize]) drawText(p4, data.bmo_capacity || "", 350, bmoRowY[bmoSize], font, 8);

  return new Uint8Array(await pdfDoc.save());
}

// ─── Main handler ────────────────────────────────────────────────────

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

    // Verify auth
    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { assignment_id, sr_id, area } = await req.json();
    if (!assignment_id || !sr_id) {
      return new Response(JSON.stringify({ error: "Missing assignment_id or sr_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generating inspection PDF for SR ${sr_id}`);

    // Get inspection report data
    const { data: report, error: reportErr } = await adminClient
      .from("inspection_reports")
      .select("*")
      .eq("assignment_id", assignment_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reportErr || !report) {
      return new Response(JSON.stringify({ error: "Inspection report not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load PDF template from storage + generate PDF
    const { data: templateFile, error: templateErr } = await adminClient
      .storage
      .from("surveys")
      .download("templates/inspection_template.pdf");

    if (templateErr || !templateFile) {
      throw new Error(`Template load failed: ${templateErr?.message || "not found"}`);
    }

    const templateBytes = new Uint8Array(await templateFile.arrayBuffer());
    const pdfBytes = await generateInspectionPdf(report, templateBytes);
    console.log(`PDF generated: ${(pdfBytes.length / 1024).toFixed(0)}KB`);
    let driveUrl = "";
    const serviceAccountKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");

    if (serviceAccountKeyStr) {
      try {
        const serviceAccountKey = JSON.parse(serviceAccountKeyStr);
        const accessToken = await getAccessToken(serviceAccountKey);

        // Find the SR folder's ΕΓΓΡΑΦΑ subfolder
        const { data: assignment } = await adminClient
          .from("assignments")
          .select("drive_folder_url, drive_egrafa_url")
          .eq("id", assignment_id)
          .single();

        let targetFolderId = "";

        const extractFolderId = (url?: string | null) => {
          if (!url) return "";
          const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
          return match?.[1] || "";
        };

        // 1) Prefer explicit ΕΓΓΡΑΦΑ URL from assignment
        targetFolderId = extractFolderId(assignment?.drive_egrafa_url);

        // 2) Resolve SR parent folder from assignment or fallback by SR name search
        let parentFolderId = extractFolderId(assignment?.drive_folder_url);
        let parentFolderUrl = assignment?.drive_folder_url || "";

        if (!parentFolderId && sr_id) {
          const safeSrId = String(sr_id).replace(/'/g, "\\'");
          const searchFolderIds = [
            "1JvcSG3tiOplSujXhb3yj_ELQLjfrgOzO", // ΡΟΔΟΣ
            "1X1mtK4tV_sgGM9IdizNSK7AS19qX1nYl", // ΚΩΣ
            "1dal55zb0uv5__e1pDk2fLFMB0ogi1OnZ", // ΡΟΔΟΣ/ΜΑΡΤΙΟΣ/ΠΡΟΔΕΣΜΕΥΣΗ ΓΙΑ ΚΑΤΑΣΚΕΥΗ
            "16Dr_1g6AkaypkyoePwcfZ8IanPX5TXeZ", // ΡΟΔΟΣ/ΜΑΡΤΙΟΣ/ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ
            "1azAHjT8LS8R3JOq0jYNh1UdBx4SYn-iM", // ΡΟΔΟΣ/ΜΑΡΤΙΟΣ/ΠΑΡΑΔΩΤΕΑ
            "1pIRjzexYG_JVFkoqfaG2_o_YfziGoFy_", // ΡΟΔΟΣ/ΜΑΡΤΙΟΣ
            "1C2E70l0PkCETaMPqywysYNMrDUcKMO5k", // ΠΑΡΑΔΕΙΓΜΑΤΑ
          ];

          let srFolders: any[] = [];
          for (const folderId of searchFolderIds) {
            srFolders = await driveSearch(
              accessToken,
              `name contains '${safeSrId}' and '${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
            );
            if (srFolders.length > 0) break;
          }

          if (srFolders.length > 0) {
            parentFolderId = srFolders[0].id;
            parentFolderUrl = srFolders[0].webViewLink || "";
            console.log(`Resolved SR folder by fallback search: ${srFolders[0].name}`);

            await adminClient
              .from("assignments")
              .update({ drive_folder_url: parentFolderUrl || null })
              .eq("id", assignment_id);
          }
        }

        // 3) Find/create ΕΓΓΡΑΦΑ inside SR folder
        if (!targetFolderId && parentFolderId) {
          const egrafaFolders = await driveSearch(
            accessToken,
            `name = 'ΕΓΓΡΑΦΑ' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
          );

          if (egrafaFolders.length > 0) {
            targetFolderId = egrafaFolders[0].id;

            await adminClient
              .from("assignments")
              .update({ drive_egrafa_url: egrafaFolders[0].webViewLink || null })
              .eq("id", assignment_id);
          } else {
            // If SR folder exists but ΕΓΓΡΑΦΑ does not, create it
            const createdEgrafa = await findOrCreateDriveFolder(accessToken, "ΕΓΓΡΑΦΑ", parentFolderId);
            targetFolderId = createdEgrafa.id;

            await adminClient
              .from("assignments")
              .update({ drive_egrafa_url: createdEgrafa.webViewLink || null })
              .eq("id", assignment_id);
          }
        }

        // 4) Absolute fallback: create SR + ΕΓΓΡΑΦΑ folders by area root
        if (!targetFolderId && sr_id) {
          const areaText = String(area || "").toUpperCase();
          const areaRootId = areaText.includes("ΚΩ")
            ? "1X1mtK4tV_sgGM9IdizNSK7AS19qX1nYl" // ΚΩΣ
            : "1JvcSG3tiOplSujXhb3yj_ELQLjfrgOzO"; // ΡΟΔΟΣ (default)

          const createdSrFolder = await findOrCreateDriveFolder(accessToken, String(sr_id), areaRootId);
          const createdEgrafa = await findOrCreateDriveFolder(accessToken, "ΕΓΓΡΑΦΑ", createdSrFolder.id);

          parentFolderId = createdSrFolder.id;
          parentFolderUrl = createdSrFolder.webViewLink || "";
          targetFolderId = createdEgrafa.id;

          await adminClient
            .from("assignments")
            .update({
              drive_folder_url: parentFolderUrl || null,
              drive_egrafa_url: createdEgrafa.webViewLink || null,
            })
            .eq("id", assignment_id);

          console.log(`Created fallback Drive folders for SR ${sr_id}`);
        }

        if (!targetFolderId) {
          console.warn(`No Drive folder resolved for SR ${sr_id}; skipping Drive upload`);
        }

        if (targetFolderId) {
          const uploaded = await uploadFileToDrive(
            accessToken,
            `Deltio_Autopsias_${sr_id}.pdf`,
            "application/pdf",
            pdfBytes,
            targetFolderId
          );
          driveUrl = uploaded.webViewLink || "";
          console.log(`Uploaded inspection PDF to Drive: ${uploaded.name}`);
        }
      } catch (driveErr) {
        console.error("Drive upload error (non-blocking):", driveErr);
      }
    }

    // Update inspection report with PDF status
    await adminClient
      .from("inspection_reports")
      .update({
        pdf_generated: true,
        pdf_drive_url: driveUrl || null,
      })
      .eq("id", report.id);

    return new Response(
      JSON.stringify({
        success: true,
        pdf_size: pdfBytes.length,
        drive_url: driveUrl || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
