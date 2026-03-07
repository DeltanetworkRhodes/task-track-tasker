import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const A4_W = 595.28;
const A4_H = 841.89;

function drawText(page: any, text: string, x: number, y: number, font: any, size = 9, color = rgb(0.1, 0.14, 0.2)) {
  page.drawText(text || "", { x, y, size, font, color });
}

function drawLabel(page: any, label: string, x: number, y: number, font: any, boldFont: any, value: string) {
  page.drawText(label, { x, y, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(value || "—", { x: x + 130, y, size: 9, font, color: rgb(0.1, 0.14, 0.2) });
}

function drawCheckbox(page: any, checked: boolean, label: string, x: number, y: number, font: any) {
  const boxSize = 10;
  page.drawRectangle({
    x, y: y - 2, width: boxSize, height: boxSize,
    borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 0.8,
    color: checked ? rgb(0.1, 0.6, 0.54) : rgb(1, 1, 1),
  });
  if (checked) {
    page.drawText("V", { x: x + 2, y, size: 7, font, color: rgb(1, 1, 1) });
  }
  page.drawText(label, { x: x + boxSize + 4, y, size: 8, font, color: rgb(0.1, 0.14, 0.2) });
}

async function embedSignature(pdfDoc: any, page: any, dataUrl: string, x: number, y: number, maxW = 180, maxH = 60) {
  if (!dataUrl || !dataUrl.startsWith("data:image/png;base64,")) return;
  try {
    const base64 = dataUrl.split(",")[1];
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const img = await pdfDoc.embedPng(bytes);
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    page.drawImage(img, { x, y, width: img.width * scale, height: img.height * scale });
  } catch (e) {
    console.error("Signature embed error:", e);
  }
}

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

  const brandColor = rgb(0.1, 0.6, 0.54);
  const headerBg = rgb(0.1, 0.14, 0.2);
  const lightBg = rgb(0.94, 0.96, 0.97);

  // ─── PAGE 1: Customer Info ───
  const p1 = pdfDoc.addPage([A4_W, A4_H]);
  let y = A4_H - 40;

  p1.drawRectangle({ x: 0, y: y - 5, width: A4_W, height: 35, color: headerBg });
  p1.drawText("ΕΚΘΕΣΗ ΤΕΧΝΙΚΗΣ ΕΠΙΘΕΩΡΗΣΗΣ ΚΤΙΡΙΟΥ", { x: 40, y: y + 5, size: 14, font: boldFont, color: rgb(1, 1, 1) });
  p1.drawText("(Έντυπο για Διαχειριστή)", { x: 40, y: y - 10, size: 9, font, color: rgb(0.8, 0.8, 0.8) });
  y -= 50;

  p1.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
  p1.drawText("ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ", { x: 40, y: y + 2, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  y -= 30;

  const customerFields: [string, string][] = [
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

  if (data.customer_notes) {
    y -= 10;
    p1.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
    p1.drawText("ΠΑΡΑΤΗΡΗΣΕΙΣ", { x: 40, y: y + 2, size: 10, font: boldFont, color: rgb(1, 1, 1) });
    y -= 28;
    drawText(p1, data.customer_notes, 40, y, font, 9);
    y -= 20;
  }

  y -= 10;
  p1.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
  p1.drawText("ΣΤΟΙΧΕΙΑ ΔΙΑΧΕΙΡΙΣΤΗ", { x: 40, y: y + 2, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  y -= 30;

  for (const [label, value] of [
    ["Ονοματεπώνυμο:", data.manager_name],
    ["Τηλ. (κινητό):", data.manager_mobile],
    ["Email:", data.manager_email],
  ] as [string, string][]) {
    drawLabel(p1, label, 40, y, font, boldFont, value || "");
    y -= 18;
  }

  y -= 10;
  p1.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
  p1.drawText("ΑΡΜΟΔΙΑ ΤΕΧΝΙΚΗ ΥΠΗΡΕΣΙΑ", { x: 40, y: y + 2, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  y -= 30;

  for (const [label, value] of [
    ["Διεύθυνση:", data.service_address],
    ["Τηλέφωνο:", data.service_phone],
    ["Email:", data.service_email],
  ] as [string, string][]) {
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

  const verticalLabels: Record<string, string> = {
    shaft: "Φρεάτιο", staircase: "Κλιμακοστάσιο", lightwell: "Φωταγωγός",
    elevator: "Ανελκυστήρα", lantern: "Φανάρι σκάλας", other: "Άλλο",
  };

  p2.drawRectangle({ x: 30, y: y - 5, width: A4_W - 60, height: 22, color: brandColor });
  p2.drawText("3. ΚΑΤΑΚΟΡΥΦΗ ΟΔΕΥΣΗ", { x: 40, y: y + 2, size: 9, font: boldFont, color: rgb(1, 1, 1) });
  y -= 30;
  drawText(p2, `Τρόπος: ${verticalLabels[data.vertical_routing] || data.vertical_routing || "—"}`, 40, y, boldFont, 10);
  y -= 35;

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

  const declFields: [string, string][] = [
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

  const buildingFields: [string, string][] = [
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

  return pdfDoc.save();
}
