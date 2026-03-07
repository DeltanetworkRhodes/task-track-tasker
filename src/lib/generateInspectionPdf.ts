import { PDFDocument, rgb, PDFPage, PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const BLACK = rgb(0, 0, 0);

// --------------- types for pdf-mapping.json ---------------
interface FieldDef {
  key: string;
  type: string;
  x?: number;
  y?: number;
  size?: number;
  maxWidth?: number;
  maxW?: number;
  maxH?: number;
  lineHeight?: number;
  maxLines?: number;
  boxWidth?: number;
  boxCount?: number;
  sourceKey?: string;
  match?: any;
  map?: Record<string, { x: number; y: number }>;
  brands?: Record<string, number>;
  sizes?: Record<string, number>;
  capacityX?: number;
  format?: string;
}

interface PageDef {
  title: string;
  fields: FieldDef[];
}

interface PdfMapping {
  pages: Record<string, PageDef>;
  fonts: { regular: string; bold: string };
  defaults: { fontSize: number; checkSize: number; signatureMaxW: number; signatureMaxH: number };
}

// --------------- floor normalizer ---------------
function normalizeFloor(value: string | null | undefined): string {
  const v = (value || "").toLowerCase().trim();
  if (v.includes("υπογ") && !v.includes("ημι")) return "basement";
  if (v.includes("ημιυπο")) return "semi-basement";
  if (v.includes("ισο")) return "ground";
  if (v.includes("ημιο")) return "half-floor";
  const n = v.replace(/[^0-9]/g, "");
  return n || "";
}

// --------------- drawing helpers ---------------
function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size = 8.5) {
  if (!text) return;
  page.drawText(text, { x, y, size, font, color: BLACK });
}

function drawCheck(page: PDFPage, x: number, y: number, font: PDFFont, size = 9) {
  page.drawText("X", { x, y, size, font, color: BLACK });
}

function drawCircleAround(page: PDFPage, x: number, y: number, radius = 7) {
  page.drawEllipse({
    x: x + radius / 2,
    y: y + radius / 2,
    xScale: radius,
    yScale: radius,
    borderColor: BLACK,
    borderWidth: 1.5,
  });
}

function drawBoxedText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, boxWidth: number, boxCount: number) {
  if (!text) return;
  const chars = text.replace(/\s/g, "").split("");
  for (let i = 0; i < Math.min(chars.length, boxCount); i++) {
    const charW = font.widthOfTextAtSize(chars[i], size);
    const cx = x + i * boxWidth + (boxWidth - charW) / 2;
    page.drawText(chars[i], { x: cx, y, size, font, color: BLACK });
  }
}

function drawWrappedText(page: PDFPage, text: string, x: number, startY: number, maxWidth: number, lineHeight: number, font: PDFFont, size: number, maxLines = 6) {
  if (!text) return;
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let y = startY;
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) { line = test; continue; }
    drawText(page, line, x, y, font, size);
    y -= lineHeight;
    lines += 1;
    if (lines >= maxLines) return;
    line = word;
  }
  if (line && lines < maxLines) drawText(page, line, x, y, font, size);
}

async function embedImage(pdfDoc: PDFDocument, page: PDFPage, dataUrl: string, x: number, y: number, maxW: number, maxH: number) {
  if (!dataUrl) return;
  try {
    let img;
    if (dataUrl.startsWith("data:image/png")) {
      const base64 = dataUrl.split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      img = await pdfDoc.embedPng(bytes);
    } else if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) {
      const base64 = dataUrl.split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      img = await pdfDoc.embedJpg(bytes);
    } else {
      return;
    }
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    page.drawImage(img, { x, y, width: img.width * scale, height: img.height * scale });
  } catch (error) {
    console.error("Image embed error:", error);
  }
}

// --------------- field processors ---------------
async function processField(
  field: FieldDef,
  data: Record<string, any>,
  page: PDFPage,
  pdfDoc: PDFDocument,
  font: PDFFont,
  boldFont: PDFFont,
  defaults: PdfMapping["defaults"]
) {
  const val = field.sourceKey ? data[field.sourceKey] : data[field.key];
  const size = field.size ?? defaults.fontSize;

  switch (field.type) {
    case "text": {
      const txt = val != null ? String(val) : "";
      drawText(page, txt, field.x!, field.y!, font, size);
      break;
    }
    case "boxed": {
      const txt = val != null ? String(val) : "";
      drawBoxedText(page, txt, field.x!, field.y!, font, size, field.boxWidth ?? 13.5, field.boxCount ?? 5);
      break;
    }
    case "wrapped": {
      const txt = val != null ? String(val) : "";
      drawWrappedText(page, txt, field.x!, field.y!, field.maxWidth ?? 500, field.lineHeight ?? 12, font, size, field.maxLines ?? 6);
      break;
    }
    case "check": {
      if (val) drawCheck(page, field.x!, field.y!, boldFont, defaults.checkSize);
      break;
    }
    case "check_if": {
      if (val === field.match) drawCircleAround(page, field.x!, field.y!);
      break;
    }
    case "check_if_not": {
      if (val !== field.match && val != null) drawCircleAround(page, field.x!, field.y!);
      break;
    }
    case "check_map": {
      const mapVal = val ? String(val) : "";
      const coord = field.map?.[mapVal];
      if (coord) drawCheck(page, coord.x, coord.y, boldFont, defaults.checkSize);
      break;
    }
    case "check_map_multi": {
      // Support comma-separated multi-values
      const values = val ? String(val).split(",").map((v: string) => v.trim()) : [];
      for (const v of values) {
        const coord = field.map?.[v];
        if (coord) drawCheck(page, coord.x, coord.y, boldFont, defaults.checkSize);
      }
      break;
    }
    case "floor_check": {
      const normalized = normalizeFloor(val);
      const coord = field.map?.[normalized];
      if (coord) drawCheck(page, coord.x, coord.y, boldFont, defaults.checkSize);
      break;
    }
    case "equipment_grid": {
      const prefix = field.key; // bcp, bep, bmo
      const sizeVal = (data[`${prefix}_size`] || "").toUpperCase();
      const brandVal = (data[`${prefix}_brand`] || "").toUpperCase();
      const rowY = field.sizes?.[sizeVal];
      const colX = field.brands?.[brandVal];
      if (rowY != null && colX != null) drawCheck(page, colX, rowY, boldFont, defaults.checkSize);
      if (rowY != null && field.capacityX != null) {
        const cap = data[`${prefix}_capacity`] || "";
        if (cap) drawText(page, String(cap), field.capacityX, rowY, font, 8);
      }
      break;
    }
    case "signature": {
      if (val) {
        await embedImage(pdfDoc, page, val, field.x!, field.y!, field.maxW ?? defaults.signatureMaxW, field.maxH ?? defaults.signatureMaxH);
      }
      break;
    }
    case "image": {
      if (val) {
        await embedImage(pdfDoc, page, val, field.x!, field.y!, field.maxW ?? 520, field.maxH ?? 280);
      }
      break;
    }
  }
}

// --------------- main export ---------------
let cachedMapping: PdfMapping | null = null;

async function loadMapping(): Promise<PdfMapping> {
  if (cachedMapping) return cachedMapping;
  const resp = await fetch(`/templates/pdf-mapping.json?v=${Date.now()}`);
  if (!resp.ok) throw new Error("Cannot load pdf-mapping.json");
  cachedMapping = await resp.json();
  return cachedMapping!;
}

export async function generateInspectionPdfBytes(data: Record<string, any>): Promise<Uint8Array> {
  const mapping = await loadMapping();

  const [templateBytes, fontBytes, boldFontBytes] = await Promise.all([
    fetch("/templates/inspection_template.pdf").then(async (r) => {
      if (!r.ok) throw new Error("Δεν βρέθηκε το inspection_template.pdf");
      return r.arrayBuffer();
    }),
    fetch("/fonts/Roboto-Regular.ttf").then((r) => r.arrayBuffer()),
    fetch("/fonts/Roboto-Bold.ttf").then((r) => r.arrayBuffer()),
  ]);

  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });
  const boldFont = await pdfDoc.embedFont(boldFontBytes, { subset: true });

  const pages = pdfDoc.getPages();
  if (pages.length < 4) throw new Error("Το template PDF πρέπει να έχει 4 σελίδες");

  // Process each page using the mapping
  for (const [pageNum, pageDef] of Object.entries(mapping.pages)) {
    const pageIndex = parseInt(pageNum) - 1;
    const page = pages[pageIndex];
    if (!page) continue;

    for (const field of pageDef.fields) {
      await processField(field, data, page, pdfDoc, font, boldFont, mapping.defaults);
    }
  }

  return pdfDoc.save();
}
