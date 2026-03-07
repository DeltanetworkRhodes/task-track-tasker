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

// ─── PDF Generation (OTE Template) ──────────────────────────────────

const A4_W = 595.28;
const A4_H = 841.89;
const M = 40; // margin
const MW = A4_W - 2 * M; // usable width

interface InspectionData {
  [key: string]: any;
}

const BLUE = rgb(0, 0.325, 0.624); // OTE blue
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const LIGHT_BLUE = rgb(0.82, 0.88, 0.95);
const GREY = rgb(0.5, 0.5, 0.5);

function drawText(page: any, text: string, x: number, y: number, font: any, size = 9, color = BLACK) {
  page.drawText(text || "", { x, y, size, font, color });
}

function drawLine(page: any, x1: number, y1: number, x2: number, y2: number, thickness = 0.5) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: BLACK });
}

function drawSectionHeader(page: any, text: string, x: number, y: number, w: number, font: any) {
  page.drawRectangle({ x, y: y - 4, width: w, height: 16, color: BLUE });
  page.drawText(text, { x: x + 5, y: y, size: 9, font, color: WHITE });
  return y - 22;
}

function drawLabelValue(page: any, label: string, value: string, x: number, y: number, boldFont: any, font: any, labelW = 180) {
  page.drawText(label, { x, y, size: 8.5, font: boldFont, color: BLACK });
  page.drawText(value || "", { x: x + labelW, y, size: 9, font, color: BLACK });
  drawLine(page, x + labelW, y - 2, x + MW, y - 2);
}

function drawCheckbox(page: any, checked: boolean, label: string, x: number, y: number, font: any, size = 8) {
  const boxSize = 10;
  page.drawRectangle({
    x, y: y - 2, width: boxSize, height: boxSize,
    borderColor: BLACK, borderWidth: 0.8,
    color: WHITE,
  });
  if (checked) {
    page.drawText("X", { x: x + 2, y: y, size: 7, font, color: BLACK });
  }
  page.drawText(label, { x: x + boxSize + 4, y, size, font, color: BLACK });
}

async function embedSignature(pdfDoc: any, page: any, dataUrl: string, x: number, y: number, maxW = 160, maxH = 50) {
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
  const FONT_URL = "https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/greek-400-normal.woff";
  const FONT_BOLD_URL = "https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/greek-700-normal.woff";

  const [fontBytes, boldFontBytes] = await Promise.all([
    fetch(FONT_URL).then(r => r.arrayBuffer()),
    fetch(FONT_BOLD_URL).then(r => r.arrayBuffer()),
  ]);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });
  const boldFont = await pdfDoc.embedFont(boldFontBytes, { subset: true });

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 1: Στοιχεία Πελάτη (Customer Info)
  // ══════════════════════════════════════════════════════════════════════
  const p1 = pdfDoc.addPage([A4_W, A4_H]);
  let y = A4_H - 50;

  // OTE Header
  drawText(p1, "ΟΤΕ", M, y + 10, boldFont, 22, BLUE);
  drawText(p1, "ΟΜΙΛΟΣ ΕΤΑΙΡΕΙΩΝ", M, y - 8, font, 7, BLUE);

  drawText(p1, "ΕΚΘΕΣΗ ΤΕΧΝΙΚΗΣ ΕΠΙΘΕΩΡΗΣΗΣ ΚΤΙΡΙΟΥ", M + 150, y + 8, boldFont, 14, BLACK);
  drawText(p1, "(Έντυπο για Διαχειριστή)", M + 200, y - 8, font, 10, BLACK);
  y -= 40;

  // Border around the whole form
  p1.drawRectangle({ x: M - 5, y: 30, width: MW + 10, height: y - 25, borderColor: BLACK, borderWidth: 0.5, color: undefined });

  // Στοιχεία section header
  y = drawSectionHeader(p1, "Στοιχεία", M, y, MW, boldFont);

  // Customer fields
  drawText(p1, "ΟΝΟΜΑΤΕΠΩΝΥΜΟ / ΕΠΩΝΥΜΙΑ:", M + 5, y, boldFont, 8.5);
  drawText(p1, data.customer_name || "", M + 190, y, font, 9);
  drawText(p1, "ΟΝΟΜΑ ΠΑΤΡΟΣ:", M + 370, y, boldFont, 8.5);
  drawText(p1, data.customer_father_name || "", M + 460, y, font, 9);
  y -= 18;
  drawLine(p1, M, y + 5, M + MW, y + 5);

  // Blue separator
  p1.drawRectangle({ x: M, y: y - 2, width: MW, height: 12, color: BLUE });
  y -= 16;

  drawText(p1, "ΤΗΛΕΦΩΝΟ (κινητό):", M + 5, y, boldFont, 8.5);
  drawText(p1, data.customer_mobile || "", M + 140, y, font, 9);
  y -= 16;
  drawLine(p1, M, y + 5, M + MW, y + 5);

  drawText(p1, "ΤΗΛΕΦΩΝΟ (σταθερό):", M + 5, y, boldFont, 8.5);
  drawText(p1, data.customer_phone || "", M + 145, y, font, 9);
  y -= 16;
  drawLine(p1, M, y + 5, M + MW, y + 5);

  drawText(p1, "EMAIL:", M + 5, y, boldFont, 8.5);
  drawText(p1, data.customer_email || "", M + 50, y, font, 9);
  y -= 16;
  drawLine(p1, M, y + 5, M + MW, y + 5);

  // Blue separator
  p1.drawRectangle({ x: M, y: y - 2, width: MW, height: 12, color: BLUE });
  y -= 16;

  drawText(p1, "ΟΔΟΣ:", M + 5, y, boldFont, 8.5);
  drawText(p1, data.customer_street || "", M + 50, y, font, 9);
  drawText(p1, "ΑΡΙΘ.:", M + 250, y, boldFont, 8.5);
  drawText(p1, data.customer_number || "", M + 290, y, font, 9);
  drawText(p1, "Τ.Κ.:", M + 350, y, boldFont, 8.5);
  drawText(p1, data.customer_postal_code || "", M + 380, y, font, 9);
  y -= 16;
  drawLine(p1, M, y + 5, M + MW, y + 5);

  drawText(p1, "ΟΡΟΦΟΣ:", M + 5, y, boldFont, 8.5);
  drawText(p1, data.customer_floor || "", M + 60, y, font, 9);
  drawText(p1, "ΚΩΔ. ΔΙΑΜ/ΤΟΣ:", M + 150, y, boldFont, 8.5);
  drawText(p1, data.customer_apartment_code || "", M + 250, y, font, 9);
  drawText(p1, "ΝΟΜΟΣ:", M + 320, y, boldFont, 8.5);
  drawText(p1, data.customer_county || "", M + 370, y, font, 9);
  drawText(p1, "ΔΗΜΟΣ:", M + 430, y, boldFont, 8.5);
  drawText(p1, data.customer_municipality || "", M + 470, y, font, 9);
  y -= 18;
  drawLine(p1, M, y + 5, M + MW, y + 5);

  // Παρατηρήσεις
  y -= 5;
  y = drawSectionHeader(p1, "Παρατηρήσεις", M, y, MW, boldFont);
  if (data.customer_notes) {
    // Wrap long notes
    const noteLines = (data.customer_notes || "").match(/.{1,90}/g) || [data.customer_notes];
    for (const line of noteLines) {
      drawText(p1, line, M + 5, y, font, 8);
      y -= 12;
    }
  }
  // Dotted lines for notes area
  for (let i = 0; i < 5; i++) {
    drawLine(p1, M + 5, y, M + MW - 5, y, 0.3);
    y -= 14;
  }

  // Στοιχεία διαχειριστή
  y -= 5;
  y = drawSectionHeader(p1, "Στοιχεία διαχειριστή", M, y, MW, boldFont);

  drawText(p1, "ΟΝΟΜΑΤΕΠΩΝΥΜΟ:", M + 5, y, boldFont, 8.5);
  drawText(p1, data.manager_name || "", M + 120, y, font, 9);
  y -= 16;
  drawLine(p1, M, y + 5, M + MW, y + 5);

  drawText(p1, "ΤΗΛΕΦΩΝΟ ΕΠΙΚΟΙΝΩΝΙΑΣ (κινητό):", M + 5, y, boldFont, 8.5);
  drawText(p1, data.manager_mobile || "", M + 210, y, font, 9);
  y -= 16;
  drawLine(p1, M, y + 5, M + MW, y + 5);

  drawText(p1, "EMAIL:", M + 5, y, boldFont, 8.5);
  drawText(p1, data.manager_email || "", M + 50, y, font, 9);
  y -= 18;
  drawLine(p1, M, y + 5, M + MW, y + 5);

  drawText(p1, "Ειδικό πεδίο που συμπληρώνεται διότι απαιτείται επικοινωνία με τον Διαχειριστή του κτιρίου.", M + 5, y, font, 7, GREY);
  y -= 18;

  // Αρμόδια Τεχνική Υπηρεσία
  drawText(p1, "ΑΡΜΟΔΙΑ ΤΕΧΝΙΚΗ ΥΠΗΡΕΣΙΑ:", M + 5, y, boldFont, 9);
  y -= 16;

  drawText(p1, "ΔΙΕΥΘΥΝΣΗ ΑΛΛΗΛΟΓΡΑΦΙΑΣ:", M + 5, y, boldFont, 8.5);
  drawText(p1, data.service_address || "", M + 180, y, font, 9);
  y -= 16;
  drawLine(p1, M, y + 5, M + MW, y + 5);

  drawText(p1, "ΤΗΛΕΦΩΝΟ ΕΠΙΚΟΙΝΩΝΙΑΣ (σταθερό):", M + 5, y, boldFont, 8.5);
  drawText(p1, data.service_phone || "", M + 220, y, font, 9);
  y -= 16;
  drawLine(p1, M, y + 5, M + MW, y + 5);

  drawText(p1, "EMAIL:", M + 5, y, boldFont, 8.5);
  drawText(p1, data.service_email || "", M + 50, y, font, 9);
  y -= 18;
  drawLine(p1, M, y + 5, M + MW, y + 5);

  drawText(p1, "ΟΝΟΜΑΤΕΠΩΝΥΜΟ ΤΕΧΝΙΚΟΥ ΠΟΥ ΕΠΙΤΕΛΕΣΕ ΤΗΝ ΑΥΤΟΨΙΑ:", M + 5, y, boldFont, 9);
  drawText(p1, data.technician_name || "", M + 340, y, font, 9);
  y -= 16;
  drawLine(p1, M, y + 5, M + MW, y + 5);

  drawText(p1, "Ώρες επικοινωνίας: Δευτέρα έως Παρασκευή 08:00-15:00", M + 5, y, font, 7, GREY);

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 2: Τεχνική Περιγραφή – Επιθεώρηση
  // ══════════════════════════════════════════════════════════════════════
  const p2 = pdfDoc.addPage([A4_W, A4_H]);
  y = A4_H - 40;

  // OTE logo header
  drawText(p2, "ΟΤΕ", M, y, boldFont, 16, BLUE);

  drawText(p2, "ΕΝΤΥΠΟ ΤΕΧΝΙΚΗΣ ΠΕΡΙΓΡΑΦΗΣ – ΕΠΙΘΕΩΡΗΣΗΣ", M + 100, y, boldFont, 13, BLACK);
  y -= 30;

  // Section 1
  drawText(p2, "1. ΟΔΕΥΣΗ ΜΕΧΡΙ ΤΟΝ ΚΕΝΤΡΙΚΟ ΟΠΤΙΚΟ ΚΑΤΑΝΕΜΗΤΗ ΚΤΙΡΙΟΥ (Β.Ε.Ρ.)", M + 30, y, boldFont, 9);
  y -= 22;

  // Left column
  drawText(p2, "ΜΕ ΧΡΗΣΗ ΕΣΚΑΛΙΤ", M, y, font, 8);
  drawCheckbox(p2, data.routing_escalit, "", M + 120, y, font);
  drawText(p2, "ΕΞΩΤΕΡΙΚΗ ΟΔΕΥΣΗ ΜΕ", M + 180, y, font, 8);
  drawText(p2, "ΕΝΑΕΡΙΟ", M + 385, y, font, 8);
  drawCheckbox(p2, data.routing_aerial, "", M + 425, y, font);
  drawText(p2, "ΑΛΛΟΣ ΤΡΟΠΟΣ", M + 455, y, font, 8);
  drawCheckbox(p2, !!data.routing_other, "", M + MW - 10, y, font);
  y -= 14;
  drawText(p2, "(Εισαγωγή χαλκού)", M, y, font, 7);
  drawText(p2, "ΧΡΗΣΗ ΣΙΔΗΡΟΣΩΛΗΝΑ", M + 180, y, font, 8);
  drawCheckbox(p2, data.routing_external_pipe, "", M + 310, y, font);
  y -= 18;

  drawText(p2, "Εκσκαφή", M, y, font, 8);
  drawText(p2, "Εκσκαφή πεζοδρομίου", M + 180, y, font, 8);
  y -= 12;
  drawText(p2, "πεζοδρομίου", M, y, font, 8);
  y -= 12;
  drawText(p2, "έως σωλήνα εισαγωγής", M, y, font, 8);
  drawCheckbox(p2, data.excavation_to_pipe === true, "", M + 130, y, font);
  drawText(p2, "ΝΑΙ", M + 145, y, font, 8);
  drawCheckbox(p2, data.excavation_to_pipe === false, "", M + 170, y, font);
  drawText(p2, "ΌΧΙ", M + 185, y, font, 8);

  drawText(p2, "έως ΡΓ", M + 280, y, font, 8);
  drawCheckbox(p2, data.excavation_to_rg === true, "", M + 330, y, font);
  drawText(p2, "ΝΑΙ", M + 345, y, font, 8);
  drawCheckbox(p2, data.excavation_to_rg === false, "", M + 375, y, font);
  drawText(p2, "ΌΧΙ", M + 390, y, font, 8);
  y -= 20;

  // Dotted lines
  for (let i = 0; i < 3; i++) {
    drawLine(p2, M, y, M + MW, y, 0.3);
    y -= 12;
  }

  drawText(p2, "Τοποθέτηση", M + 180, y, font, 8);
  y -= 12;
  drawText(p2, "Σιδηροσωλήνα", M + 180, y, font, 8);
  drawCheckbox(p2, data.pipe_placement, "", M + 270, y, font);
  drawText(p2, "Στήριξη επί", M + 300, y, font, 8);
  y -= 12;
  drawText(p2, "τοιχοποιίας", M + 300, y, font, 8);
  drawCheckbox(p2, data.wall_mount, "", M + 370, y, font);
  y -= 12;
  drawText(p2, "περίφραξης ή/και κτιρίου", M + 300, y, font, 8);
  drawCheckbox(p2, data.fence_building_mount, "", M + 440, y, font);
  y -= 14;
  drawText(p2, "Εκσκαφή έως το κτίριο και", M + 180, y, font, 8);
  y -= 12;
  drawText(p2, "στήριξη επί του κτιρίου", M + 180, y, font, 8);
  drawCheckbox(p2, data.excavation_to_building, "", M + 320, y, font);
  y -= 25;

  // Section 2: ΘΕΣΗ Β.Ε.Ρ
  drawText(p2, "2. ΘΕΣΗ Β.Ε.Ρ", M + 180, y, boldFont, 10);
  y -= 20;

  const bepOptions = [
    { key: "internal", label: "ΕΣΩΤΕΡΙΚΑ" },
    { key: "external", label: "ΕΞΩΤΕΡΙΚΑ" },
    { key: "fence", label: "ΣΤΗΝ ΠΕΡΙΦΡΑΞΗ" },
    { key: "building", label: "ΣΤΟ ΚΤΙΡΙΟ" },
    { key: "pole", label: "ΕΠΙ ΣΤΥΛΟΥ" },
    { key: "pillar", label: "PILAR" },
    { key: "basement", label: "ΥΠΟΓΕΙΟ" },
    { key: "ground", label: "ΙΣΟΓΕΙΟ" },
    { key: "rooftop", label: "ΤΑΡΑΤΣΑ" },
    { key: "piloti", label: "ΠΥΛΩΤΗ" },
  ];

  // Row 1
  for (let i = 0; i < 5; i++) {
    const opt = bepOptions[i];
    const xPos = M + i * 103;
    drawText(p2, opt.label, xPos, y, font, 8);
    drawCheckbox(p2, data.bep_position === opt.key, "", xPos + 80, y, font);
  }
  y -= 16;
  // Row 2
  for (let i = 5; i < 10; i++) {
    const opt = bepOptions[i];
    const xPos = M + (i - 5) * 103;
    drawText(p2, opt.label, xPos, y, font, 8);
    drawCheckbox(p2, data.bep_position === opt.key, "", xPos + 80, y, font);
  }
  y -= 25;

  // Section 3: Κατακόρυφη οδεύση
  drawText(p2, "3. ΚΑΤΑΚΟΡΥΦΗ ΟΔΕΥΣΗ ΠΡΟΣ ΤΑ ΚΟΥΤΙΑ ΔΙΑΝΟΜΗΣ ΟΡΟΦΩΝ (F.B.)", M + 30, y, boldFont, 9);
  y -= 18;

  const vertOptions = [
    { key: "shaft", label: "ΦΡΕΑΤΙΟ" },
    { key: "staircase", label: "ΚΛΙΜΑΚΟΣΤΑΣΙΟ" },
    { key: "lightwell", label: "ΦΩΤΑΓΩΓΟΣ" },
    { key: "other", label: "ΑΛΛΟΣ ΤΡΟΠΟΣ" },
    { key: "elevator", label: "ΑΝΕΛΚΥΣΤΗΡΑ" },
    { key: "internal_external", label: "ΕΣΩΤ./ΕΞΩΤ." },
    { key: "lantern", label: "ΦΑΝΑΡΙ ΣΚΑΛΑΣ" },
  ];

  // Row 1
  for (let i = 0; i < 4; i++) {
    const opt = vertOptions[i];
    const xPos = M + i * 130;
    drawText(p2, opt.label, xPos, y, font, 8);
    drawCheckbox(p2, data.vertical_routing === opt.key, "", xPos + 90, y, font);
  }
  y -= 16;
  // Row 2
  for (let i = 4; i < 7; i++) {
    const opt = vertOptions[i];
    const xPos = M + (i - 4) * 130;
    drawText(p2, opt.label, xPos, y, font, 8);
    drawCheckbox(p2, data.vertical_routing === opt.key, "", xPos + 90, y, font);
  }
  y -= 25;

  // ΣΚΑΡΙΦΗΜΑΤΑ
  drawText(p2, "ΣΚΑΡΙΦΗΜΑΤΑ", M, y, boldFont, 10);
  y -= 15;

  // Draw sketch grid area
  const sketchH = 150;
  p2.drawRectangle({ x: M, y: y - sketchH, width: 200, height: sketchH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  // Grid lines inside sketch
  for (let gx = 1; gx < 10; gx++) {
    const lx = M + gx * 20;
    p2.drawLine({ start: { x: lx, y: y }, end: { x: lx, y: y - sketchH }, thickness: 0.2, color: rgb(0.8, 0.8, 0.8) });
  }
  for (let gy = 1; gy < 8; gy++) {
    const ly = y - gy * (sketchH / 8);
    p2.drawLine({ start: { x: M, y: ly }, end: { x: M + 200, y: ly }, thickness: 0.2, color: rgb(0.8, 0.8, 0.8) });
  }
  // Labels inside sketch
  drawText(p2, "Ο.Γ.", M + 5, y - 30, font, 7, GREY);
  drawText(p2, "Ρ.Γ", M + 5, y - sketchH + 30, font, 7, GREY);
  drawText(p2, "Κράσπεδο", M + 5, y - sketchH + 10, font, 7, GREY);

  // Signature area on the right
  drawText(p2, "Υπογραφή Μηχανικού", M + 320, y - 10, font, 8);
  drawLine(p2, M + 320, y - 20, M + MW, y - 20, 0.3);
  if (data.engineer_signature) await embedSignature(pdfDoc, p2, data.engineer_signature, M + 320, y - 70);

  y -= sketchH + 15;

  // ΠΑΡΑΤΗΡΗΣΕΙΣ - ΠΕΡΙΓΡΑΦΗ
  drawText(p2, "ΠΑΡΑΤΗΡΗΣΕΙΣ - ΠΕΡΙΓΡΑΦΗ", M, y, boldFont, 10);
  y -= 14;
  if (data.sketch_notes) {
    const noteLines = (data.sketch_notes || "").match(/.{1,100}/g) || [data.sketch_notes];
    for (const line of noteLines) {
      drawText(p2, line, M + 5, y, font, 8);
      y -= 12;
    }
  }
  for (let i = 0; i < 4; i++) {
    drawLine(p2, M, y, M + MW, y, 0.3);
    y -= 14;
  }

  drawText(p2, "Θέση Οπτικής Πρίζας", M, y, boldFont, 8);
  drawText(p2, data.optical_socket_position || "", M + 120, y, font, 8);
  drawLine(p2, M + 120, y - 2, M + 270, y - 2, 0.3);

  drawText(p2, "Υπογραφή Μηχανικού", M + 320, y, font, 8);
  drawLine(p2, M + 420, y - 2, M + MW, y - 2, 0.3);
  y -= 25;

  // Materials info
  drawText(p2, "ΥΛΙΚΑ ΠΟΥ ΧΡΗΣΙΜΟΠΟΙΟΥΝΤΑΙ ΣΕ ΤΥΠΙΚΗ ΚΑΤΑΣΚΕΥΗ:", M, y, boldFont, 7);
  y -= 10;
  drawText(p2, "- Γαλβανισμένος Σιδηροσωλήνας Φ20.", M, y, font, 7, GREY);
  y -= 10;
  drawText(p2, "- Σύστημα Πλαστικών Σωλήνων Βαρέως Τύπου Condur – Conflex Φ16 έως Φ25.", M, y, font, 7, GREY);
  y -= 10;
  drawText(p2, "- Από το F.B. έως την οπτική πρίζα του πελάτη: Πλαστικό Κανάλι Διανομής.", M, y, font, 7, GREY);
  y -= 10;
  drawText(p2, "*B.E.P.: Building Entry Point – F.B.: Floor Box", M + 100, y, font, 7, GREY);

  // Customer & Manager signatures
  drawText(p2, "Όνομα & Υπογραφή Πελάτη", M + 300, y + 20, font, 8);
  drawLine(p2, M + 300, y + 8, M + MW, y + 8, 0.3);
  if (data.customer_signature) await embedSignature(pdfDoc, p2, data.customer_signature, M + 300, y + 12, 150, 40);

  drawText(p2, "Όνομα & Υπογραφή Διαχειριστή", M + 300, y, font, 8);
  drawLine(p2, M + 300, y - 10, M + MW, y - 10, 0.3);
  if (data.manager_signature) await embedSignature(pdfDoc, p2, data.manager_signature, M + 300, y - 8, 150, 40);

  y -= 25;
  // Disclaimer
  drawText(p2, "Ηυποδομή που απαιτείται προκειμένου να διασυνδεθεί η πολυκατοικία με το δίκτυο οπτικών ινών θα βαρύνει αποκλειστικά τον", M, y, font, 6.5, BLACK);
  y -= 9;
  drawText(p2, "αιτούντα την υπηρεσία FTTH, ο οποίος έχει ενημερωθεί για τη χρέωση βάσει του συμβολαίου του με τον τηλεπικοινωνιακό πάροχο.", M, y, font, 6.5, BLACK);

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 3: Υπεύθυνη Δήλωση
  // ══════════════════════════════════════════════════════════════════════
  const p3 = pdfDoc.addPage([A4_W, A4_H]);
  y = A4_H - 50;

  // OTE Header
  drawText(p3, "ΟΤΕ", M, y + 10, boldFont, 20, BLUE);
  drawText(p3, "ΟΜΙΛΟΣ ΕΤΑΙΡΕΙΩΝ", M, y - 6, font, 7, BLUE);

  drawText(p3, "ΥΠΕΥΘΥΝΗ ΔΗΛΩΣΗ", M + 180, y + 15, boldFont, 14, BLACK);
  drawText(p3, "ΔΙΑΧΕΙΡΙΣΤΗ/ ΕΚΠΡΟΣΩΠΟΥ ΓΕΝΙΚΗΣ ΣΥΝΕΛΕΥΣΗΣ", M + 120, y, boldFont, 11, BLACK);
  drawText(p3, "ΠΡΩΤΟΤΥΠΟ", M + 230, y - 16, boldFont, 11, rgb(1, 0, 0));
  drawText(p3, "(ΥΠΟΓΡΑΦΕΤΑΙ ΥΠΟΧΡΕΩΤΙΚΑ ΜΟΝΟ ΜΙΑ από τις ΔΥΟ ΕΠΙΛΟΓΕΣ)", M + 120, y - 30, font, 9, BLACK);
  y -= 60;

  // Border
  p3.drawRectangle({ x: M - 5, y: 30, width: MW + 10, height: y - 25, borderColor: BLUE, borderWidth: 1, color: undefined });

  y -= 10;
  const isApprove = data.declaration_type === "approve";

  drawText(p3, "ΕΠΙΛΟΓΗ (Α) – ΕΓΚΡΙΝΩ ΑΜΕΣΗ ΕΝΑΡΞΗ ΕΡΓΑΣΙΩΝ", M + 5, y, boldFont, 10);
  y -= 25;

  // Declaration text
  drawText(p3, `Ο/Η κάτωθι υπογεγραμμένος/η ${data.declarant_name || "............................"},`, M + 5, y, font, 9);
  drawText(p3, `με ΑΔΤ ${data.declarant_id_number || "..........."},`, M + 350, y, font, 9);
  y -= 16;
  drawText(p3, `κάτοικος ${data.declarant_city || "...................."},`, M + 5, y, font, 9);
  drawText(p3, `Οδός ${data.declarant_street || "........................"}`, M + 200, y, font, 9);
  drawText(p3, `Αρ. ${data.declarant_number || "......."},`, M + 370, y, font, 9);
  drawText(p3, `Τ.Κ. ${data.declarant_postal_code || "........"}`, M + 430, y, font, 9);
  y -= 20;

  drawText(p3, "υπό την ιδιότητα μου ως Διαχειριστή, Εκπροσώπου Γενικής Συνέλευσης του κτιρίου", M + 5, y, font, 8.5);
  y -= 12;
  drawText(p3, 'που αναφέρεται στη Σελίδα 1 της παρούσας («ΣΤΟΙΧΕΙΑ ΚΤΙΡΙΟΥ») δηλώνω ότι έλαβα γνώση:', M + 5, y, font, 8.5);
  y -= 20;

  drawText(p3, "1) της ανωτέρω Έκθεσης και των απαιτούμενων εργασιών από την ΟΤΕ Α.Ε. στους κοινόκτητους/κοινόχρηστους", M + 5, y, font, 8);
  y -= 11;
  drawText(p3, "χώρους του κτιρίου, για την κατασκευή Οπτικού Κατανεμητή ή/και Οπτικής Ίνας για την παροχή υπηρεσίας FTTH.", M + 5, y, font, 8);
  y -= 15;

  drawText(p3, "2) ότι το κόστος των εργασιών και των υλικών κατασκευής για την παροχή της υπηρεσίας FTTH στους", M + 5, y, font, 8);
  y -= 11;
  drawText(p3, "κοινόκτητους/κοινόχρηστους χώρους του οικοπέδου (παρακαλώ να σηματοδοτηθεί μία από τις παρακάτω):", M + 5, y, font, 8);
  y -= 18;

  drawCheckbox(p3, data.cost_option === "ote_covers", "i) επιβαρύνουν αποκλειστικά την ΟΤΕ Α.Ε.", M + 10, y, font, 8);
  y -= 14;
  drawCheckbox(p3, data.cost_option !== "ote_covers", "ii) δεν επιβαρύνουν την ΟΤΕ Α.Ε.", M + 10, y, font, 8);
  y -= 20;

  drawText(p3, "και εγκρίνω την άμεση έναρξη των ανωτέρω εργασιών.", M + 5, y, boldFont, 9);
  y -= 30;

  drawText(p3, `Τόπος & Ημερομηνία: ${data.declaration_date || "....../....../..........."}`, M + 5, y, font, 9);
  y -= 25;

  drawText(p3, "Ονοματεπώνυμο & Υπογραφή:", M + 5, y, font, 9);
  if (data.declaration_signature) await embedSignature(pdfDoc, p3, data.declaration_signature, M + 180, y - 55);

  y -= 80;
  // Dashed separator line
  drawLine(p3, M, y, M + MW, y, 0.5);

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 4: Στοιχεία Κτιρίου & Εξοπλισμός (BCP/BEP/BMO)
  // ══════════════════════════════════════════════════════════════════════
  const p4 = pdfDoc.addPage([A4_W, A4_H]);
  y = A4_H - 40;

  // Building info box
  p4.drawRectangle({ x: M, y: y - 180, width: MW, height: 185, borderColor: BLACK, borderWidth: 0.5, color: undefined });

  drawText(p4, "ΔΙΕΥΘΥΝΣΗ:", M + 5, y, boldFont, 9);
  drawText(p4, data.building_address || "", M + 80, y, font, 9);
  y -= 16;

  drawText(p4, "ΟΡΟΦΟΣ ΠΕΛΑΤΗ:", M + 5, y, boldFont, 8.5);
  drawText(p4, data.customer_floor_select || "", M + 110, y, font, 9);
  drawText(p4, "Building Id:", M + 280, y, boldFont, 8.5);
  drawText(p4, data.building_id || "", M + 360, y, font, 9);
  y -= 20;

  // Floor grid - 2 columns x 5 rows
  const floors = [
    ["ΥΠΟΓΕΙΟ", "ΗΜΙΥΠΟΓΕΙΟ"],
    ["ΙΣΟΓΕΙΟ", "ΗΜΙΟΡΟΦΟΣ"],
    ["1ΟΣ ΟΡΟΦΟΣ", "2ΟΣ ΟΡΟΦΟΣ"],
    ["3ΟΣ ΟΡΟΦΟΣ", "4ΟΣ ΟΡΟΦΟΣ"],
    ["5ΟΣ ΟΡΟΦΟΣ", "6ΟΣ ΟΡΟΦΟΣ"],
    ["7ΟΣ ΟΡΟΦΟΣ", "8ΟΣ ΟΡΟΦΟΣ"],
  ];

  for (const [left, right] of floors) {
    drawText(p4, left, M + 5, y, font, 8);
    p4.drawRectangle({ x: M + 5, y: y - 20, width: 220, height: 18, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    drawText(p4, right, M + 270, y, font, 8);
    p4.drawRectangle({ x: M + 270, y: y - 20, width: 220, height: 18, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    y -= 22;
  }

  y -= 15;

  // Totals
  drawText(p4, "ΣΥΝΟΛΟ ΔΙΑΜΕΡΙΣΜΑΤΩΝ:", M + 5, y, boldFont, 8.5);
  drawText(p4, String(data.total_apartments || ""), M + 155, y, font, 9);
  drawText(p4, "SR ID:", M + 280, y, boldFont, 8.5);
  drawText(p4, data.sr_id || "", M + 320, y, font, 9);
  drawLine(p4, M + 320, y - 2, M + MW, y - 2, 0.3);
  y -= 16;

  drawText(p4, "ΣΥΝΟΛΟ ΚΑΤΑΣΤΗΜΑΤΩΝ:", M + 5, y, boldFont, 8.5);
  drawText(p4, String(data.total_shops || ""), M + 155, y, font, 9);
  drawText(p4, "ΚΑΜΠΙΝΑ:", M + 280, y, boldFont, 8.5);
  drawText(p4, data.cabinet || "", M + 340, y, font, 9);
  drawLine(p4, M + 340, y - 2, M + MW, y - 2, 0.3);
  y -= 16;

  drawText(p4, "ΣΥΝΟΛΟ ΧΩΡΩΝ:", M + 5, y, boldFont, 8.5);
  drawText(p4, String(data.total_spaces || ""), M + 155, y, font, 9);
  drawText(p4, "ΣΩΛΗΝΙΣΚΟΣ:", M + 280, y, boldFont, 8.5);
  drawText(p4, data.pipe_code || "", M + 360, y, font, 9);
  drawLine(p4, M + 360, y - 2, M + MW, y - 2, 0.3);
  y -= 16;

  drawText(p4, "ΣΥΝΟΛΟ ΟΡΟΦΩΝ/ΕΠΙΠΕΔΩΝ:", M + 5, y, boldFont, 8.5);
  drawText(p4, String(data.total_floors || ""), M + 170, y, font, 9);
  y -= 30;

  // ── BCP Table ──
  const tableX = M;
  const colW = [80, 70, 60];
  const tableW2 = colW[0] + colW[1] + colW[2];
  const rowH = 18;

  // BCP header
  p4.drawRectangle({ x: tableX, y: y, width: colW[0], height: rowH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  drawText(p4, "BCP", tableX + 15, y + 5, boldFont, 9);
  p4.drawRectangle({ x: tableX + colW[0], y: y, width: colW[1], height: rowH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  drawText(p4, "RAYCAP", tableX + colW[0] + 10, y + 5, boldFont, 8);
  p4.drawRectangle({ x: tableX + colW[0] + colW[1], y: y, width: colW[2], height: rowH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  drawText(p4, "ZTT", tableX + colW[0] + colW[1] + 15, y + 5, boldFont, 8);
  y -= rowH;

  for (const size of ["SMALL", "MEDIUM"]) {
    p4.drawRectangle({ x: tableX, y: y, width: colW[0], height: rowH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    drawText(p4, size, tableX + 10, y + 5, font, 8);
    p4.drawRectangle({ x: tableX + colW[0], y: y, width: colW[1], height: rowH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    if (data.bcp_brand?.toUpperCase() === "RAYCAP" && data.bcp_size?.toUpperCase() === size) drawText(p4, "X", tableX + colW[0] + 25, y + 5, boldFont, 9);
    p4.drawRectangle({ x: tableX + colW[0] + colW[1], y: y, width: colW[2], height: rowH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    if (data.bcp_brand?.toUpperCase() === "ZTT" && data.bcp_size?.toUpperCase() === size) drawText(p4, "X", tableX + colW[0] + colW[1] + 20, y + 5, boldFont, 9);
    y -= rowH;
  }

  // Floorbox / Drop table on the right
  const fTableX = M + 280;
  const fColW = [70, 50, 50, 50];
  const fY = y + 3 * rowH; // align with BCP table top
  let fy = fY;

  p4.drawRectangle({ x: fTableX, y: fy, width: fColW[0], height: rowH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  drawText(p4, "FLOORBOX", fTableX + 5, fy + 5, boldFont, 7);
  p4.drawRectangle({ x: fTableX + fColW[0], y: fy, width: fColW[1], height: rowH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  drawText(p4, "4 Drop", fTableX + fColW[0] + 5, fy + 5, boldFont, 7);
  p4.drawRectangle({ x: fTableX + fColW[0] + fColW[1], y: fy, width: fColW[2], height: rowH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  drawText(p4, "6 Drop", fTableX + fColW[0] + fColW[1] + 5, fy + 5, boldFont, 7);
  p4.drawRectangle({ x: fTableX + fColW[0] + fColW[1] + fColW[2], y: fy, width: fColW[3], height: rowH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  drawText(p4, "12 Drop", fTableX + fColW[0] + fColW[1] + fColW[2] + 5, fy + 5, boldFont, 7);
  fy -= rowH;

  // Capacity row
  p4.drawRectangle({ x: fTableX, y: fy, width: fColW[0], height: rowH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
  if (data.bcp_floorbox) drawText(p4, "X", fTableX + 25, fy + 5, boldFont, 9);
  p4.drawRectangle({ x: fTableX + fColW[0], y: fy, width: fColW[1], height: rowH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
  if (data.bcp_drop_4) drawText(p4, "X", fTableX + fColW[0] + 15, fy + 5, boldFont, 9);
  p4.drawRectangle({ x: fTableX + fColW[0] + fColW[1], y: fy, width: fColW[2], height: rowH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
  if (data.bcp_drop_6) drawText(p4, "X", fTableX + fColW[0] + fColW[1] + 15, fy + 5, boldFont, 9);
  p4.drawRectangle({ x: fTableX + fColW[0] + fColW[1] + fColW[2], y: fy, width: fColW[3], height: rowH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
  if (data.bcp_drop_12) drawText(p4, "X", fTableX + fColW[0] + fColW[1] + fColW[2] + 15, fy + 5, boldFont, 9);

  y -= 15;

  // ── BEP Table ──
  const bepColW = [80, 70, 60, 80];
  const bepTableW = bepColW[0] + bepColW[1] + bepColW[2] + bepColW[3];

  p4.drawRectangle({ x: tableX, y: y, width: bepColW[0], height: rowH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  drawText(p4, "BEP", tableX + 15, y + 5, boldFont, 9);
  p4.drawRectangle({ x: tableX + bepColW[0], y: y, width: bepColW[1], height: rowH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  drawText(p4, "RAYCAP", tableX + bepColW[0] + 10, y + 5, boldFont, 8);
  p4.drawRectangle({ x: tableX + bepColW[0] + bepColW[1], y: y, width: bepColW[2], height: rowH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  drawText(p4, "ZTT", tableX + bepColW[0] + bepColW[1] + 15, y + 5, boldFont, 8);
  p4.drawRectangle({ x: tableX + bepColW[0] + bepColW[1] + bepColW[2], y: y, width: bepColW[3], height: rowH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  drawText(p4, "ΠΟΣΟΤΗΤΑ", tableX + bepColW[0] + bepColW[1] + bepColW[2] + 5, y + 5, boldFont, 7);
  y -= rowH;

  for (const size of ["SMALL", "MEDIUM", "LARGE", "XLARGE"]) {
    p4.drawRectangle({ x: tableX, y: y, width: bepColW[0], height: rowH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    drawText(p4, size, tableX + 10, y + 5, font, 8);
    p4.drawRectangle({ x: tableX + bepColW[0], y: y, width: bepColW[1], height: rowH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    if (data.bep_brand?.toUpperCase() === "RAYCAP" && data.bep_size?.toUpperCase() === size) drawText(p4, "X", tableX + bepColW[0] + 25, y + 5, boldFont, 9);
    p4.drawRectangle({ x: tableX + bepColW[0] + bepColW[1], y: y, width: bepColW[2], height: rowH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    if (data.bep_brand?.toUpperCase() === "ZTT" && data.bep_size?.toUpperCase() === size) drawText(p4, "X", tableX + bepColW[0] + bepColW[1] + 20, y + 5, boldFont, 9);
    p4.drawRectangle({ x: tableX + bepColW[0] + bepColW[1] + bepColW[2], y: y, width: bepColW[3], height: rowH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    if (data.bep_size?.toUpperCase() === size) drawText(p4, data.bep_capacity || "", tableX + bepColW[0] + bepColW[1] + bepColW[2] + 15, y + 5, font, 8);
    y -= rowH;
  }

  y -= 15;

  // ── BMO Table ──
  p4.drawRectangle({ x: tableX, y: y, width: bepColW[0], height: rowH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  drawText(p4, "BMO", tableX + 15, y + 5, boldFont, 9);
  p4.drawRectangle({ x: tableX + bepColW[0], y: y, width: bepColW[1], height: rowH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  drawText(p4, "RAYCAP", tableX + bepColW[0] + 10, y + 5, boldFont, 8);
  p4.drawRectangle({ x: tableX + bepColW[0] + bepColW[1], y: y, width: bepColW[2], height: rowH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  drawText(p4, "ZTT", tableX + bepColW[0] + bepColW[1] + 15, y + 5, boldFont, 8);
  p4.drawRectangle({ x: tableX + bepColW[0] + bepColW[1] + bepColW[2], y: y, width: bepColW[3], height: rowH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  drawText(p4, "ΠΟΣΟΤΗΤΑ", tableX + bepColW[0] + bepColW[1] + bepColW[2] + 5, y + 5, boldFont, 7);
  y -= rowH;

  for (const size of ["SMALL", "MEDIUM", "LARGE"]) {
    p4.drawRectangle({ x: tableX, y: y, width: bepColW[0], height: rowH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    drawText(p4, size, tableX + 10, y + 5, font, 8);
    p4.drawRectangle({ x: tableX + bepColW[0], y: y, width: bepColW[1], height: rowH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    if (data.bmo_brand?.toUpperCase() === "RAYCAP" && data.bmo_size?.toUpperCase() === size) drawText(p4, "X", tableX + bepColW[0] + 25, y + 5, boldFont, 9);
    p4.drawRectangle({ x: tableX + bepColW[0] + bepColW[1], y: y, width: bepColW[2], height: rowH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    if (data.bmo_brand?.toUpperCase() === "ZTT" && data.bmo_size?.toUpperCase() === size) drawText(p4, "X", tableX + bepColW[0] + bepColW[1] + 20, y + 5, boldFont, 9);
    p4.drawRectangle({ x: tableX + bepColW[0] + bepColW[1] + bepColW[2], y: y, width: bepColW[3], height: rowH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    if (data.bmo_size?.toUpperCase() === size) drawText(p4, data.bmo_capacity || "", tableX + bepColW[0] + bepColW[1] + bepColW[2] + 15, y + 5, font, 8);
    y -= rowH;
  }

  // Footer on all pages
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    page.drawText(`SR: ${data.sr_id || ""} — Σελίδα ${i + 1}/${pages.length}`, {
      x: 40, y: 15, size: 7, font, color: GREY,
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
