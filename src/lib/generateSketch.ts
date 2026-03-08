/**
 * OTE-format Οριζοντογραφία sketch generator.
 * Draws a technical site plan using Canvas API, matching the OTE AS-BUILD template format:
 *   - Hatched building rectangle (right side)
 *   - BEP/BMO label box on building edge
 *   - Horizontal cable line from CAB (circle) to BEP with distance annotation
 *   - Building ID, CAB ID, conduit code, address labels
 *
 * Returns a PNG data-URL string.
 */

interface SketchInput {
  /** e.g. "b04" */
  conduit: string;
  /** CAB identifier e.g. "G526" */
  cabId: string;
  /** Distance from building (BEP) to distribution point (trench/σκάμα) in meters */
  trenchLengthM: number;
  /** Full address string */
  address: string;
  /** Building ID e.g. "667102934" */
  buildingId: string;
  /** BEP type label e.g. "BEP" */
  bepType?: string;
  /** BMO type label e.g. "BMO" */
  bmoType?: string;
}

export function generateOteSketch(input: SketchInput): string {
  const W = 900;
  const H = 700;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ── Background ──
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // ── Building rectangle (right half) ──
  const bldX = 420;
  const bldY = 120;
  const bldW = 380;
  const bldH = 400;

  // Hatched fill
  ctx.save();
  ctx.beginPath();
  ctx.rect(bldX, bldY, bldW, bldH);
  ctx.clip();

  ctx.strokeStyle = "#B0B0B0";
  ctx.lineWidth = 0.8;
  const step = 14;
  for (let i = -bldH; i < bldW + bldH; i += step) {
    ctx.beginPath();
    ctx.moveTo(bldX + i, bldY);
    ctx.lineTo(bldX + i - bldH, bldY + bldH);
    ctx.stroke();
  }
  ctx.restore();

  // Building border
  ctx.strokeStyle = "#666666";
  ctx.lineWidth = 2;
  ctx.strokeRect(bldX, bldY, bldW, bldH);

  // ── BEP / BMO box (on building left edge, vertically centered) ──
  const bepBoxW = 70;
  const bepBoxH = 56;
  const bepBoxX = bldX - bepBoxW / 2;
  const bepBoxY = bldY + bldH / 2 - bepBoxH / 2;

  // White background for the box
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(bepBoxX, bepBoxY, bepBoxW, bepBoxH);

  // BEP section (top half)
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.strokeRect(bepBoxX, bepBoxY, bepBoxW, bepBoxH / 2);
  ctx.fillStyle = "#CC0000";
  ctx.font = "bold 16px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("BEP", bepBoxX + bepBoxW / 2, bepBoxY + bepBoxH / 4);

  // BMO section (bottom half)
  ctx.strokeRect(bepBoxX, bepBoxY + bepBoxH / 2, bepBoxW, bepBoxH / 2);
  ctx.fillStyle = "#CC0000";
  ctx.fillText("BMO", bepBoxX + bepBoxW / 2, bepBoxY + (3 * bepBoxH) / 4);

  // ── Cable line from CAB circle to BEP box ──
  const cableY = bepBoxY + bepBoxH / 2;
  const cabCircleX = 80;
  const cabCircleR = 10;
  const cableStartX = cabCircleX + cabCircleR;
  const cableEndX = bepBoxX;

  // CAB circle
  ctx.beginPath();
  ctx.arc(cabCircleX, cableY, cabCircleR, 0, Math.PI * 2);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cable line
  ctx.beginPath();
  ctx.moveTo(cableStartX, cableY);
  ctx.lineTo(cableEndX, cableY);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.stroke();

  // ── Distance annotation above cable ──
  const distText = `${input.trenchLengthM}m`;
  const midCableX = (cableStartX + cableEndX) / 2;
  ctx.fillStyle = "#000000";
  ctx.font = "bold 18px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(distText, midCableX, cableY - 12);

  // ── Conduit / Building ID label (inside building, top-right area) ──
  const labelX = bldX + bldW / 2 + 40;
  const labelY = bldY + 50;

  ctx.fillStyle = "#000000";
  ctx.font = "bold 18px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(input.conduit.toUpperCase(), labelX, labelY);

  // CAB ID below conduit
  ctx.font = "bold 18px Arial, sans-serif";
  ctx.fillText(input.cabId, labelX, labelY + 30);

  // ── Address label ──
  ctx.font = "bold 15px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("ΔΙΕΥΘΥΝΣΗ:", labelX - 30, labelY + 80);
  
  // Split address into lines if long
  const addrParts = input.address.split(" ");
  let line1 = "";
  let line2 = "";
  for (const part of addrParts) {
    if (line1.length + part.length < 20) {
      line1 += (line1 ? " " : "") + part;
    } else {
      line2 += (line2 ? " " : "") + part;
    }
  }
  
  ctx.font = "bold 17px Arial, sans-serif";
  ctx.fillText(line1, labelX - 30, labelY + 105);
  if (line2) {
    ctx.fillText(line2, labelX - 30, labelY + 128);
  }

  return canvas.toDataURL("image/png");
}

/**
 * Generate sketch and return as ArrayBuffer for ExcelJS embedding.
 */
export function generateSketchBuffer(input: SketchInput): ArrayBuffer {
  const dataUrl = generateOteSketch(input);
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
