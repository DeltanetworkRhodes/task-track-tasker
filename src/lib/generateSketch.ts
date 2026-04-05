/**
 * OTE-format Οριζοντογραφία sketch generator.
 * Draws a professional technical site plan using Canvas API, matching OTE AS-BUILD template format:
 *   - Hatched building rectangle with building ID
 *   - BEP/BMO label box on building edge
 *   - Horizontal cable line from CAB (circle) to BEP with distance annotation
 *   - Road element between CAB and building
 *   - Vertical routing indicator (ΚΑΓΚΕΛΟ/ΕΣΚΑΛΗΤ)
 *   - Building ID, CAB ID, conduit code, address labels
 *
 * Returns a PNG data-URL string.
 */

interface SketchInput {
  conduit: string;
  cabId: string;
  trenchLengthM: number;
  distanceFromCabinet?: number;
  address: string;
  buildingId: string;
  bepType?: string;
  bmoType?: string;
  /** Vertical routing type e.g. "ΚΑΓΚΕΛΟ", "ΕΣΚΑΛΗΤ" */
  verticalRouting?: string;
  /** Number of floors */
  floors?: number;
  /** BEP floor */
  bepFloor?: string;
}

export function generateOteSketch(input: SketchInput): string {
  const W = 1000;
  const H = 750;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ── Colors ──
  const COL_BG = "#FFFFFF";
  const COL_BUILDING = "#E8E0D4";
  const COL_BUILDING_BORDER = "#4A4A4A";
  const COL_HATCH = "#C0B8A8";
  const COL_CABLE = "#1565C0";
  const COL_CABLE_UG = "#8D6E63";
  const COL_TEXT = "#212121";
  const COL_RED = "#C62828";
  const COL_GREEN = "#2E7D32";
  const COL_ROAD = "#E0E0E0";
  const COL_ROAD_BORDER = "#BDBDBD";
  const COL_LABEL_BG = "#FFFDE7";

  // ── Background ──
  ctx.fillStyle = COL_BG;
  ctx.fillRect(0, 0, W, H);

  // ── Road (vertical strip between CAB and building) ──
  const roadX = 160;
  const roadW = 60;
  ctx.fillStyle = COL_ROAD;
  ctx.fillRect(roadX, 40, roadW, H - 80);
  ctx.strokeStyle = COL_ROAD_BORDER;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  const roadCenterX = roadX + roadW / 2;
  ctx.beginPath();
  ctx.moveTo(roadCenterX, 50);
  ctx.lineTo(roadCenterX, H - 50);
  ctx.stroke();
  ctx.setLineDash([]);

  // Road label
  ctx.save();
  ctx.translate(roadCenterX, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#9E9E9E";
  ctx.font = "bold 11px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ΟΔΟΣ", 0, 0);
  ctx.restore();

  // ── Building rectangle ──
  const bldX = 440;
  const bldY = 100;
  const bldW = 420;
  const bldH = 440;

  // Building fill
  ctx.fillStyle = COL_BUILDING;
  ctx.fillRect(bldX, bldY, bldW, bldH);

  // Hatch pattern
  ctx.save();
  ctx.beginPath();
  ctx.rect(bldX, bldY, bldW, bldH);
  ctx.clip();
  ctx.strokeStyle = COL_HATCH;
  ctx.lineWidth = 0.6;
  const step = 16;
  for (let i = -bldH; i < bldW + bldH; i += step) {
    ctx.beginPath();
    ctx.moveTo(bldX + i, bldY);
    ctx.lineTo(bldX + i - bldH, bldY + bldH);
    ctx.stroke();
  }
  ctx.restore();

  // Building border (double line effect)
  ctx.strokeStyle = COL_BUILDING_BORDER;
  ctx.lineWidth = 3;
  ctx.strokeRect(bldX, bldY, bldW, bldH);
  ctx.lineWidth = 1;
  ctx.strokeRect(bldX + 4, bldY + 4, bldW - 8, bldH - 8);

  // ── Building ID (centered in building) ──
  ctx.fillStyle = COL_TEXT;
  ctx.font = "bold 15px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const bldCenterX = bldX + bldW / 2;
  const bldCenterY = bldY + 60;
  // Background for readability
  const bidText = input.buildingId || "—";
  const bidMetrics = ctx.measureText(bidText);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(bldCenterX - bidMetrics.width / 2 - 8, bldCenterY - 12, bidMetrics.width + 16, 24);
  ctx.fillStyle = COL_TEXT;
  ctx.fillText(bidText, bldCenterX, bldCenterY);

  // ── BEP / BMO box on building left edge ──
  const bepBoxW = 80;
  const bepBoxH = 64;
  const bepBoxX = bldX - bepBoxW / 2;
  const cableY = bldY + bldH / 2;
  const bepBoxY = cableY - bepBoxH / 2;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.fillRect(bepBoxX + 3, bepBoxY + 3, bepBoxW, bepBoxH);

  // BEP section (top half)
  ctx.fillStyle = COL_LABEL_BG;
  ctx.fillRect(bepBoxX, bepBoxY, bepBoxW, bepBoxH / 2);
  ctx.strokeStyle = COL_RED;
  ctx.lineWidth = 2;
  ctx.strokeRect(bepBoxX, bepBoxY, bepBoxW, bepBoxH / 2);
  ctx.fillStyle = COL_RED;
  ctx.font = "bold 16px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(input.bepType ? "BEP" : "BEP", bepBoxX + bepBoxW / 2, bepBoxY + bepBoxH / 4);

  // BMO section (bottom half)
  ctx.fillStyle = COL_LABEL_BG;
  ctx.fillRect(bepBoxX, bepBoxY + bepBoxH / 2, bepBoxW, bepBoxH / 2);
  ctx.strokeStyle = COL_GREEN;
  ctx.lineWidth = 2;
  ctx.strokeRect(bepBoxX, bepBoxY + bepBoxH / 2, bepBoxW, bepBoxH / 2);
  ctx.fillStyle = COL_GREEN;
  ctx.fillText("BMO", bepBoxX + bepBoxW / 2, bepBoxY + (3 * bepBoxH) / 4);

  // BEP floor label
  if (input.bepFloor) {
    ctx.fillStyle = COL_TEXT;
    ctx.font = "11px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Όρ. ${input.bepFloor}`, bepBoxX + bepBoxW / 2, bepBoxY - 8);
  }

  // ── Vertical routing indicator (right side of building) ──
  if (input.verticalRouting) {
    const vrX = bldX + bldW + 20;
    const vrTopY = bldY + 80;
    const vrBotY = bldY + bldH - 40;

    // Vertical line
    ctx.strokeStyle = COL_CABLE;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(vrX, vrTopY);
    ctx.lineTo(vrX, vrBotY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow heads
    ctx.fillStyle = COL_CABLE;
    ctx.beginPath();
    ctx.moveTo(vrX - 5, vrTopY + 10);
    ctx.lineTo(vrX, vrTopY);
    ctx.lineTo(vrX + 5, vrTopY + 10);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(vrX - 5, vrBotY - 10);
    ctx.lineTo(vrX, vrBotY);
    ctx.lineTo(vrX + 5, vrBotY - 10);
    ctx.fill();

    // Label
    ctx.save();
    ctx.translate(vrX + 14, (vrTopY + vrBotY) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = COL_CABLE;
    ctx.font = "bold 12px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(input.verticalRouting, 0, 0);
    ctx.restore();

    // Floor count
    if (input.floors) {
      ctx.fillStyle = COL_TEXT;
      ctx.font = "11px Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${input.floors} όροφοι`, vrX + 24, (vrTopY + vrBotY) / 2);
    }
  }

  // ── CAB circle ──
  const cabCircleX = 80;
  const cabCircleR = 18;
  const cableStartX = cabCircleX + cabCircleR;
  const cableEndX = bepBoxX;

  // CAB circle with fill
  ctx.beginPath();
  ctx.arc(cabCircleX, cableY, cabCircleR, 0, Math.PI * 2);
  ctx.fillStyle = "#E3F2FD";
  ctx.fill();
  ctx.strokeStyle = COL_CABLE;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // CAB label inside circle
  ctx.fillStyle = COL_CABLE;
  ctx.font = "bold 11px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CAB", cabCircleX, cableY);

  // CAB ID below circle
  ctx.fillStyle = COL_TEXT;
  ctx.font = "bold 14px Arial, sans-serif";
  ctx.fillText(input.cabId, cabCircleX, cableY + cabCircleR + 18);

  // ── Cable line: CAB → Road → BEP ──
  // Underground section (CAB to road)
  ctx.beginPath();
  ctx.moveTo(cableStartX, cableY);
  ctx.lineTo(roadX, cableY);
  ctx.strokeStyle = COL_CABLE_UG;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Underground section (road to BEP)
  ctx.beginPath();
  ctx.moveTo(roadX + roadW, cableY);
  ctx.lineTo(cableEndX, cableY);
  ctx.strokeStyle = COL_CABLE;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Conduit label on cable
  if (input.conduit) {
    const conduitX = (roadX + roadW + cableEndX) / 2;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    const condText = input.conduit.toUpperCase();
    const condMetrics = ctx.measureText(condText);
    ctx.fillRect(conduitX - condMetrics.width / 2 - 6, cableY - 22, condMetrics.width + 12, 18);
    ctx.fillStyle = COL_CABLE;
    ctx.font = "bold 13px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(condText, conduitX, cableY - 8);
  }

  // ── Distance annotation ──
  const cabToBepDistance = input.distanceFromCabinet || input.trenchLengthM;
  const distText = `ΥΠΟΓ. ΟΔΕΥΣΗ: ${cabToBepDistance}m`;
  const midCableX = (cableStartX + cableEndX) / 2;

  // Background pill for distance
  ctx.font = "bold 14px Arial, sans-serif";
  const distMetrics = ctx.measureText(distText);
  const pillW = distMetrics.width + 20;
  const pillH = 26;
  const pillX = midCableX - pillW / 2;
  const pillY = cableY - 50;

  ctx.fillStyle = "#FFF3E0";
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 4);
  ctx.fill();
  ctx.strokeStyle = "#FF9800";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#E65100";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(distText, midCableX, pillY + pillH / 2);

  // ── Address label (inside building, lower area) ──
  const addrLabelX = bldX + 30;
  const addrLabelY = bldY + bldH - 120;

  ctx.fillStyle = COL_TEXT;
  ctx.font = "bold 13px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("ΔΙΕΥΘΥΝΣΗ:", addrLabelX, addrLabelY);

  // Split address into lines
  const maxCharsPerLine = 28;
  const addrParts = input.address.split(" ");
  const addrLines: string[] = [""];
  for (const part of addrParts) {
    const lastLine = addrLines[addrLines.length - 1];
    if ((lastLine + " " + part).trim().length <= maxCharsPerLine) {
      addrLines[addrLines.length - 1] = (lastLine + " " + part).trim();
    } else {
      addrLines.push(part);
    }
  }

  ctx.font = "bold 15px Arial, sans-serif";
  addrLines.forEach((line, i) => {
    ctx.fillText(line, addrLabelX, addrLabelY + 22 + i * 22);
  });

  // ── Conduit + CAB ID box (inside building, upper-right) ──
  const infoBoxX = bldX + bldW - 160;
  const infoBoxY = bldY + 120;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(infoBoxX, infoBoxY, 140, 60);
  ctx.strokeStyle = "#BDBDBD";
  ctx.lineWidth = 1;
  ctx.strokeRect(infoBoxX, infoBoxY, 140, 60);

  ctx.fillStyle = COL_TEXT;
  ctx.font = "12px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Conduit:", infoBoxX + 8, infoBoxY + 18);
  ctx.fillText("CAB:", infoBoxX + 8, infoBoxY + 42);
  ctx.font = "bold 14px Arial, sans-serif";
  ctx.fillText(input.conduit.toUpperCase(), infoBoxX + 68, infoBoxY + 18);
  ctx.fillText(input.cabId, infoBoxX + 68, infoBoxY + 42);

  // ── Legend (bottom-left) ──
  const legY = H - 50;
  ctx.font = "10px Arial, sans-serif";
  ctx.fillStyle = "#9E9E9E";
  ctx.textAlign = "left";
  
  // Underground cable legend
  ctx.strokeStyle = COL_CABLE_UG;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.beginPath();
  ctx.moveTo(30, legY);
  ctx.lineTo(60, legY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText("Υπόγεια", 65, legY + 4);

  // Overhead cable legend
  ctx.strokeStyle = COL_CABLE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(130, legY);
  ctx.lineTo(160, legY);
  ctx.stroke();
  ctx.fillText("Οπτική ίνα", 165, legY + 4);

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
