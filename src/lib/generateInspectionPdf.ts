import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const A4_W = 595.28;
const A4_H = 841.89;
const M = 40;
const MW = A4_W - 2 * M;

const BLUE = rgb(0, 0.325, 0.624);
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GREY = rgb(0.5, 0.5, 0.5);

function drawText(page: any, text: string, x: number, y: number, font: any, size = 9, color = BLACK) {
  page.drawText(text || "", { x, y, size, font, color });
}

function drawLine(page: any, x1: number, y1: number, x2: number, y2: number, thickness = 0.5) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: BLACK });
}

function drawSectionHeader(page: any, text: string, x: number, y: number, w: number, font: any) {
  page.drawRectangle({ x, y: y - 4, width: w, height: 16, color: BLUE });
  page.drawText(text, { x: x + 5, y, size: 9, font, color: WHITE });
  return y - 22;
}

function drawCheckbox(page: any, checked: boolean, label: string, x: number, y: number, font: any, size = 8) {
  const boxSize = 10;
  page.drawRectangle({ x, y: y - 2, width: boxSize, height: boxSize, borderColor: BLACK, borderWidth: 0.8, color: WHITE });
  if (checked) page.drawText("X", { x: x + 2, y, size: 7, font, color: BLACK });
  page.drawText(label, { x: x + boxSize + 4, y, size, font, color: BLACK });
}

async function embedSignature(pdfDoc: any, page: any, dataUrl: string, x: number, y: number, maxW = 160, maxH = 50) {
  if (!dataUrl || !dataUrl.startsWith("data:image/png;base64,")) return;
  try {
    const base64 = dataUrl.split(",")[1];
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    const img = await pdfDoc.embedPng(bytes);
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    page.drawImage(img, { x, y, width: img.width * scale, height: img.height * scale });
  } catch (e) {
    console.error("Signature embed error:", e);
  }
}

export async function generateInspectionPdfBytes(data: Record<string, any>): Promise<Uint8Array> {
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
  // PAGE 1: Στοιχεία Πελάτη
  // ══════════════════════════════════════════════════════════════════════
  const p1 = pdfDoc.addPage([A4_W, A4_H]);
  let y = A4_H - 50;

  drawText(p1, "ΟΤΕ", M, y + 10, boldFont, 22, BLUE);
  drawText(p1, "ΟΜΙΛΟΣ ΕΤΑΙΡΕΙΩΝ", M, y - 8, font, 7, BLUE);
  drawText(p1, "ΕΚΘΕΣΗ ΤΕΧΝΙΚΗΣ ΕΠΙΘΕΩΡΗΣΗΣ ΚΤΙΡΙΟΥ", M + 150, y + 8, boldFont, 14, BLACK);
  drawText(p1, "(Έντυπο για Διαχειριστή)", M + 200, y - 8, font, 10, BLACK);
  y -= 40;

  p1.drawRectangle({ x: M - 5, y: 30, width: MW + 10, height: y - 25, borderColor: BLACK, borderWidth: 0.5, color: undefined });

  y = drawSectionHeader(p1, "Στοιχεία", M, y, MW, boldFont);

  drawText(p1, "ΟΝΟΜΑΤΕΠΩΝΥΜΟ / ΕΠΩΝΥΜΙΑ:", M + 5, y, boldFont, 8.5);
  drawText(p1, data.customer_name || "", M + 190, y, font, 9);
  drawText(p1, "ΟΝΟΜΑ ΠΑΤΡΟΣ:", M + 370, y, boldFont, 8.5);
  drawText(p1, data.customer_father_name || "", M + 460, y, font, 9);
  y -= 18;
  drawLine(p1, M, y + 5, M + MW, y + 5);

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

  y -= 5;
  y = drawSectionHeader(p1, "Παρατηρήσεις", M, y, MW, boldFont);
  if (data.customer_notes) {
    const noteLines = (data.customer_notes || "").match(/.{1,90}/g) || [data.customer_notes];
    for (const line of noteLines) {
      drawText(p1, line, M + 5, y, font, 8);
      y -= 12;
    }
  }
  for (let i = 0; i < 5; i++) {
    drawLine(p1, M + 5, y, M + MW - 5, y, 0.3);
    y -= 14;
  }

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
  // PAGE 2: Τεχνική Περιγραφή
  // ══════════════════════════════════════════════════════════════════════
  const p2 = pdfDoc.addPage([A4_W, A4_H]);
  y = A4_H - 40;

  drawText(p2, "ΟΤΕ", M, y, boldFont, 16, BLUE);
  drawText(p2, "ΕΝΤΥΠΟ ΤΕΧΝΙΚΗΣ ΠΕΡΙΓΡΑΦΗΣ – ΕΠΙΘΕΩΡΗΣΗΣ", M + 100, y, boldFont, 13, BLACK);
  y -= 30;

  drawText(p2, "1. ΟΔΕΥΣΗ ΜΕΧΡΙ ΤΟΝ ΚΕΝΤΡΙΚΟ ΟΠΤΙΚΟ ΚΑΤΑΝΕΜΗΤΗ ΚΤΙΡΙΟΥ (Β.Ε.Ρ.)", M + 30, y, boldFont, 9);
  y -= 22;

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

  drawText(p2, "Εκσκαφή πεζοδρομίου", M, y, font, 8);
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

  for (let i = 0; i < 3; i++) { drawLine(p2, M, y, M + MW, y, 0.3); y -= 12; }

  drawText(p2, "Τοποθέτηση Σιδηροσωλήνα", M + 180, y, font, 8);
  drawCheckbox(p2, data.pipe_placement, "", M + 320, y, font);
  drawText(p2, "Στήριξη επί τοιχοποιίας", M + 350, y, font, 8);
  drawCheckbox(p2, data.wall_mount, "", M + MW - 10, y, font);
  y -= 14;
  drawText(p2, "περίφραξης ή/και κτιρίου", M + 350, y, font, 8);
  drawCheckbox(p2, data.fence_building_mount, "", M + MW - 10, y, font);
  y -= 14;
  drawText(p2, "Εκσκαφή έως το κτίριο και στήριξη επί του κτιρίου", M + 180, y, font, 8);
  drawCheckbox(p2, data.excavation_to_building, "", M + MW - 10, y, font);
  y -= 25;

  // Section 2
  drawText(p2, "2. ΘΕΣΗ Β.Ε.Ρ", M + 180, y, boldFont, 10);
  y -= 20;

  const bepOpts = [
    { key: "internal", label: "ΕΣΩΤΕΡΙΚΑ" }, { key: "external", label: "ΕΞΩΤΕΡΙΚΑ" },
    { key: "fence", label: "ΣΤΗΝ ΠΕΡΙΦΡΑΞΗ" }, { key: "building", label: "ΣΤΟ ΚΤΙΡΙΟ" },
    { key: "pole", label: "ΕΠΙ ΣΤΥΛΟΥ" }, { key: "pillar", label: "PILAR" },
    { key: "basement", label: "ΥΠΟΓΕΙΟ" }, { key: "ground", label: "ΙΣΟΓΕΙΟ" },
    { key: "rooftop", label: "ΤΑΡΑΤΣΑ" }, { key: "piloti", label: "ΠΥΛΩΤΗ" },
  ];
  for (let i = 0; i < 5; i++) {
    const o = bepOpts[i]; drawText(p2, o.label, M + i * 103, y, font, 8);
    drawCheckbox(p2, data.bep_position === o.key, "", M + i * 103 + 80, y, font);
  }
  y -= 16;
  for (let i = 5; i < 10; i++) {
    const o = bepOpts[i]; drawText(p2, o.label, M + (i - 5) * 103, y, font, 8);
    drawCheckbox(p2, data.bep_position === o.key, "", M + (i - 5) * 103 + 80, y, font);
  }
  y -= 25;

  // Section 3
  drawText(p2, "3. ΚΑΤΑΚΟΡΥΦΗ ΟΔΕΥΣΗ ΠΡΟΣ ΤΑ ΚΟΥΤΙΑ ΔΙΑΝΟΜΗΣ ΟΡΟΦΩΝ (F.B.)", M + 30, y, boldFont, 9);
  y -= 18;
  const vertOpts = [
    { key: "shaft", label: "ΦΡΕΑΤΙΟ" }, { key: "staircase", label: "ΚΛΙΜΑΚΟΣΤΑΣΙΟ" },
    { key: "lightwell", label: "ΦΩΤΑΓΩΓΟΣ" }, { key: "other", label: "ΑΛΛΟΣ ΤΡΟΠΟΣ" },
    { key: "elevator", label: "ΑΝΕΛΚΥΣΤΗΡΑ" }, { key: "internal_external", label: "ΕΣΩΤ./ΕΞΩΤ." },
    { key: "lantern", label: "ΦΑΝΑΡΙ ΣΚΑΛΑΣ" },
  ];
  for (let i = 0; i < 4; i++) {
    const o = vertOpts[i]; drawText(p2, o.label, M + i * 130, y, font, 8);
    drawCheckbox(p2, data.vertical_routing === o.key, "", M + i * 130 + 90, y, font);
  }
  y -= 16;
  for (let i = 4; i < 7; i++) {
    const o = vertOpts[i]; drawText(p2, o.label, M + (i - 4) * 130, y, font, 8);
    drawCheckbox(p2, data.vertical_routing === o.key, "", M + (i - 4) * 130 + 90, y, font);
  }
  y -= 25;

  // Sketch area
  drawText(p2, "ΣΚΑΡΙΦΗΜΑΤΑ", M, y, boldFont, 10);
  y -= 15;
  const skH = 150;
  p2.drawRectangle({ x: M, y: y - skH, width: 200, height: skH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
  for (let gx = 1; gx < 10; gx++) p2.drawLine({ start: { x: M + gx * 20, y }, end: { x: M + gx * 20, y: y - skH }, thickness: 0.2, color: rgb(0.8, 0.8, 0.8) });
  for (let gy = 1; gy < 8; gy++) p2.drawLine({ start: { x: M, y: y - gy * (skH / 8) }, end: { x: M + 200, y: y - gy * (skH / 8) }, thickness: 0.2, color: rgb(0.8, 0.8, 0.8) });
  drawText(p2, "Ο.Γ.", M + 5, y - 30, font, 7, GREY);
  drawText(p2, "Ρ.Γ", M + 5, y - skH + 30, font, 7, GREY);
  drawText(p2, "Κράσπεδο", M + 5, y - skH + 10, font, 7, GREY);

  drawText(p2, "Υπογραφή Μηχανικού", M + 320, y - 10, font, 8);
  drawLine(p2, M + 320, y - 20, M + MW, y - 20, 0.3);
  if (data.engineer_signature) await embedSignature(pdfDoc, p2, data.engineer_signature, M + 320, y - 70);
  y -= skH + 15;

  drawText(p2, "ΠΑΡΑΤΗΡΗΣΕΙΣ - ΠΕΡΙΓΡΑΦΗ", M, y, boldFont, 10);
  y -= 14;
  if (data.sketch_notes) {
    const nl = (data.sketch_notes || "").match(/.{1,100}/g) || [data.sketch_notes];
    for (const l of nl) { drawText(p2, l, M + 5, y, font, 8); y -= 12; }
  }
  for (let i = 0; i < 4; i++) { drawLine(p2, M, y, M + MW, y, 0.3); y -= 14; }

  drawText(p2, "Θέση Οπτικής Πρίζας", M, y, boldFont, 8);
  drawText(p2, data.optical_socket_position || "", M + 120, y, font, 8);
  drawText(p2, "Υπογραφή Μηχανικού", M + 320, y, font, 8);
  y -= 25;

  drawText(p2, "ΥΛΙΚΑ ΠΟΥ ΧΡΗΣΙΜΟΠΟΙΟΥΝΤΑΙ ΣΕ ΤΥΠΙΚΗ ΚΑΤΑΣΚΕΥΗ:", M, y, boldFont, 7);
  y -= 10;
  drawText(p2, "- Γαλβανισμένος Σιδηροσωλήνας Φ20.", M, y, font, 7, GREY); y -= 10;
  drawText(p2, "- Σύστημα Πλαστικών Σωλήνων Βαρέως Τύπου Condur – Conflex Φ16 έως Φ25.", M, y, font, 7, GREY); y -= 10;
  drawText(p2, "- Από το F.B. έως την οπτική πρίζα του πελάτη: Πλαστικό Κανάλι Διανομής.", M, y, font, 7, GREY); y -= 10;
  drawText(p2, "*B.E.P.: Building Entry Point – F.B.: Floor Box", M + 100, y, font, 7, GREY);

  drawText(p2, "Όνομα & Υπογραφή Πελάτη", M + 300, y + 20, font, 8);
  if (data.customer_signature) await embedSignature(pdfDoc, p2, data.customer_signature, M + 300, y + 12, 150, 40);
  drawText(p2, "Όνομα & Υπογραφή Διαχειριστή", M + 300, y, font, 8);
  if (data.manager_signature) await embedSignature(pdfDoc, p2, data.manager_signature, M + 300, y - 8, 150, 40);

  y -= 25;
  drawText(p2, "Η υποδομή που απαιτείται προκειμένου να διασυνδεθεί η πολυκατοικία με το δίκτυο οπτικών ινών θα βαρύνει αποκλειστικά τον", M, y, font, 6.5);
  y -= 9;
  drawText(p2, "αιτούντα την υπηρεσία FTTH, ο οποίος έχει ενημερωθεί για τη χρέωση βάσει του συμβολαίου του με τον τηλεπικοινωνιακό πάροχο.", M, y, font, 6.5);

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 3: Υπεύθυνη Δήλωση
  // ══════════════════════════════════════════════════════════════════════
  const p3 = pdfDoc.addPage([A4_W, A4_H]);
  y = A4_H - 50;

  drawText(p3, "ΟΤΕ", M, y + 10, boldFont, 20, BLUE);
  drawText(p3, "ΟΜΙΛΟΣ ΕΤΑΙΡΕΙΩΝ", M, y - 6, font, 7, BLUE);
  drawText(p3, "ΥΠΕΥΘΥΝΗ ΔΗΛΩΣΗ", M + 180, y + 15, boldFont, 14, BLACK);
  drawText(p3, "ΔΙΑΧΕΙΡΙΣΤΗ/ ΕΚΠΡΟΣΩΠΟΥ ΓΕΝΙΚΗΣ ΣΥΝΕΛΕΥΣΗΣ", M + 120, y, boldFont, 11, BLACK);
  drawText(p3, "ΠΡΩΤΟΤΥΠΟ", M + 230, y - 16, boldFont, 11, rgb(1, 0, 0));
  drawText(p3, "(ΥΠΟΓΡΑΦΕΤΑΙ ΥΠΟΧΡΕΩΤΙΚΑ ΜΟΝΟ ΜΙΑ από τις ΔΥΟ ΕΠΙΛΟΓΕΣ)", M + 120, y - 30, font, 9);
  y -= 60;

  p3.drawRectangle({ x: M - 5, y: 30, width: MW + 10, height: y - 25, borderColor: BLUE, borderWidth: 1, color: undefined });
  y -= 10;

  drawText(p3, "ΕΠΙΛΟΓΗ (Α) – ΕΓΚΡΙΝΩ ΑΜΕΣΗ ΕΝΑΡΞΗ ΕΡΓΑΣΙΩΝ", M + 5, y, boldFont, 10);
  y -= 25;

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
  drawLine(p3, M, y, M + MW, y, 0.5);

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 4: BCP/BEP/BMO
  // ══════════════════════════════════════════════════════════════════════
  const p4 = pdfDoc.addPage([A4_W, A4_H]);
  y = A4_H - 40;

  p4.drawRectangle({ x: M, y: y - 180, width: MW, height: 185, borderColor: BLACK, borderWidth: 0.5, color: undefined });

  drawText(p4, "ΔΙΕΥΘΥΝΣΗ:", M + 5, y, boldFont, 9);
  drawText(p4, data.building_address || "", M + 80, y, font, 9);
  y -= 16;
  drawText(p4, "ΟΡΟΦΟΣ ΠΕΛΑΤΗ:", M + 5, y, boldFont, 8.5);
  drawText(p4, data.customer_floor_select || "", M + 110, y, font, 9);
  drawText(p4, "Building Id:", M + 280, y, boldFont, 8.5);
  drawText(p4, data.building_id || "", M + 360, y, font, 9);
  y -= 20;

  const flrs = [["ΥΠΟΓΕΙΟ","ΗΜΙΥΠΟΓΕΙΟ"],["ΙΣΟΓΕΙΟ","ΗΜΙΟΡΟΦΟΣ"],["1ΟΣ ΟΡΟΦΟΣ","2ΟΣ ΟΡΟΦΟΣ"],["3ΟΣ ΟΡΟΦΟΣ","4ΟΣ ΟΡΟΦΟΣ"],["5ΟΣ ΟΡΟΦΟΣ","6ΟΣ ΟΡΟΦΟΣ"],["7ΟΣ ΟΡΟΦΟΣ","8ΟΣ ΟΡΟΦΟΣ"]];
  for (const [l, r] of flrs) {
    drawText(p4, l, M + 5, y, font, 8);
    p4.drawRectangle({ x: M + 5, y: y - 20, width: 220, height: 18, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    drawText(p4, r, M + 270, y, font, 8);
    p4.drawRectangle({ x: M + 270, y: y - 20, width: 220, height: 18, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    y -= 22;
  }
  y -= 15;

  drawText(p4, "ΣΥΝΟΛΟ ΔΙΑΜΕΡΙΣΜΑΤΩΝ:", M + 5, y, boldFont, 8.5);
  drawText(p4, String(data.total_apartments || ""), M + 155, y, font, 9);
  drawText(p4, "SR ID:", M + 280, y, boldFont, 8.5);
  drawText(p4, data.sr_id || "", M + 320, y, font, 9);
  y -= 16;
  drawText(p4, "ΣΥΝΟΛΟ ΚΑΤΑΣΤΗΜΑΤΩΝ:", M + 5, y, boldFont, 8.5);
  drawText(p4, String(data.total_shops || ""), M + 155, y, font, 9);
  drawText(p4, "ΚΑΜΠΙΝΑ:", M + 280, y, boldFont, 8.5);
  drawText(p4, data.cabinet || "", M + 340, y, font, 9);
  y -= 16;
  drawText(p4, "ΣΥΝΟΛΟ ΧΩΡΩΝ:", M + 5, y, boldFont, 8.5);
  drawText(p4, String(data.total_spaces || ""), M + 155, y, font, 9);
  drawText(p4, "ΣΩΛΗΝΙΣΚΟΣ:", M + 280, y, boldFont, 8.5);
  drawText(p4, data.pipe_code || "", M + 360, y, font, 9);
  y -= 16;
  drawText(p4, "ΣΥΝΟΛΟ ΟΡΟΦΩΝ/ΕΠΙΠΕΔΩΝ:", M + 5, y, boldFont, 8.5);
  drawText(p4, String(data.total_floors || ""), M + 170, y, font, 9);
  y -= 30;

  const tX = M;
  const cW = [80, 70, 60];
  const rH = 18;

  // BCP
  for (const [i, h] of (["BCP", "RAYCAP", "ZTT"] as const).entries()) {
    p4.drawRectangle({ x: tX + cW.slice(0, i).reduce((a, b) => a + b, 0), y, width: cW[i], height: rH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
    drawText(p4, h, tX + cW.slice(0, i).reduce((a, b) => a + b, 0) + 10, y + 5, boldFont, i === 0 ? 9 : 8);
  }
  y -= rH;
  for (const sz of ["SMALL", "MEDIUM"]) {
    for (const [i] of cW.entries()) {
      p4.drawRectangle({ x: tX + cW.slice(0, i).reduce((a, b) => a + b, 0), y, width: cW[i], height: rH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    }
    drawText(p4, sz, tX + 10, y + 5, font, 8);
    if (data.bcp_brand?.toUpperCase() === "RAYCAP" && data.bcp_size?.toUpperCase() === sz) drawText(p4, "X", tX + cW[0] + 25, y + 5, boldFont, 9);
    if (data.bcp_brand?.toUpperCase() === "ZTT" && data.bcp_size?.toUpperCase() === sz) drawText(p4, "X", tX + cW[0] + cW[1] + 20, y + 5, boldFont, 9);
    y -= rH;
  }

  // Floorbox/Drop table
  const fX = M + 280;
  const fW = [70, 50, 50, 50];
  let fy2 = y + 3 * rH;
  for (const [i, h] of (["FLOORBOX", "4 Drop", "6 Drop", "12 Drop"] as const).entries()) {
    p4.drawRectangle({ x: fX + fW.slice(0, i).reduce((a, b) => a + b, 0), y: fy2, width: fW[i], height: rH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
    drawText(p4, h, fX + fW.slice(0, i).reduce((a, b) => a + b, 0) + 5, fy2 + 5, boldFont, 7);
  }
  fy2 -= rH;
  for (const [i] of fW.entries()) {
    p4.drawRectangle({ x: fX + fW.slice(0, i).reduce((a, b) => a + b, 0), y: fy2, width: fW[i], height: rH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
  }
  if (data.bcp_floorbox) drawText(p4, "X", fX + 25, fy2 + 5, boldFont, 9);
  if (data.bcp_drop_4) drawText(p4, "X", fX + fW[0] + 15, fy2 + 5, boldFont, 9);
  if (data.bcp_drop_6) drawText(p4, "X", fX + fW[0] + fW[1] + 15, fy2 + 5, boldFont, 9);
  if (data.bcp_drop_12) drawText(p4, "X", fX + fW[0] + fW[1] + fW[2] + 15, fy2 + 5, boldFont, 9);

  y -= 15;

  // BEP
  const bW = [80, 70, 60, 80];
  for (const [i, h] of (["BEP", "RAYCAP", "ZTT", "ΠΟΣΟΤΗΤΑ"] as const).entries()) {
    p4.drawRectangle({ x: tX + bW.slice(0, i).reduce((a, b) => a + b, 0), y, width: bW[i], height: rH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
    drawText(p4, h, tX + bW.slice(0, i).reduce((a, b) => a + b, 0) + (i === 3 ? 5 : 10), y + 5, boldFont, i === 0 ? 9 : (i === 3 ? 7 : 8));
  }
  y -= rH;
  for (const sz of ["SMALL", "MEDIUM", "LARGE", "XLARGE"]) {
    for (const [i] of bW.entries()) {
      p4.drawRectangle({ x: tX + bW.slice(0, i).reduce((a, b) => a + b, 0), y, width: bW[i], height: rH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    }
    drawText(p4, sz, tX + 10, y + 5, font, 8);
    if (data.bep_brand?.toUpperCase() === "RAYCAP" && data.bep_size?.toUpperCase() === sz) drawText(p4, "X", tX + bW[0] + 25, y + 5, boldFont, 9);
    if (data.bep_brand?.toUpperCase() === "ZTT" && data.bep_size?.toUpperCase() === sz) drawText(p4, "X", tX + bW[0] + bW[1] + 20, y + 5, boldFont, 9);
    if (data.bep_size?.toUpperCase() === sz) drawText(p4, data.bep_capacity || "", tX + bW[0] + bW[1] + bW[2] + 15, y + 5, font, 8);
    y -= rH;
  }
  y -= 15;

  // BMO
  for (const [i, h] of (["BMO", "RAYCAP", "ZTT", "ΠΟΣΟΤΗΤΑ"] as const).entries()) {
    p4.drawRectangle({ x: tX + bW.slice(0, i).reduce((a, b) => a + b, 0), y, width: bW[i], height: rH, borderColor: BLACK, borderWidth: 0.5, color: undefined });
    drawText(p4, h, tX + bW.slice(0, i).reduce((a, b) => a + b, 0) + (i === 3 ? 5 : 10), y + 5, boldFont, i === 0 ? 9 : (i === 3 ? 7 : 8));
  }
  y -= rH;
  for (const sz of ["SMALL", "MEDIUM", "LARGE"]) {
    for (const [i] of bW.entries()) {
      p4.drawRectangle({ x: tX + bW.slice(0, i).reduce((a, b) => a + b, 0), y, width: bW[i], height: rH, borderColor: BLACK, borderWidth: 0.3, color: undefined });
    }
    drawText(p4, sz, tX + 10, y + 5, font, 8);
    if (data.bmo_brand?.toUpperCase() === "RAYCAP" && data.bmo_size?.toUpperCase() === sz) drawText(p4, "X", tX + bW[0] + 25, y + 5, boldFont, 9);
    if (data.bmo_brand?.toUpperCase() === "ZTT" && data.bmo_size?.toUpperCase() === sz) drawText(p4, "X", tX + bW[0] + bW[1] + 20, y + 5, boldFont, 9);
    if (data.bmo_size?.toUpperCase() === sz) drawText(p4, data.bmo_capacity || "", tX + bW[0] + bW[1] + bW[2] + 15, y + 5, font, 8);
    y -= rH;
  }

  // Footer
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    pages[i].drawText(`SR: ${data.sr_id || ""} — Σελίδα ${i + 1}/${pages.length}`, { x: 40, y: 15, size: 7, font, color: GREY });
  }

  return pdfDoc.save();
}
