import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

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

// ─── PDF Generation ──────────────────────────────────────────────────

const A4_W = 595.28;
const A4_H = 841.89;

interface InspectionData {
  [key: string]: any;
}

function drawText(
  page: any, text: string, x: number, y: number, font: any,
  size = 9, color = rgb(0.1, 0.14, 0.2)
) {
  page.drawText(text || "", { x, y, size, font, color });
}

function drawLabel(
  page: any, label: string, x: number, y: number, font: any, boldFont: any, value: string
) {
  page.drawText(label, { x, y, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(value || "—", { x: x + 130, y, size: 9, font, color: rgb(0.1, 0.14, 0.2) });
}

function drawCheckbox(
  page: any, checked: boolean, label: string, x: number, y: number, font: any
) {
  const boxSize = 10;
  page.drawRectangle({
    x, y: y - 2, width: boxSize, height: boxSize,
    borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 0.8,
    color: checked ? rgb(0.1, 0.6, 0.54) : rgb(1, 1, 1),
  });
  if (checked) {
    page.drawText("✓", { x: x + 1.5, y: y - 0.5, size: 8, font, color: rgb(1, 1, 1) });
  }
  page.drawText(label, { x: x + boxSize + 4, y, size: 8, font, color: rgb(0.1, 0.14, 0.2) });
}

async function embedSignature(pdfDoc: any, page: any, dataUrl: string, x: number, y: number, maxW = 180, maxH = 60) {
  if (!dataUrl || !dataUrl.startsWith("data:image/png;base64,")) return;
  try {
    const base64 = dataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const img = await pdfDoc.embedPng(bytes);
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    page.drawImage(img, { x, y, width: img.width * scale, height: img.height * scale });
  } catch (e) {
    console.error("Signature embed error:", e);
  }
}

async function generateInspectionPdf(data: InspectionData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const brandColor = rgb(0.1, 0.6, 0.54); // teal
  const headerBg = rgb(0.1, 0.14, 0.2); // dark
  const lightBg = rgb(0.94, 0.96, 0.97);

  // ─── PAGE 1: Customer Info ───
  const p1 = pdfDoc.addPage([A4_W, A4_H]);
  let y = A4_H - 40;

  // Header
  p1.drawRectangle({ x: 0, y: y - 5, width: A4_W, height: 35, color: headerBg });
  p1.drawText("ΕΚΘΕΣΗ ΤΕΧΝΙΚΗΣ ΕΠΙΘΕΩΡΗΣΗΣ ΚΤΙΡΙΟΥ", { x: 40, y: y + 5, size: 14, font: boldFont, color: rgb(1, 1, 1) });
  p1.drawText("(Έντυπο για Διαχειριστή)", { x: 40, y: y - 10, size: 9, font, color: rgb(0.8, 0.8, 0.8) });
  y -= 50;

  // Customer info section
  p1.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
  p1.drawText("ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ", { x: 40, y: y + 2, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  y -= 30;

  const customerFields = [
    ["Ονοματεπώνυμο:", data.customer_name],
    ["Όνομα Πατρός:", data.customer_father_name],
    ["Τηλ. (κινητό):", data.customer_mobile],
    ["Τηλ. (σταθερό):", data.customer_phone],
    ["Email:", data.customer_email],
    ["Οδός:", `${data.customer_street || ""} ${data.customer_number || ""}`],
    ["Τ.Κ.:", data.customer_postal_code],
    ["Όροφος:", data.customer_floor],
    ["Κωδ. Διαμ/τος:", data.customer_apartment_code],
    ["Νομός:", data.customer_county],
    ["Δήμος:", data.customer_municipality],
  ];

  for (const [label, value] of customerFields) {
    if (y % 2 === 0) p1.drawRectangle({ x: 30, y: y - 3, width: A4_W - 60, height: 16, color: lightBg });
    drawLabel(p1, label, 40, y, font, boldFont, value || "");
    y -= 18;
  }

  // Notes
  if (data.customer_notes) {
    y -= 10;
    p1.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
    p1.drawText("ΠΑΡΑΤΗΡΗΣΕΙΣ", { x: 40, y: y + 2, size: 10, font: boldFont, color: rgb(1, 1, 1) });
    y -= 28;
    drawText(p1, data.customer_notes, 40, y, font, 9);
    y -= 20;
  }

  // Manager info
  y -= 10;
  p1.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
  p1.drawText("ΣΤΟΙΧΕΙΑ ΔΙΑΧΕΙΡΙΣΤΗ", { x: 40, y: y + 2, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  y -= 30;

  for (const [label, value] of [
    ["Ονοματεπώνυμο:", data.manager_name],
    ["Τηλ. (κινητό):", data.manager_mobile],
    ["Email:", data.manager_email],
  ]) {
    drawLabel(p1, label, 40, y, font, boldFont, value || "");
    y -= 18;
  }

  // Technical service
  y -= 10;
  p1.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
  p1.drawText("ΑΡΜΟΔΙΑ ΤΕΧΝΙΚΗ ΥΠΗΡΕΣΙΑ", { x: 40, y: y + 2, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  y -= 30;

  for (const [label, value] of [
    ["Διεύθυνση:", data.service_address],
    ["Τηλέφωνο:", data.service_phone],
    ["Email:", data.service_email],
  ]) {
    drawLabel(p1, label, 40, y, font, boldFont, value || "");
    y -= 18;
  }

  y -= 10;
  drawText(p1, `Τεχνικός: ${data.technician_name || "—"}`, 40, y, boldFont, 10);

  // ─── PAGE 2: Technical Description ───
  const p2 = pdfDoc.addPage([A4_W, A4_H]);
  y = A4_H - 40;

  p2.drawRectangle({ x: 0, y: y - 5, width: A4_W, height: 30, color: headerBg });
  p2.drawText("ΕΝΤΥΠΟ ΤΕΧΝΙΚΗΣ ΠΕΡΙΓΡΑΦΗΣ – ΕΠΙΘΕΩΡΗΣΗΣ", { x: 40, y: y + 2, size: 12, font: boldFont, color: rgb(1, 1, 1) });
  y -= 45;

  // Section 1: Routing
  p2.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
  p2.drawText("1. ΟΔΕΥΣΗ ΜΕΧΡΙ ΤΟΝ ΚΕΝΤΡΙΚΟ ΟΠΤΙΚΟ ΚΑΤΑΝΕΜΗΤΗ (Β.Ε.Ρ.)", { x: 40, y: y + 2, size: 9, font: boldFont, color: rgb(1, 1, 1) });
  y -= 35;

  drawCheckbox(p2, data.routing_escalit, "Εσκαλίτ (Εισαγωγή χαλκού)", 40, y, font);
  drawCheckbox(p2, data.routing_external_pipe, "Εξωτ. με σιδηροσωλήνα", 250, y, font);
  y -= 20;
  drawCheckbox(p2, data.routing_aerial, "Εναέριο", 40, y, font);
  if (data.routing_other) drawText(p2, `Άλλο: ${data.routing_other}`, 250, y, font, 8);
  y -= 25;

  drawCheckbox(p2, data.excavation_to_pipe === true, "Εκσκαφή πεζ. έως σωλήνα: ΝΑΙ", 40, y, font);
  drawCheckbox(p2, data.excavation_to_pipe === false, "ΌΧΙ", 280, y, font);
  y -= 20;
  drawCheckbox(p2, data.excavation_to_rg === true, "Εκσκαφή πεζ. έως ΡΓ: ΝΑΙ", 40, y, font);
  drawCheckbox(p2, data.excavation_to_rg === false, "ΌΧΙ", 280, y, font);
  y -= 25;

  drawCheckbox(p2, data.pipe_placement, "Τοποθέτηση Σιδηροσωλήνα", 40, y, font);
  drawCheckbox(p2, data.wall_mount, "Στήριξη επί τοιχοποιίας", 250, y, font);
  y -= 20;
  drawCheckbox(p2, data.fence_building_mount, "Περίφραξης ή/και κτιρίου", 40, y, font);
  drawCheckbox(p2, data.excavation_to_building, "Εκσκαφή έως κτίριο", 250, y, font);
  y -= 35;

  // Section 2: BEP position
  const bepPositionLabels: Record<string, string> = {
    internal: "Εσωτερικά", external: "Εξωτερικά", fence: "Στην περίφραξη",
    building: "Στο κτίριο", pillar: "PILAR", pole: "Επί στύλου",
    basement: "Υπόγειο", rooftop: "Ταράτσα", ground: "Ισόγειο", piloti: "Πυλωτή",
  };

  p2.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
  p2.drawText("2. ΘΕΣΗ Β.Ε.Ρ.", { x: 40, y: y + 2, size: 9, font: boldFont, color: rgb(1, 1, 1) });
  y -= 30;
  drawText(p2, `Θέση: ${bepPositionLabels[data.bep_position] || data.bep_position || "—"}`, 40, y, boldFont, 10);
  y -= 35;

  // Section 3: Vertical routing
  const verticalLabels: Record<string, string> = {
    shaft: "Φρεάτιο", staircase: "Κλιμακοστάσιο", lightwell: "Φωταγωγός",
    elevator: "Ανελκυστήρα", lantern: "Φανάρι σκάλας", other: "Άλλο",
  };

  p2.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
  p2.drawText("3. ΚΑΤΑΚΟΡΥΦΗ ΟΔΕΥΣΗ", { x: 40, y: y + 2, size: 9, font: boldFont, color: rgb(1, 1, 1) });
  y -= 30;
  drawText(p2, `Τρόπος: ${verticalLabels[data.vertical_routing] || data.vertical_routing || "—"}`, 40, y, boldFont, 10);
  y -= 35;

  // Notes & sketches
  if (data.sketch_notes) {
    p2.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
    p2.drawText("ΠΑΡΑΤΗΡΗΣΕΙΣ - ΠΕΡΙΓΡΑΦΗ", { x: 40, y: y + 2, size: 9, font: boldFont, color: rgb(1, 1, 1) });
    y -= 30;
    drawText(p2, data.sketch_notes, 40, y, font, 9);
    y -= 20;
  }

  if (data.optical_socket_position) {
    drawText(p2, `Θέση Οπτικής Πρίζας: ${data.optical_socket_position}`, 40, y, boldFont, 9);
    y -= 30;
  }

  // Signatures
  y -= 10;
  p2.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
  p2.drawText("ΥΠΟΓΡΑΦΕΣ", { x: 40, y: y + 2, size: 9, font: boldFont, color: rgb(1, 1, 1) });
  y -= 35;

  drawText(p2, "Υπογραφή Μηχανικού:", 40, y, boldFont, 8);
  if (data.engineer_signature) await embedSignature(pdfDoc, p2, data.engineer_signature, 40, y - 65);
  y -= 80;

  drawText(p2, "Υπογραφή Πελάτη:", 40, y, boldFont, 8);
  if (data.customer_signature) await embedSignature(pdfDoc, p2, data.customer_signature, 40, y - 65);

  drawText(p2, "Υπογραφή Διαχειριστή:", 310, y, boldFont, 8);
  if (data.manager_signature) await embedSignature(pdfDoc, p2, data.manager_signature, 310, y - 65);

  // ─── PAGE 3: Declaration ───
  const p3 = pdfDoc.addPage([A4_W, A4_H]);
  y = A4_H - 40;

  p3.drawRectangle({ x: 0, y: y - 5, width: A4_W, height: 30, color: headerBg });
  p3.drawText("ΥΠΕΥΘΥΝΗ ΔΗΛΩΣΗ ΔΙΑΧΕΙΡΙΣΤΗ / ΕΚΠΡΟΣΩΠΟΥ", { x: 40, y: y + 2, size: 12, font: boldFont, color: rgb(1, 1, 1) });
  y -= 50;

  const isApprove = data.declaration_type === "approve";
  drawCheckbox(p3, isApprove, "ΕΠΙΛΟΓΗ (Α) – ΕΓΚΡΙΝΩ ΑΜΕΣΗ ΕΝΑΡΞΗ ΕΡΓΑΣΙΩΝ", 40, y, boldFont);
  y -= 20;
  drawCheckbox(p3, !isApprove, "ΕΠΙΛΟΓΗ (Β) – ΔΕΝ ΕΓΚΡΙΝΩ", 40, y, boldFont);
  y -= 35;

  const declFields = [
    ["Ονοματεπώνυμο:", data.declarant_name],
    ["ΑΔΤ:", data.declarant_id_number],
    ["Πόλη:", data.declarant_city],
    ["Οδός:", `${data.declarant_street || ""} ${data.declarant_number || ""}`],
    ["Τ.Κ.:", data.declarant_postal_code],
    ["Ημερομηνία:", data.declaration_date],
    ["Κόστος εργασιών:", data.cost_option === "ote_covers" ? "Επιβαρύνει αποκλειστικά την ΟΤΕ Α.Ε." : "Δεν επιβαρύνει την ΟΤΕ Α.Ε."],
  ];

  for (const [label, value] of declFields) {
    drawLabel(p3, label, 40, y, font, boldFont, value || "");
    y -= 20;
  }

  y -= 20;
  drawText(p3, "Υπογραφή:", 40, y, boldFont, 9);
  if (data.declaration_signature) await embedSignature(pdfDoc, p3, data.declaration_signature, 40, y - 65);

  // ─── PAGE 4: BCP / BEP / BMO ───
  const p4 = pdfDoc.addPage([A4_W, A4_H]);
  y = A4_H - 40;

  p4.drawRectangle({ x: 0, y: y - 5, width: A4_W, height: 30, color: headerBg });
  p4.drawText("ΣΤΟΙΧΕΙΑ ΚΤΙΡΙΟΥ & ΕΞΟΠΛΙΣΜΟΣ", { x: 40, y: y + 2, size: 12, font: boldFont, color: rgb(1, 1, 1) });
  y -= 50;

  const buildingFields = [
    ["Διεύθυνση:", data.building_address],
    ["Building ID:", data.building_id],
    ["Όροφος Πελάτη:", data.customer_floor_select],
    ["SR ID:", data.sr_id],
    ["Καμπίνα:", data.cabinet],
    ["Σωληνίσκος:", data.pipe_code],
    ["Σύν. Διαμερισμάτων:", String(data.total_apartments || 0)],
    ["Σύν. Καταστημάτων:", String(data.total_shops || 0)],
    ["Σύν. Χώρων:", String(data.total_spaces || 0)],
    ["Σύν. Ορόφων:", String(data.total_floors || 0)],
  ];

  for (const [label, value] of buildingFields) {
    drawLabel(p4, label, 40, y, font, boldFont, value || "");
    y -= 18;
  }

  y -= 15;

  // BCP
  p4.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
  p4.drawText("BCP", { x: 40, y: y + 2, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  y -= 30;
  drawLabel(p4, "Κατασκευαστής:", 40, y, font, boldFont, (data.bcp_brand || "—").toUpperCase());
  drawLabel(p4, "Μέγεθος:", 300, y, font, boldFont, (data.bcp_size || "—").toUpperCase());
  y -= 20;
  drawCheckbox(p4, data.bcp_floorbox, "Floorbox", 40, y, font);
  drawCheckbox(p4, data.bcp_drop_6, "Drop 6", 150, y, font);
  drawCheckbox(p4, data.bcp_drop_12, "Drop 12", 250, y, font);
  y -= 35;

  // BEP
  p4.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
  p4.drawText("BEP", { x: 40, y: y + 2, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  y -= 30;
  drawLabel(p4, "Κατασκευαστής:", 40, y, font, boldFont, (data.bep_brand || "—").toUpperCase());
  drawLabel(p4, "Μέγεθος:", 300, y, font, boldFont, (data.bep_size || "—").toUpperCase());
  y -= 20;
  drawLabel(p4, "Χωρητικότητα:", 40, y, font, boldFont, data.bep_capacity || "—");
  y -= 35;

  // BMO
  p4.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
  p4.drawText("BMO", { x: 40, y: y + 2, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  y -= 30;
  drawLabel(p4, "Κατασκευαστής:", 40, y, font, boldFont, (data.bmo_brand || "—").toUpperCase());
  drawLabel(p4, "Μέγεθος:", 300, y, font, boldFont, (data.bmo_size || "—").toUpperCase());
  y -= 20;
  drawLabel(p4, "Χωρητικότητα:", 40, y, font, boldFont, data.bmo_capacity || "—");

  // Footer on all pages
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    page.drawText(`SR: ${data.sr_id} — Σελίδα ${i + 1}/${pages.length}`, {
      x: 40, y: 20, size: 7, font, color: rgb(0.5, 0.5, 0.5),
    });
    page.drawText("Delta Network Inc. — Ηλεκτρονικό Δελτίο Αυτοψίας", {
      x: A4_W - 250, y: 20, size: 7, font, color: rgb(0.5, 0.5, 0.5),
    });
  }

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

    // Generate PDF
    const pdfBytes = await generateInspectionPdf(report);
    console.log(`PDF generated: ${(pdfBytes.length / 1024).toFixed(0)}KB`);

    // Upload to Google Drive
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

        // Try to find ΕΓΓΡΑΦΑ folder from the existing Drive folder
        if (assignment?.drive_egrafa_url) {
          const match = assignment.drive_egrafa_url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
          if (match) targetFolderId = match[1];
        }

        if (!targetFolderId && assignment?.drive_folder_url) {
          const folderMatch = assignment.drive_folder_url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
          if (folderMatch) {
            // Search for ΕΓΓΡΑΦΑ inside the SR folder
            const egrafaFolders = await driveSearch(
              accessToken,
              `name = 'ΕΓΓΡΑΦΑ' and '${folderMatch[1]}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
            );
            if (egrafaFolders.length > 0) {
              targetFolderId = egrafaFolders[0].id;
            } else {
              targetFolderId = folderMatch[1]; // Use parent folder as fallback
            }
          }
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
