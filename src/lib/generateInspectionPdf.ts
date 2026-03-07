import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

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
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const img = await pdfDoc.embedPng(bytes);
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    page.drawImage(img, { x, y, width: img.width * scale, height: img.height * scale });
  } catch (error) {
    console.error("Signature embed error:", error);
  }
}

export async function generateInspectionPdfBytes(data: Record<string, any>): Promise<Uint8Array> {
  const [templateBytes, fontBytes, boldFontBytes] = await Promise.all([
    fetch("/templates/inspection_template.pdf").then(async (r) => {
      if (!r.ok) throw new Error("Δεν βρέθηκε το inspection_template.pdf");
      return r.arrayBuffer();
    }),
    fetch("https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/greek-400-normal.woff").then((r) => r.arrayBuffer()),
    fetch("https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/greek-700-normal.woff").then((r) => r.arrayBuffer()),
  ]);

  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });
  const boldFont = await pdfDoc.embedFont(boldFontBytes, { subset: true });

  const pages = pdfDoc.getPages();
  if (pages.length < 4) throw new Error("Το template PDF πρέπει να έχει 4 σελίδες");

  const p1 = pages[0];
  drawText(p1, data.customer_name || "", 185, 664, font);
  drawText(p1, data.customer_father_name || "", 466, 664, font);
  drawText(p1, data.customer_mobile || "", 172, 629, font);
  drawText(p1, data.customer_phone || "", 176, 594, font);
  drawText(p1, data.customer_email || "", 82, 560, font);
  drawText(p1, data.customer_street || "", 72, 512, font);
  drawText(p1, data.customer_number || "", 292, 512, font);
  drawText(p1, data.customer_postal_code || "", 385, 512, font);
  drawText(p1, data.customer_floor || "", 92, 478, font);
  drawText(p1, data.customer_apartment_code || "", 250, 478, font);
  drawText(p1, data.customer_county || "", 368, 478, font);
  drawText(p1, data.customer_municipality || "", 470, 478, font);
  drawWrappedText(p1, data.customer_notes || "", 35, 430, 520, 12, font, 8, 6);

  drawText(p1, data.manager_name || "", 170, 307, font);
  drawText(p1, data.manager_mobile || "", 214, 274, font);
  drawText(p1, data.manager_email || "", 82, 240, font);

  drawText(p1, data.service_address || "", 190, 184, font);
  drawText(p1, data.service_phone || "", 224, 151, font);
  drawText(p1, data.service_email || "", 82, 119, font);
  drawText(p1, data.technician_name || "", 350, 85, font);

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

  return pdfDoc.save();
}
