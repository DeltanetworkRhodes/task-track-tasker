import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { generateSketchBuffer } from "@/lib/generateSketch";

/* ────────────────────────────────────────────
   Types
   ──────────────────────────────────────────── */

interface FloorBox {
  floor: string | number;
  fb_id: string;
  apartments: number;
  shops: number;
  fb_count: number;
  fb_type: string;
  fb_customer?: string;
  customer_space?: string;
  meters?: number;
  pipe_type?: string;
}

interface OpticalPathEntry {
  type: string;
  path: string;
  gis_id?: string;
}

interface ConstructionWork {
  type: string;
  description: string;
  quantity: number;
  floor?: string;
}

interface AsBuiltData {
  srId: string;
  buildingId: string;
  areaType: string;
  floors: number;
  customerFloor: string;
  bepFloor: string;
  adminSignature: boolean;
  bepOnly: boolean;
  bepTemplate: string;
  bepType: string;
  bmoType: string;
  nanotronix: boolean;
  smartReadiness: boolean;
  associatedBcp: string;
  nearbyBcp: string;
  newBcp: string;
  conduit: string;
  distanceFromCabinet: number;
  latitude: number;
  longitude: number;
  notes: string;
  warning: string;
  failure: string;
  address: string;
  floorDetails: FloorBox[];
  opticalPaths: OpticalPathEntry[];
  works: ConstructionWork[];
  sketchImageUrl: string | null;
  isNewInfrastructure: boolean;
  trenchLengthM: number;
  cabId: string;
}

/* ────────────────────────────────────────────
   Data Fetching from Supabase
   ──────────────────────────────────────────── */

async function fetchAsBuiltData(srId: string): Promise<AsBuiltData> {
  const { data: assignment, error: aErr } = await supabase
    .from("assignments")
    .select("*")
    .eq("sr_id", srId)
    .maybeSingle();
  if (aErr) throw new Error(`Assignment fetch error: ${aErr.message}`);
  if (!assignment) throw new Error(`Δεν βρέθηκε ανάθεση για SR: ${srId}`);

  const { data: gisData, error: gErr } = await supabase
    .from("gis_data")
    .select("*")
    .eq("assignment_id", assignment.id)
    .maybeSingle();
  if (gErr) throw new Error(`GIS data fetch error: ${gErr.message}`);

  const { data: construction } = await supabase
    .from("constructions")
    .select("*")
    .eq("assignment_id", assignment.id)
    .maybeSingle();

  let works: ConstructionWork[] = [];
  if (construction) {
    const { data: cWorks } = await supabase
      .from("construction_works")
      .select("*, work_pricing(*)")
      .eq("construction_id", construction.id);

    works = (cWorks || []).map((w: any) => ({
      type: w.work_pricing?.category || "Α",
      description: w.work_pricing?.description || "",
      quantity: w.quantity || 0,
      floor: "",
    }));
  }

  const { data: inspection } = await supabase
    .from("inspection_reports")
    .select("sketch_notes")
    .eq("assignment_id", assignment.id)
    .maybeSingle();

  const sketchUrl = inspection?.sketch_notes || null;

  const rawPaths = (gisData?.optical_paths as any[]) || [];
  const floorDetails = (gisData?.floor_details as any[]) || [];
  const gisWorks = (gisData?.gis_works as any[]) || [];

  const opticalPaths: OpticalPathEntry[] = rawPaths.map((p: any) => ({
    type: p.type || p["OPTICAL PATH TYPE"] || p.OPTICAL_PATH_TYPE || "BEP-BMO",
    path: p.path || p["OPTICAL PATH"] || p.OPTICAL_PATH || p.optical_path || "",
    gis_id: p.gis_id || p["GIS ID"] || "",
  }));

  const floorBoxes: FloorBox[] = floorDetails.map((fd: any) => ({
    floor: fd.floor ?? fd["ΟΡΟΦΟΣ"] ?? fd.ΟΡΟΦΟΣ ?? "",
    fb_id: fd.fb_id ?? fd.FB_ID ?? fd["GIS ID"] ?? "",
    apartments: Number(fd.apartments ?? fd["ΔΙΑΜΕΡΙΣΜΑΤΑ"] ?? fd.ΔΙΑΜΕΡΙΣΜΑΤΑ ?? 0),
    shops: Number(fd.shops ?? fd["ΚΑΤΑΣΤΗΜΑΤΑ"] ?? fd.ΚΑΤΑΣΤΗΜΑΤΑ ?? 0),
    fb_count: Number(fd.fb_count ?? fd.FB01 ?? fd["FB01"] ?? 0),
    fb_type: fd.fb_type ?? fd.FB01_TYPE ?? fd["FB01 TYPE"] ?? "",
    fb_customer: fd.fb_customer ?? fd["FB ΠΕΛΑΤΗ"] ?? fd.FB_ΠΕΛΑΤΗ ?? "",
    customer_space: fd.customer_space ?? fd["ΑΡΙΘΜΗΣΗ ΧΩΡΟΥ ΠΕΛΑΤΗ"] ?? fd.ΑΡΙΘΜΗΣΗ_ΧΩΡΟΥ_ΠΕΛΑΤΗ ?? "",
    meters: Number(fd.meters ?? fd["ΜΕΤΡΑ"] ?? fd.ΜΕΤΡΑ ?? 0),
    pipe_type: fd.pipe_type ?? fd["ΕΙΔΟΣ"] ?? fd.ΕΙΔΟΣ ?? "",
  }));

  const areaType = gisData?.area_type || "";
  const isNewInfrastructure =
    areaType.toUpperCase().includes("ΝΕΑ ΥΠΟΔΟΜΗ") ||
    gisWorks.some((w: any) => (w.value || "").toUpperCase().includes("ΝΕΑ ΥΠΟΔΟΜΗ"));

  const trenchLengthM = Number(
    gisWorks.find((w: any) => w.key === "trench_length_m")?.value ||
    gisData?.distance_from_cabinet || 0
  );

  if (works.length === 0 && gisWorks.length > 0) {
    works = gisWorks
      .filter((w: any) => w.description || w["ΕΡΓΑΣΙΑ"])
      .map((w: any) => ({
        type: w.type || w["ΤΥΠΟΣ ΕΡΓΑΣΙΑΣ"] || "Α",
        description: w.description || w["ΕΡΓΑΣΙΑ"] || "",
        quantity: Number(w.quantity || w["ΠΟΣΟΤΗΤΑ"]) || 0,
        floor: w.floor || w["ΟΡΟΦΟΣ"] || "",
      }));
  }

  return {
    srId: assignment.sr_id,
    buildingId: gisData?.building_id || "",
    areaType: gisData?.area_type || "",
    floors: gisData?.floors || 0,
    customerFloor: gisData?.customer_floor || "",
    bepFloor: gisData?.bep_floor || "",
    adminSignature: gisData?.admin_signature || false,
    bepOnly: gisData?.bep_only || false,
    bepTemplate: gisData?.bep_template || "",
    bepType: gisData?.bep_type || "",
    bmoType: gisData?.bmo_type || "",
    nanotronix: gisData?.nanotronix || false,
    smartReadiness: gisData?.smart_readiness || false,
    associatedBcp: gisData?.associated_bcp || "",
    nearbyBcp: gisData?.nearby_bcp || "",
    newBcp: gisData?.new_bcp || "",
    conduit: gisData?.conduit || "",
    distanceFromCabinet: Number(gisData?.distance_from_cabinet) || 0,
    latitude: Number(gisData?.latitude) || 0,
    longitude: Number(gisData?.longitude) || 0,
    notes: gisData?.notes || "",
    warning: gisData?.warning || "",
    failure: gisData?.failure || "",
    address: assignment.address || "",
    floorDetails: floorBoxes,
    opticalPaths,
    works,
    sketchImageUrl: sketchUrl,
    isNewInfrastructure,
    trenchLengthM,
    cabId: assignment.cab || construction?.cab || "",
  };
}

/* ────────────────────────────────────────────
   Image Fetching
   ──────────────────────────────────────────── */

async function fetchImageBuffer(urlOrPath: string): Promise<ArrayBuffer | null> {
  try {
    if (urlOrPath.startsWith("data:")) {
      const base64 = urlOrPath.split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }
    if (!urlOrPath.startsWith("http")) {
      const { data } = supabase.storage.from("surveys").getPublicUrl(urlOrPath);
      if (data?.publicUrl) {
        const resp = await fetch(data.publicUrl);
        if (resp.ok) return resp.arrayBuffer();
      }
      return null;
    }
    const resp = await fetch(urlOrPath);
    return resp.ok ? resp.arrayBuffer() : null;
  } catch {
    console.warn("Could not fetch image:", urlOrPath);
    return null;
  }
}

/* ────────────────────────────────────────────
   Utility: clear data rows (preserve row 1 header)
   ──────────────────────────────────────────── */

function clearDataRows(ws: ExcelJS.Worksheet, startRow: number, endRow: number, colCount: number) {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = 1; c <= colCount; c++) {
      ws.getCell(r, c).value = null;
    }
  }
}

/* ────────────────────────────────────────────
   Sheet 1: ΚΤΗΡΙΟ (row 2)
   ──────────────────────────────────────────── */

function fillKtirioSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  // Clear old row 2 data
  clearDataRows(ws, 2, 2, 23);
  const r = 2;
  const vals: (string | number | boolean)[] = [
    d.srId, d.buildingId, d.areaType, d.floors, d.customerFloor, d.bepFloor,
    d.adminSignature, d.bepOnly,
    d.bepTemplate, d.bepType, d.bmoType,
    d.nanotronix, d.smartReadiness,
    d.associatedBcp, d.nearbyBcp, d.newBcp, d.conduit,
    d.distanceFromCabinet, d.latitude, d.longitude, d.notes, d.warning, d.failure,
  ];
  vals.forEach((v, i) => { ws.getCell(r, i + 1).value = v as any; });
}

/* ────────────────────────────────────────────
   Sheet 2: ΟΡΟΦΟΙ (clear row 2+ then fill)
   ──────────────────────────────────────────── */

function fillOrofoiSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  // Clear rows 2-20 (max 18 floors)
  clearDataRows(ws, 2, 20, 14);
  d.floorDetails.forEach((fd, idx) => {
    const r = 2 + idx;
    ws.getCell(r, 1).value = fd.floor as any;     // ΟΡΟΦΟΣ
    ws.getCell(r, 2).value = fd.apartments;         // ΔΙΑΜΕΡΙΣΜΑΤΑ
    ws.getCell(r, 3).value = fd.shops;              // ΚΑΤΑΣΤΗΜΑΤΑ
    ws.getCell(r, 4).value = fd.fb_count;           // FB01
    ws.getCell(r, 5).value = fd.fb_type;            // FB01 TYPE
    ws.getCell(r, 12).value = fd.fb_customer || ""; // FB ΠΕΛΑΤΗ
    ws.getCell(r, 13).value = fd.customer_space || ""; // ΑΡΙΘΜΗΣΗ ΧΩΡΟΥ ΠΕΛΑΤΗ
  });
}
/* ────────────────────────────────────────────
   Helper: Derive BEP/BMO/BCP template header strings
   from GIS bepType/bmoType/newBcp fields
   ──────────────────────────────────────────── */

function extractSizeFromType(typeStr: string): string {
  // GIS stores e.g. "LARGE/28/RAYCAP", "MEDIUM/48/RAYCAP", "SMALL/4/ZTT"
  const upper = (typeStr || "").toUpperCase().trim();
  if (upper.startsWith("XLARGE") || upper.includes("/XLARGE")) return "XLARGE";
  if (upper.startsWith("LARGE") || upper.includes("/LARGE")) return "LARGE";
  if (upper.startsWith("MEDIUM") || upper.includes("/MEDIUM")) return "MEDIUM";
  if (upper.startsWith("SMALL") || upper.includes("/SMALL")) return "SMALL";
  // Fallback: try to find keyword anywhere
  if (upper.includes("XLARGE")) return "XLARGE";
  if (upper.includes("LARGE")) return "LARGE";
  if (upper.includes("MEDIUM")) return "MEDIUM";
  if (upper.includes("SMALL")) return "SMALL";
  return "";
}

function getBepHeader(bepType: string): string {
  const size = extractSizeFromType(bepType);
  const headers: Record<string, string> = {
    "XLARGE": "XLARGE BEP with 1 splitter ",
    "LARGE": "LARGE BEP with 1 splitter ",
    "MEDIUM": "Medium BEP with 1 splitter ",
    "SMALL": "SMALL BEP with 1 splitter ",
  };
  return headers[size] || `${size || "?"} BEP with 1 splitter `;
}

function getBmoHeader(bmoType: string): string {
  const size = extractSizeFromType(bmoType);
  const headers: Record<string, string> = {
    "XLARGE": "ΒΜΟ XLARGE BEP with 1 splitter ",
    "LARGE": "ΒΜΟ LARGE BEP with 1 splitter ",
    "MEDIUM": "ΒΜΟ MEDIUM BEP with 1 splitter ",
    "SMALL": "ΒΜΟ SMALL BEP with 1 splitter ",
  };
  return headers[size] || `ΒΜΟ ${size || "?"} BEP with 1 splitter `;
}

function getBcpHeader(newBcp: string): string {
  if (!newBcp || !newBcp.trim()) return "";
  // e.g. "SMALL/4/ZTT"
  const size = extractSizeFromType(newBcp);
  const brand = newBcp.split("/").pop() || "";
  return `${size || "?"} BCP with 1 splitter  ${brand}`.trim();
}

/* ────────────────────────────────────────────
   Sheet 3: OPTICAL PATHS (clear row 2+ then fill)
   ──────────────────────────────────────────── */

function fillOpticalPathsSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  // Clear rows 2-50
  clearDataRows(ws, 2, 50, 3);
  d.opticalPaths.forEach((op, idx) => {
    const r = 2 + idx;
    ws.getCell(r, 1).value = op.type;
    ws.getCell(r, 2).value = op.path;
    ws.getCell(r, 3).value = op.gis_id || "";
  });
}

/* ────────────────────────────────────────────
   Sheet 4: ΕΡΓΑΣΙΕΣ - Scan col B, match & update col C
   Template: A=ΤΥΠΟΣ ΕΡΓΑΣΙΑΣ, B=ΕΡΓΑΣΙΑ, C=ΠΟΣΟΤΗΤΑ, D=ΟΡΟΦΟΣ
   ──────────────────────────────────────────── */

function fillErgasiesSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  // Clear rows 2-30
  clearDataRows(ws, 2, 30, 4);
  d.works.forEach((w, idx) => {
    const r = 2 + idx;
    ws.getCell(r, 1).value = w.type;
    ws.getCell(r, 2).value = w.description;
    ws.getCell(r, 3).value = w.quantity;
    ws.getCell(r, 4).value = w.floor || "";
  });
}

/* ────────────────────────────────────────────
   Sheet 5: LABELS BEP
   Write BEP-BMO and BEP optical paths into col Y (25)
   so the template's formulas in hidden cols can compute labels.
   Also write computed label strings directly into visible cells.
   ──────────────────────────────────────────── */

/** Compute a BEP label string from a BEP-BMO optical path.
 *  E.g. "BEP01(b04)_SB01(1:8).01_05a_BMO01_01a" -> "SB01.01_FB(+00).1_01_BMO01_01a"
 */
function computeBepLabel(path: string, bmoFbMap: Map<string, string>): string {
  // Extract SB port: SB01(1:8).XX -> XX
  const sbMatch = path.match(/SB\d+\([\d:]+\)\.(\d+)/);
  const sbPort = sbMatch ? sbMatch[1] : "";

  // Extract BMO part: BMO01_XXa or BMO01_XX
  const bmoMatch = path.match(/(BMO\d+[_]\d+a?)/);
  const bmoId = bmoMatch ? bmoMatch[1] : "";

  // Find FB path via BMO→FB map
  const fbPath = bmoId ? (bmoFbMap.get(bmoId) || "") : "";

  if (sbPort && fbPath && bmoId) {
    return `SB01.${sbPort}_${fbPath}_${bmoId}`;
  }
  if (sbPort && bmoId) {
    return `SB01.${sbPort}_${bmoId}`;
  }
  if (sbPort) {
    return `SB01.${sbPort}_`;
  }
  return path;
}

function generateBepLabelString(path: string, bmoFbMap: Map<string, string>): string {
  return computeBepLabel(path, bmoFbMap);
}

function generateBmoLabelString(path: string): string {
  const fbMatch = path.match(/(FB\([^)]+\)\.\d+_\d+)/);
  return fbMatch ? fbMatch[1] : path;
}

function fillLabelsBepSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  // Write BEP type header to H2
  ws.getCell("H2").value = getBepHeader(d.bepType);

  // Structure from reference AS-BUILD:
  // Column A: ALL BEP paths (BEP-BMO first, then BEP-only, then "χωρίς ports", then CAB-BEP)
  // Column Y: BEP-BMO paths (raw data)
  // Columns AA-AG: Pre-computed values (overriding MID formulas which break on variable-length paths)
  //   AA = SB ID (e.g., "SB01"), AB = port (e.g., ".01_"), AC = BMO ID (e.g., "BMO01_01a")
  //   AD = FB path from BMO lookup, AF = sequential index, AG = final label
  // Visible B/D cols reference AG; I/J reference AG too

  const bepBmoPaths = d.opticalPaths.filter(op => op.type === "BEP-BMO");
  const bepOnlyPaths = d.opticalPaths.filter(op => op.type === "BEP" || op.type === "BCP-BEP");
  const cabBepPaths = d.opticalPaths.filter(op => op.type === "CAB-BEP" || op.type === "CAB-BCP");
  const allBepPaths = [...bepBmoPaths, ...bepOnlyPaths];

  // Build BMO→FB map for label generation
  const bmoFbMap = new Map<string, string>();
  d.opticalPaths.filter(op => op.type === "BMO-FB" || op.type === "BMO").forEach(op => {
    const bmoMatch = op.path.match(/(BMO\d+[_]\d+a?)/);
    const fbMatch = op.path.match(/(FB\([^)]+\)\.\d+_\d+)/);
    if (bmoMatch && fbMatch) bmoFbMap.set(bmoMatch[1], fbMatch[1]);
  });

  // Clear data columns A, Y, and ALL shared formula columns (shared formulas extend to row 96)
  for (let r = 1; r <= 96; r++) {
    ws.getCell(r, 25).value = r === 1 ? "OPTICAL PATH" : "";  // Y
    ws.getCell(r, 27).value = "";  // AA
    ws.getCell(r, 28).value = "";  // AB
    ws.getCell(r, 29).value = "";  // AC
    ws.getCell(r, 30).value = "";  // AD
    ws.getCell(r, 32).value = "";  // AF
    ws.getCell(r, 33).value = "";  // AG
  }
  for (let r = 2; r <= 20; r++) {
    ws.getCell(r, 1).value = null;   // A
  }

  // Column A: Write all BEP paths, then "χωρίς ports" padding, then CAB-BEP paths
  let aRow = 2;
  for (const op of allBepPaths) {
    ws.getCell(aRow, 1).value = op.path;
    aRow++;
  }
  // Pad with "χωρίς ports" for unused BEP slots (up to 12 total BEP)
  const bepSlots = 12;
  for (let i = allBepPaths.length; i < bepSlots; i++) {
    ws.getCell(aRow, 1).value = "χωρίς ports";
    aRow++;
  }
  // Write CAB-BEP paths after
  for (const op of cabBepPaths) {
    ws.getCell(aRow, 1).value = op.path;
    aRow++;
  }

  // Column Y: Write ALL BEP paths (BEP-BMO + BEP-only) for formula inputs
  for (let i = 0; i < 18; i++) {
    const r = 2 + i;
    ws.getCell(r, 25).value = i < allBepPaths.length ? allBepPaths[i].path : "";
  }

  // Columns AA-AG: Pre-compute values (replaces MID formulas that break on variable-length paths)
  for (let i = 0; i < allBepPaths.length && i < 18; i++) {
    const r = 2 + i;
    const p = allBepPaths[i].path;

    // AA = SB ID (e.g., "SB01")
    const sbIdMatch = p.match(/(SB\d+)/);
    const sbId = sbIdMatch ? sbIdMatch[1] : "";
    ws.getCell(r, 27).value = sbId;

    // AB = port number (e.g., ".01_")
    const portMatch = p.match(/SB\d+\([\d:]+\)\.(\d+)/);
    const port = portMatch ? `.${portMatch[1]}_` : "";
    ws.getCell(r, 28).value = port;

    // AC = BMO ID (e.g., "BMO01_01a")
    const bmoMatch = p.match(/(BMO\d+[_]\d+a?)/);
    const bmoId = bmoMatch ? bmoMatch[1] : "";
    ws.getCell(r, 29).value = bmoId;

    // AD = FB path from BMO→FB map lookup
    const fbPath = bmoId ? (bmoFbMap.get(bmoId) || "") : "";
    ws.getCell(r, 30).value = fbPath;

    // AF = sequential index
    ws.getCell(r, 32).value = i + 1;

    // AG = final label: "SB01.01_FB(+00).1_01_BMO01_01a"
    let label = "";
    if (sbId && port && fbPath && bmoId) {
      label = `${sbId}${port}${fbPath}_${bmoId}`;
    } else if (sbId && port && bmoId) {
      label = `${sbId}${port}${bmoId}`;
    } else if (sbId && port) {
      label = `${sbId}${port}`;
    } else {
      label = p;
    }
    ws.getCell(r, 33).value = label;
  }

  console.log(`✅ LABELS BEP: wrote ${allBepPaths.length} BEP paths to Y + pre-computed AA-AG, ${aRow - 2} total to A`);
}

function fillLabelsBmoSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  // Structure from reference AS-BUILD:
  // Column A: ALL BEP paths (same as LABELS BEP column A)
  // Column Y: BMO-FB paths (raw data)
  // Columns Z-AE: Pre-computed values (overriding MID formulas)
  //   Z = BMO ID (e.g., "BMO01_01a"), AA = FB path (e.g., "FB(+00).1_01")
  //   AD = sequential index, AE = final FB label (=AA basically)

  const bepBmoPaths = d.opticalPaths.filter(op => op.type === "BEP-BMO");
  const bepOnlyPaths = d.opticalPaths.filter(op => op.type === "BEP" || op.type === "BCP-BEP");
  const cabBepPaths = d.opticalPaths.filter(op => op.type === "CAB-BEP" || op.type === "CAB-BCP");
  const bmoFbPaths = d.opticalPaths.filter(op => op.type === "BMO-FB" || op.type === "BMO");
  const allBepPaths = [...bepBmoPaths, ...bepOnlyPaths];

  // Clear data columns A, Y, and ALL shared formula columns (shared formulas extend to row 96)
  for (let r = 1; r <= 96; r++) {
    ws.getCell(r, 25).value = r === 1 ? "OPTICAL PATH" : "";  // Y
    ws.getCell(r, 26).value = "";  // Z
    ws.getCell(r, 27).value = "";  // AA
    ws.getCell(r, 29).value = "";  // AC
    ws.getCell(r, 30).value = "";  // AD
    ws.getCell(r, 31).value = "";  // AE
  }
  for (let r = 2; r <= 40; r++) {
    ws.getCell(r, 1).value = null;   // A
  }

  // Column A: Write all BEP paths, then "χωρίς ports" padding, then CAB-BEP paths
  let aRow = 2;
  for (const op of allBepPaths) {
    ws.getCell(aRow, 1).value = op.path;
    aRow++;
  }
  const bepSlots = 12;
  for (let i = allBepPaths.length; i < bepSlots; i++) {
    ws.getCell(aRow, 1).value = "χωρίς ports";
    aRow++;
  }
  for (const op of cabBepPaths) {
    ws.getCell(aRow, 1).value = op.path;
    aRow++;
  }

  // Column Y: Write BMO-FB paths for formula inputs
  for (let i = 0; i < 36; i++) {
    const r = 2 + i;
    ws.getCell(r, 25).value = i < bmoFbPaths.length ? bmoFbPaths[i].path : "";
  }

  // Columns Z, AA, AD, AE: Pre-compute values (replaces MID formulas)
  for (let i = 0; i < 36; i++) {
    const r = 2 + i;
    if (i < bmoFbPaths.length) {
      const p = bmoFbPaths[i].path;
      // Z = BMO ID (e.g., "BMO01_1" or "BMO01_01a")
      const bmoMatch = p.match(/(BMO\d+[_]\d+a?)/);
      ws.getCell(r, 26).value = bmoMatch ? bmoMatch[1] : "";
      // AA = FB path (e.g., "FB(+00).1_01")
      const fbMatch = p.match(/(FB\([^)]+\)\.\d+_\d+)/);
      ws.getCell(r, 27).value = fbMatch ? fbMatch[1] : "";
      // AD = sequential index
      ws.getCell(r, 30).value = i + 1;
      // AE = final label = FB path (same as AA)
      ws.getCell(r, 31).value = fbMatch ? fbMatch[1] : "";
    } else {
      ws.getCell(r, 26).value = "";
      ws.getCell(r, 27).value = "";
      ws.getCell(r, 30).value = i + 1;
      ws.getCell(r, 31).value = "";
    }
  }

  console.log(`✅ LABELS BMO: wrote ${bmoFbPaths.length} BMO-FB paths to Y + pre-computed Z-AE, ${aRow - 2} total to A`);
}

/* ────────────────────────────────────────────
   Sheet 7: AS build-Επιμέτρηση
   Template cell mapping based on actual template analysis:
   - Row 4: B=Τύπος, E=SR, F=ΔΙΕΥΘΥΝΣΗ, R=ΑΚ
   - Row 5: E=SR value (formula =B8), F=Address
   - Row 8: B-R = ΚΤΗΡΙΟ data (COPY PASTE VALUES FROM TAB ΚΤΗΡΙΟ)
   - Row 13: D=FIRST BOX, E=ΤΥΠΟΣ ΚΟΙ, F=ΜΗΚΟΣ
   - Rows 25-39: ΟΡΟΦΟΙ data (COPY PASTE VALUES FROM TAB ΟΡΟΦΟΙ)
   - Row 22: B=ΟΡΟΦΟΣ ΤΟΠΟΘΕΤΗΣΗΣ ΒΕΡ
   - Rows 44-48: CAB-BEP optical paths (F=type, G=path)
   - Row 85: V=ΝΕΑ ΥΠΟΔΟΜΗ
   - Row 91: U=ΝΕΑ ΣΩΛΗΝΩΣΗ
   - BMO labels section rows 46-71 (U-X cols)
   ──────────────────────────────────────────── */

function fillEpimetrisiSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  // ── 0. ΣΤΟΙΧΕΙΑ ΑΙΤΗΜΑΤΟΣ ──
  ws.getCell("E5").value = d.srId;
  ws.getCell("F5").value = d.address;

  // ── 1. ΚΤΗΡΙΟ ── Row 8
  ws.getCell("B8").value = d.srId;
  ws.getCell("C8").value = d.buildingId;
  ws.getCell("D8").value = d.areaType;
  ws.getCell("E8").value = d.floors;
  ws.getCell("F8").value = d.customerFloor;
  ws.getCell("G8").value = d.bepFloor;
  ws.getCell("H8").value = d.adminSignature;
  ws.getCell("I8").value = d.bepOnly;
  ws.getCell("J8").value = d.bepTemplate;
  ws.getCell("K8").value = d.bepType;
  ws.getCell("L8").value = d.bmoType;
  ws.getCell("M8").value = d.nanotronix;
  ws.getCell("N8").value = d.smartReadiness;
  ws.getCell("O8").value = d.associatedBcp;
  ws.getCell("P8").value = d.nearbyBcp;
  ws.getCell("Q8").value = d.newBcp;
  ws.getCell("R8").value = d.conduit;

  // ── 2. KOI CAB first box ── Row 13
  ws.getCell("D13").value = "BEP";
  ws.getCell("E13").value = "4' μ cable";
  ws.getCell("F13").value = d.distanceFromCabinet;

  // ── 3. BEP position ──
  ws.getCell("B22").value = d.bepFloor;

  // ── 4. BEP-ΟΡΟΦΟΙ ── Rows 25-39 (clear first)
  for (let r = 25; r <= 39; r++) {
    for (let c = 2; c <= 17; c++) {
      ws.getCell(r, c).value = null;
    }
  }
  d.floorDetails.forEach((fd, idx) => {
    const r = 25 + idx;
    ws.getCell(r, 2).value = fd.floor as any;       // B = ΟΡΟΦΟΣ
    ws.getCell(r, 3).value = fd.apartments;          // C = ΔΙΑΜΕΡΙΣΜΑΤΑ
    ws.getCell(r, 4).value = fd.shops;               // D = ΚΑΤΑΣΤΗΜΑΤΑ
    ws.getCell(r, 5).value = fd.fb_count;            // E = FB01
    ws.getCell(r, 6).value = fd.fb_type;             // F = FB01 TYPE
    ws.getCell(r, 13).value = fd.fb_customer || "";  // M = FB ΠΕΛΑΤΗ
    ws.getCell(r, 14).value = fd.customer_space || "";// N = ΑΡΙΘΜΗΣΗ ΧΩΡΟΥ ΠΕΛΑΤΗ
    ws.getCell(r, 16).value = fd.meters || "";       // P = ΜΕΤΡΑ
    ws.getCell(r, 17).value = fd.pipe_type || "";    // Q = ΕΙΔΟΣ
  });

  // ══════════════════════════════════════════════════════════════
  // 5. CAB-BEP OPTICAL PATHS (rows 44-47, F=type, G=path)
  // ══════════════════════════════════════════════════════════════
  const cabBepPaths = d.opticalPaths.filter(op => op.type === "CAB-BEP" || op.type === "CAB-BCP");

  // Clear old CAB-BEP data (rows 44-47)
  for (let r = 44; r <= 47; r++) {
    ws.getCell(r, 6).value = null; // F
    ws.getCell(r, 7).value = null; // G
  }
  for (let i = 0; i < cabBepPaths.length && i < 4; i++) {
    const r = 44 + i;
    ws.getCell(r, 6).value = cabBepPaths[i].type;  // F = OPTICAL PATH TYPE
    ws.getCell(r, 7).value = cabBepPaths[i].path;  // G = OPTICAL PATH
  }
  console.log(`✅ CAB-BEP: wrote ${Math.min(cabBepPaths.length, 4)} paths to F44:G47`);

  // ══════════════════════════════════════════════════════════════
  // 5b. BCP CABLE INDICES (rows 53-58, F=index, G=cable_number, H=address)
  // Fill ONLY when BCP πραγματικά υπάρχει στα δεδομένα
  // ══════════════════════════════════════════════════════════════
  for (let r = 53; r <= 58; r++) {
    ws.getCell(r, 6).value = 0;  // F = index
    ws.getCell(r, 7).value = 0;  // G = cable number
    ws.getCell(r, 8).value = null; // H = address
  }
  const hasBcpMetadata = [d.associatedBcp, d.nearbyBcp, d.newBcp].some(v => (v || "").trim().length > 0);
  const hasBcpPaths = d.opticalPaths.some(op => (op.type || "").toUpperCase().includes("BCP") || /\bBCP\b/i.test(op.path || ""));
  const hasBcp = hasBcpMetadata || hasBcpPaths;
  const bcpCablePaths = d.opticalPaths.filter(
    op => (op.type || "").toUpperCase() === "CAB-BCP" || /\bBCP\b/i.test(op.path || "")
  );

  if (hasBcp) {
    for (let i = 0; i < bcpCablePaths.length && i < 6; i++) {
      const r = 53 + i;
      const cableNum = extractCableIndex(bcpCablePaths[i].path);
      ws.getCell(r, 6).value = i + 1;                                           // F = index
      ws.getCell(r, 7).value = /^\d+$/.test(cableNum) ? Number(cableNum) : cableNum; // G = cable number
      ws.getCell(r, 8).value = d.address;                                        // H = address
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 5c. BEP LABELS section (rows 61-70)
  // Reference: F61=header, F62=ΘΕΣΗ headers, F63-F64=cable positions,
  //            F65-F70=computed BEP labels (G=A side, I=B side)
  // ══════════════════════════════════════════════════════════════
  const bepBmoPaths = d.opticalPaths.filter(op => op.type === "BEP-BMO" || op.type === "BEP" || op.type === "BCP-BEP");

  // Build BMO→FB map for label generation
  const bmoFbMap = new Map<string, string>();
  d.opticalPaths.filter(op => op.type === "BMO-FB" || op.type === "BMO").forEach(op => {
    const bmoMatch = op.path.match(/(BMO\d+[_]\d+a?)/);
    const fbMatch = op.path.match(/(FB\([^)]+\)\.\d+_\d+)/);
    if (bmoMatch && fbMatch) bmoFbMap.set(bmoMatch[1], fbMatch[1]);
  });

  // Cable positions at rows 63-64 (from reference: F63=1,G63=1,H63=1,I63=2,J63="από καμπίνα")
  ws.getCell("F63").value = 1;
  ws.getCell("G63").value = 1;
  ws.getCell("H63").value = 1;
  ws.getCell("I63").value = 2;
  ws.getCell("J63").value = "από καμπίνα";
  ws.getCell("F64").value = 2;
  ws.getCell("G64").value = 3;
  ws.getCell("H64").value = 2;
  ws.getCell("I64").value = 4;

  // Clear old BEP labels (rows 65-70, cols F-J)
  for (let r = 65; r <= 70; r++) {
    ws.getCell(r, 6).value = null;  // F = position index
    ws.getCell(r, 7).value = null;  // G = label A
    ws.getCell(r, 8).value = null;  // H = position index
    ws.getCell(r, 9).value = null;  // I = label B
    ws.getCell(r, 10).value = null; // J = notes
  }

  // Write computed BEP labels paired: G=A side, I=B side
  // Also write position indices in F and H columns
  for (let i = 0; i < bepBmoPaths.length && i < 12; i++) {
    const rowIdx = Math.floor(i / 2);
    const r = 65 + rowIdx;
    const isB = i % 2 === 1;
    const label = computeBepLabel(bepBmoPaths[i].path, bmoFbMap);

    if (!isB) {
      ws.getCell(r, 6).value = rowIdx + 3;    // F = position (3,4,5,6,7,8)
      ws.getCell(r, 7).value = label;          // G = label A
      ws.getCell(r, 8).value = rowIdx + 3;     // H = same position
    } else {
      ws.getCell(r, 9).value = label;          // I = label B
    }
  }

  // Fill empty label slots with "-" and "χωρίς ports" notes
  const bepLabelCount = Math.min(bepBmoPaths.length, 12);
  for (let i = bepLabelCount; i < 12; i++) {
    const rowIdx = Math.floor(i / 2);
    const r = 65 + rowIdx;
    const isB = i % 2 === 1;
    if (!isB) {
      ws.getCell(r, 6).value = rowIdx + 3;
      ws.getCell(r, 7).value = "-";
      ws.getCell(r, 8).value = rowIdx + 3;
    } else {
      ws.getCell(r, 9).value = "-";
      // Add "χωρίς ports" note for empty B side slots
      if (i >= bepLabelCount) {
        ws.getCell(r, 10).value = "χωρίς ports";
      }
    }
  }
  console.log(`✅ BEP labels: wrote ${bepLabelCount} labels to G65:I70`);

  // ══════════════════════════════════════════════════════════════
  // 5d. BMO-FB section (rows 50-71, U=FB_A, W=FB_B)
  // ══════════════════════════════════════════════════════════════
  const bmoFbPaths = d.opticalPaths.filter(op => op.type === "BMO-FB" || op.type === "BMO");

  // Clear old BMO-FB data (rows 50-68, cols U-X = 21-24)
  for (let r = 50; r <= 68; r++) {
    ws.getCell(r, 21).value = 0;   // U
    ws.getCell(r, 23).value = 0;   // W
  }

  // Extract FB paths from BMO-FB paths and write them paired
  for (let i = 0; i < bmoFbPaths.length && i < 36; i++) {
    const pairIdx = Math.floor(i / 2);
    const r = 50 + pairIdx;
    const isB = i % 2 === 1;
    // Extract the FB part: "BMO01_1_FB(+00).1_01" -> "FB(+00).1_01"
    const fbMatch = bmoFbPaths[i].path.match(/(FB\([^)]+\)\.\d+_\d+)/);
    const fbLabel = fbMatch ? fbMatch[1] : bmoFbPaths[i].path;
    if (!isB) {
      ws.getCell(r, 21).value = fbLabel;  // U = FB path A
    } else {
      ws.getCell(r, 23).value = fbLabel;  // W = FB path B
    }
  }

  // Fill remaining with 0 or -
  const bmoWritten = Math.min(bmoFbPaths.length, 36);
  for (let i = bmoWritten; i < 36; i++) {
    const pairIdx = Math.floor(i / 2);
    const r = 50 + pairIdx;
    const isB = i % 2 === 1;
    if (r <= 68) {
      if (!isB) ws.getCell(r, 21).value = 0;
      else ws.getCell(r, 23).value = 0;
    }
  }
  console.log(`✅ BMO-FB: wrote ${bmoWritten} FB paths to U50:W68`);

  // ── 6. ΟΡΙΖΟΝΤΟΓΡΑΦΙΑ ──
  ws.getCell("V85").value = d.isNewInfrastructure ? "ΝΕΑ ΥΠΟΔΟΜΗ" : "";
  ws.getCell("V86").value = d.distanceFromCabinet || "";
  ws.getCell("V91").value = d.trenchLengthM || "";
}

/** Extract cable index from CAB-BEP path string.
 *  Handles both numeric (G526_249_BEP...) and alphanumeric (G137_B1.5_BEP...) formats.
 *  Also handles SGA paths: G137_SGA01(1:8).02_B1.5_BEP01(b24)_01_SB01(1:8) -> "B1.5"
 */
function extractCableIndex(path: string): string {
  // Find the segment(s) between CAB ID and "BEP" keyword
  const bepIdx = path.indexOf("BEP");
  if (bepIdx < 0) return "";
  const beforeBep = path.substring(0, bepIdx);
  const parts = beforeBep.split("_").filter(Boolean);
  // Skip the first part (CAB ID like G526) and SGA parts
  for (let i = parts.length - 1; i >= 1; i--) {
    const part = parts[i];
    if (part.startsWith("SGA") || part.startsWith("SGB")) continue;
    // Return the cable identifier (numeric or alphanumeric like B1.5)
    return part;
  }
  return "";
}

/* ────────────────────────────────────────────
   Preview / Debug Logger
   ──────────────────────────────────────────── */

function logPreview(d: AsBuiltData) {
  console.group("📊 AS-BUILD Preview");

  console.log("SR:", d.srId, "| Address:", d.address, "| Building:", d.buildingId);
  console.log("Floors:", d.floors, "| CAB:", d.cabId, "| Conduit:", d.conduit);

  // OPTICAL PATHS preview (first 2 of each type)
  const types = ["CAB-BEP", "CAB-BCP", "BCP-BEP", "BEP-BMO", "BEP", "BMO-FB"];
  console.group("🔗 OPTICAL PATHS (first 2 per type)");
  types.forEach(t => {
    const items = d.opticalPaths.filter(op => op.type === t).slice(0, 2);
    if (items.length) {
      console.log(`${t}:`, items.map(i => i.path));
    }
  });
  console.groupEnd();

  // LABELS preview
  const bmoFbMap = new Map<string, string>();
  d.opticalPaths.filter(op => op.type === "BMO-FB" || op.type === "BMO").forEach(op => {
    const bmoMatch = op.path.match(/(BMO\d+_\d+a)/);
    const fbMatch = op.path.match(/(FB\([^)]+\)\.\d+_\d+)/);
    if (bmoMatch && fbMatch) bmoFbMap.set(bmoMatch[1], fbMatch[1]);
  });

  console.group("🏷️ LABELS (first 2)");
  const bepPaths = d.opticalPaths.filter(op => op.type === "BEP-BMO" || op.type === "BEP" || op.type === "BCP-BEP").slice(0, 2);
  bepPaths.forEach((op, i) => {
    console.log(`BEP Label ${i + 1}:`, generateBepLabelString(op.path, bmoFbMap));
  });
  const bmoFbPaths = d.opticalPaths.filter(op => op.type === "BMO-FB" || op.type === "BMO").slice(0, 2);
  bmoFbPaths.forEach((op, i) => {
    console.log(`BMO Label ${i + 1}:`, generateBmoLabelString(op.path));
  });
  console.groupEnd();

  // ΕΡΓΑΣΙΕΣ preview
  console.group("🔧 ΕΡΓΑΣΙΕΣ");
  d.works.slice(0, 3).forEach(w => {
    console.log(`[${w.type}] ${w.description} x${w.quantity}`);
  });
  console.groupEnd();

  console.groupEnd();
}

/* ────────────────────────────────────────────
   Main AS-BUILD Generator
   ──────────────────────────────────────────── */

export interface AsBuiltResult {
  success: boolean;
  warnings: string[];
}

export function validateAsBuiltData(data: AsBuiltData): string[] {
  const warnings: string[] = [];
  if (!data.srId) warnings.push("Λείπει SR ID");
  if (!data.address) warnings.push("Λείπει διεύθυνση");
  if (!data.buildingId) warnings.push("Λείπει Building ID (ΧΕΜΔ)");
  if (data.floorDetails.length === 0) warnings.push("Δεν υπάρχουν δεδομένα ορόφων (Floor Details)");
  if (data.opticalPaths.length === 0) warnings.push("Δεν υπάρχουν Optical Paths");
  if (data.floors === 0) warnings.push("Αριθμός ορόφων είναι 0");
  if (!data.cabId) warnings.push("Λείπει CAB ID");
  return warnings;
}

export async function generateAsBuilt(srId: string): Promise<AsBuiltResult> {
  const data = await fetchAsBuiltData(srId);
  return generateAsBuiltFromData(data);
}

export async function preValidateAsBuilt(srId: string): Promise<string[]> {
  const data = await fetchAsBuiltData(srId);
  return validateAsBuiltData(data);
}

export async function generateAsBuiltFromData(data: AsBuiltData): Promise<AsBuiltResult> {
  const warnings: string[] = [...validateAsBuiltData(data)];

  // Log preview to console
  logPreview(data);

  // Load template
  const templateResp = await fetch("/templates/as_build_template.xlsx");
  if (!templateResp.ok) {
    throw new Error("Δεν βρέθηκε το AS-BUILD template. Ελέγξτε ότι υπάρχει στο /templates/as_build_template.xlsx");
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await templateResp.arrayBuffer());

  // Find sheets by name (with fallback to index)
  const ktirioSheet = workbook.getWorksheet("ΚΤΗΡΙΟ") || workbook.worksheets[0];
  const orofoiSheet = workbook.getWorksheet("ΟΡΟΦΟΙ") || workbook.worksheets[1];
  const optPathSheet = workbook.getWorksheet("OPTICAL PATHS") || workbook.worksheets[2];
  const ergasiesSheet = workbook.getWorksheet("ΕΡΓΑΣΙΕΣ") || workbook.worksheets[3];
  const labelsBmoSheet = workbook.getWorksheet("LABELS BMO") || workbook.worksheets[4];
  const labelsBepSheet = workbook.getWorksheet("LABELS BEP ") || workbook.worksheets[5]; // note trailing space
  const epimetrisiSheet = workbook.getWorksheet("AS build-Επιμέτρηση") || workbook.worksheets[6];

  // Fill data sheets
  if (ktirioSheet) fillKtirioSheet(ktirioSheet, data);
  if (orofoiSheet) fillOrofoiSheet(orofoiSheet, data);
  if (optPathSheet) fillOpticalPathsSheet(optPathSheet, data);
  if (ergasiesSheet) fillErgasiesSheet(ergasiesSheet, data);
  if (labelsBepSheet) fillLabelsBepSheet(labelsBepSheet, data);
  if (labelsBmoSheet) fillLabelsBmoSheet(labelsBmoSheet, data);

  // Fill main Επιμέτρηση sheet
  if (epimetrisiSheet) {
    fillEpimetrisiSheet(epimetrisiSheet, data);

    // Sketch image injection
    let sketchBuf: ArrayBuffer | null = null;

    if (data.sketchImageUrl) {
      sketchBuf = await fetchImageBuffer(data.sketchImageUrl);
      if (!sketchBuf) {
        warnings.push("Η εικόνα σκαριφήματος δεν μπόρεσε να φορτωθεί. Δημιουργία αυτόματου σκαριφήματος...");
      }
    }

    if (!sketchBuf) {
      try {
        sketchBuf = generateSketchBuffer({
          conduit: data.conduit || data.bepType || "",
          cabId: data.cabId || "",
          trenchLengthM: data.trenchLengthM || 0,
          address: data.address || "",
          buildingId: data.buildingId || "",
        });
      } catch (e) {
        console.warn("Auto-sketch generation failed:", e);
        warnings.push("Δεν ήταν δυνατή η αυτόματη δημιουργία σκαριφήματος.");
      }
    }

    if (sketchBuf) {
      const imgId = workbook.addImage({ buffer: sketchBuf, extension: "png" });
      // Place sketch image at B83:R100 (ΟΡΙΖΟΝΤΟΓΡΑΦΙΑ section)
      epimetrisiSheet.addImage(imgId, {
        tl: { col: 1, row: 82, nativeCol: 1, nativeRow: 82, nativeColOff: 0, nativeRowOff: 0 } as any,
        br: { col: 17, row: 101, nativeCol: 17, nativeRow: 101, nativeColOff: 0, nativeRowOff: 0 } as any,
        editAs: "twoCell",
      } as any);
    }
  }

  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `AS-BUILD_${data.srId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { success: true, warnings };
}

/* ────────────────────────────────────────────
   Mock / Demo Data
   ──────────────────────────────────────────── */

export function getMockAsBuiltData() {
  return getDemoAsBuiltData("2-334066371997");
}

interface DemoSRMap {
  [key: string]: AsBuiltData;
}

function generateDemoBepLabels(conduit: string, floorCount: number): OpticalPathEntry[] {
  const paths: OpticalPathEntry[] = [];
  const bmoIndexMap = [1, 2, 5, 7, 9, 10, 13, 15];
  
  for (let port = 1; port <= 12; port++) {
    const padPort = String(port).padStart(2, "0");
    const wireIdx = port + 4;
    if (port <= floorCount && port <= bmoIndexMap.length) {
      const bmoId = String(bmoIndexMap[port - 1]).padStart(2, "0");
      paths.push({
        type: "BEP-BMO",
        path: `BEP01(${conduit})_SB01(1:8).${padPort}_${wireIdx}a_BMO01_${bmoId}a`,
      });
    } else {
      paths.push({
        type: "BEP",
        path: `BEP01(${conduit})_SB01(1:8).${padPort}_${wireIdx}a`,
      });
    }
  }

  let bmoPortCounter = 1;
  for (let floor = 0; floor < floorCount; floor++) {
    const floorStr = `+${String(floor).padStart(2, "0")}`;
    for (let fb = 1; fb <= 2; fb++) {
      const bmoIdx = String(bmoPortCounter).padStart(2, "0");
      paths.push({
        type: "BMO-FB",
        path: `BMO01_${bmoIdx}a_FB(${floorStr}).1_${String(fb).padStart(2, "0")}`,
      });
      bmoPortCounter++;
    }
  }

  paths.push({ type: "CAB-BEP", path: `G479_SGB03(1:8).02_141_BEP01(${conduit})_01_SB01(1:8)` });
  paths.push({ type: "CAB-BEP", path: `G479_142_BEP01(${conduit})_02` });
  paths.push({ type: "CAB-BEP", path: `G479_143_BEP01(${conduit})_03` });

  return paths;
}

const DEMO_SR_DATA: DemoSRMap = {
  "SR-DEMO-01": {
    srId: "SR-DEMO-01", buildingId: "BLD-ROD-042", areaType: "OTE", floors: 3,
    customerFloor: "+02", bepFloor: "+00", adminSignature: false, bepOnly: false,
    bepTemplate: "BEP 1SP 1:8(01..12) ΚΔ", bepType: "MEDIUM/12/ZTT (01..12)",
    bmoType: "SMALL/16/RAYCAP", nanotronix: false, smartReadiness: false,
    associatedBcp: "", nearbyBcp: "", newBcp: "", conduit: "a15",
    distanceFromCabinet: 95, latitude: 36.4345, longitude: 28.2176,
    notes: "", warning: "", failure: "", address: "Λεωφ. Ελευθερίας 42",
    floorDetails: [
      { floor: "+00", apartments: 1, shops: 1, fb_count: 1, fb_type: "FB 4 PORTS", fb_id: "FB(+00).1", meters: 8, pipe_type: '4"' },
      { floor: "+01", apartments: 2, shops: 0, fb_count: 1, fb_type: "FB 4 PORTS", fb_id: "FB(+01).1", meters: 15, pipe_type: '2"' },
      { floor: "+02", apartments: 1, shops: 0, fb_count: 1, fb_type: "FB 4 PORTS", fb_id: "FB(+02).1", fb_customer: "FB(+02).1", customer_space: "Α1", meters: 20, pipe_type: '2"' },
    ],
    opticalPaths: generateDemoBepLabels("a15", 3),
    works: [
      { type: "Α", description: "Τοποθέτηση ενός Floor Box ανά Όροφο", quantity: 3 },
      { type: "Α", description: "Υλοποίηση Υποδομής Εισαγωγής", quantity: 1, floor: "+00" },
    ],
    sketchImageUrl: null, isNewInfrastructure: false, trenchLengthM: 0, cabId: "CAB-045",
  },
  "SR-DEMO-02": {
    srId: "SR-DEMO-02", buildingId: "BLD-IAL-015", areaType: "OTE", floors: 5,
    customerFloor: "+03", bepFloor: "+00", adminSignature: true, bepOnly: false,
    bepTemplate: "BEP 1SP 1:8(01..12) ΚΔ", bepType: "MEDIUM/12/ZTT (01..12)",
    bmoType: "SMALL/16/RAYCAP", nanotronix: false, smartReadiness: true,
    associatedBcp: "", nearbyBcp: "", newBcp: "", conduit: "b04",
    distanceFromCabinet: 320, latitude: 36.4112, longitude: 28.1543,
    notes: "", warning: "", failure: "", address: "Οδός Ηρώων 15",
    floorDetails: [
      { floor: "+00", apartments: 0, shops: 2, fb_count: 2, fb_type: "FB 4 PORTS", fb_id: "FB(+00).1", meters: 10, pipe_type: '4"' },
      { floor: "+01", apartments: 2, shops: 0, fb_count: 1, fb_type: "FB 4 PORTS", fb_id: "FB(+01).1", meters: 18, pipe_type: '2"' },
      { floor: "+02", apartments: 2, shops: 0, fb_count: 1, fb_type: "FB 4 PORTS", fb_id: "FB(+02).1", meters: 22, pipe_type: '2"' },
      { floor: "+03", apartments: 2, shops: 0, fb_count: 1, fb_type: "FB 4 PORTS", fb_id: "FB(+03).1", fb_customer: "FB(+03).1", customer_space: "Β2", meters: 26, pipe_type: '2"' },
      { floor: "+04", apartments: 1, shops: 0, fb_count: 1, fb_type: "FB 4 PORTS", fb_id: "FB(+04).1", meters: 30, pipe_type: '2"' },
    ],
    opticalPaths: generateDemoBepLabels("b04", 5),
    works: [
      { type: "Α", description: "Εγκατάσταση BEP", quantity: 1, floor: "+00" },
      { type: "Α", description: "Τοποθέτηση ενός Floor Box ανά Όροφο", quantity: 5 },
      { type: "Β", description: "Πόρτα-πόρτα", quantity: 8 },
    ],
    sketchImageUrl: null, isNewInfrastructure: true, trenchLengthM: 45, cabId: "CAB-112",
  },
  "SR-DEMO-03": {
    srId: "SR-DEMO-03", buildingId: "BLD-FAL-008", areaType: "OTE", floors: 4,
    customerFloor: "+01", bepFloor: "+00", adminSignature: true, bepOnly: false,
    bepTemplate: "BEP 1SP 1:8(01..12) ΚΔ", bepType: "MEDIUM/12/ZTT (01..12)",
    bmoType: "SMALL/16/RAYCAP", nanotronix: false, smartReadiness: false,
    associatedBcp: "", nearbyBcp: "", newBcp: "", conduit: "c12",
    distanceFromCabinet: 180, latitude: 36.3876, longitude: 28.2098,
    notes: "", warning: "", failure: "", address: "Πλατεία Αγίας Παρασκευής 8",
    floorDetails: [
      { floor: "+00", apartments: 1, shops: 0, fb_count: 1, fb_type: "FB 4 PORTS", fb_id: "FB(+00).1", meters: 6, pipe_type: '4"' },
      { floor: "+01", apartments: 2, shops: 0, fb_count: 1, fb_type: "FB 4 PORTS", fb_id: "FB(+01).1", fb_customer: "FB(+01).1", customer_space: "Α1", meters: 14, pipe_type: '2"' },
      { floor: "+02", apartments: 2, shops: 0, fb_count: 1, fb_type: "FB 4 PORTS", fb_id: "FB(+02).1", meters: 18, pipe_type: '2"' },
      { floor: "+03", apartments: 1, shops: 0, fb_count: 1, fb_type: "FB 4 PORTS", fb_id: "FB(+03).1", meters: 22, pipe_type: '2"' },
    ],
    opticalPaths: generateDemoBepLabels("c12", 4),
    works: [
      { type: "Α", description: "Εγκατάσταση BEP", quantity: 1, floor: "+00" },
      { type: "Α", description: "Τοποθέτηση ενός Floor Box ανά Όροφο", quantity: 4 },
      { type: "Β", description: "Πόρτα-πόρτα", quantity: 6 },
    ],
    sketchImageUrl: null, isNewInfrastructure: false, trenchLengthM: 0, cabId: "CAB-089",
  },
  "2-334066371997": {
    srId: "2-334066371997", buildingId: "667102934", areaType: "OTE", floors: 4,
    customerFloor: "+01", bepFloor: "+00", adminSignature: true, bepOnly: false,
    bepTemplate: "BEP 1SP 1:8(01..12) ΚΔ", bepType: "MEDIUM/12/ZTT (01..12)",
    bmoType: "SMALL/16/RAYCAP", nanotronix: false, smartReadiness: true,
    associatedBcp: "", nearbyBcp: "", newBcp: "", conduit: "b04",
    distanceFromCabinet: 134, latitude: 37939475, longitude: 23743480,
    notes: "", warning: "", failure: "", address: "ΑΓΙΟΥ ΚΩΝΣΤΑΝΤΙΝΟΥ 58",
    floorDetails: [
      { floor: "+00", apartments: 1, shops: 1, fb_count: 2, fb_type: "FB 4 PORTS", fb_id: "FB(+00).1", customer_space: "", meters: 10, pipe_type: '4"' },
      { floor: "+01", apartments: 1, shops: 0, fb_count: 1, fb_type: "FB 4 PORTS", fb_id: "FB(+01).1", fb_customer: "FB(+01).1", customer_space: "Α1", meters: 23, pipe_type: '2"' },
      { floor: "+02", apartments: 1, shops: 0, fb_count: 1, fb_type: "FB 4 PORTS", fb_id: "FB(+02).1", customer_space: "", meters: 25, pipe_type: '2"' },
      { floor: "+03", apartments: 1, shops: 0, fb_count: 1, fb_type: "FB 4 PORTS", fb_id: "FB(+03).1", customer_space: "", meters: 28, pipe_type: '2"' },
    ],
    opticalPaths: [
      { type: "BEP-BMO", path: "BEP01(b04)_SB01(1:8).01_05a_BMO01_01a" },
      { type: "BEP-BMO", path: "BEP01(b04)_SB01(1:8).02_06a_BMO01_02a" },
      { type: "BEP-BMO", path: "BEP01(b04)_SB01(1:8).03_07a_BMO01_05a" },
      { type: "BEP-BMO", path: "BEP01(b04)_SB01(1:8).04_08a_BMO01_07a" },
      { type: "BEP-BMO", path: "BEP01(b04)_SB01(1:8).05_09a_BMO01_09a" },
      { type: "BEP", path: "BEP01(b04)_SB01(1:8).06_10a" },
      { type: "BEP", path: "BEP01(b04)_SB01(1:8).07_11a" },
      { type: "BEP", path: "BEP01(b04)_SB01(1:8).08_12a" },
      { type: "BMO-FB", path: "BMO01_01a_FB(+00).1_01" },
      { type: "BMO-FB", path: "BMO01_02a_FB(+00).1_02" },
      { type: "BMO-FB", path: "BMO01_03a_FB(+00).1_03" },
      { type: "BMO-FB", path: "BMO01_04a_FB(+00).1_04" },
      { type: "BMO-FB", path: "BMO01_05a_FB(+01).1_01" },
      { type: "BMO-FB", path: "BMO01_06a_FB(+01).1_02" },
      { type: "BMO-FB", path: "BMO01_07a_FB(+02).1_01" },
      { type: "BMO-FB", path: "BMO01_08a_FB(+02).1_02" },
      { type: "BMO-FB", path: "BMO01_09a_FB(+03).1_01" },
      { type: "BMO-FB", path: "BMO01_10a_FB(+03).1_02" },
      { type: "CAB-BEP", path: "G526_250_BEP01(b04)_02" },
      { type: "CAB-BEP", path: "G526_251_BEP01(b04)_03" },
      { type: "CAB-BEP", path: "G526_252_BEP01(b04)_04" },
      { type: "CAB-BEP", path: "G526_SGA04(1:8).01_249_BEP01(b04)_01_SB01(1:8)" },
    ],
    works: [
      { type: "Α", description: "Τοποθέτηση ενός Floor Box ανά Όροφο", quantity: 4, floor: "" },
      { type: "Α", description: "Υλοποίηση Υποδομής Εισαγωγής και Τοποθέτηση Κεντρικού Κατανεμητή", quantity: 1, floor: "+00" },
      { type: "Β", description: "Διασύνδεση των μετρητών κατανάλωσης ρεύματος", quantity: 1, floor: "+00" },
    ],
    sketchImageUrl: null, isNewInfrastructure: true, trenchLengthM: 156, cabId: "G526",
  },
};

export function getDemoAsBuiltData(srId: string) {
  const data = DEMO_SR_DATA[srId];
  if (data) return { ...data };
  const fallback = { ...DEMO_SR_DATA["2-334066371997"] };
  fallback.srId = srId;
  return fallback;
}
