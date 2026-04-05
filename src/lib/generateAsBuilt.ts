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
  fb02_count?: number;
  fb02_type?: string;
  fb03_count?: number;
  fb03_type?: string;
  fb04_count?: number;
  fb04_type?: string;
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
  // BCP-BEP connection data
  bcpPlacement: string;    // ΣΗΜΕΙΟ ΤΟΠΟΘΕΤΗΣΗΣ (e.g. "BCP ΕΠΙ ΤΟΥ ΚΤΙΡΙΟΥ")
  bcpKind: string;         // ΕΙΔΟΣ (e.g. "BCP ΝΕΟ")
  bcpBepCableType: string; // ΤΥΠΟΣ ΚΟΙ ΣΥΝΔΕΣΗ BCP ΜΕ BEP (e.g. "4 FO G652D")
  bcpBepLength: number;    // ΜΗΚΟΣ BCP-BEP
  // ΟΡΙΖΟΝΤΟΓΡΑΦΙΑ extra fields
  verticalRouting: string; // Είδος κάθετης υποδομής (ΚΑΓΚΕΛΟ, ΚΛΙΜΑΚΟΣΤΑΣΙΟ, etc.)
  escalitType: string;     // ΕΣΚΑΛΗΤ type
  bcpType: string;         // BCP ΕΙΔΟΣ for ΟΡΙΖΟΝΤΟΓΡΑΦΙΑ
  totalCableLength: number; // Total cable length (underground + vertical) for F13
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

  const floorBoxes: FloorBox[] = floorDetails.map((fd: any) => {
    const fb01 = Number(fd.fb_count ?? fd.FB01 ?? fd["FB01"] ?? 0);
    const fb02 = Number(fd.FB02 ?? fd["FB02"] ?? 0);
    const fb03 = Number(fd.FB03 ?? fd["FB03"] ?? 0);
    const fb04 = Number(fd.FB04 ?? fd["FB04"] ?? 0);
    const totalFb = fb01 + fb02 + fb03 + fb04;
    const fbType = fd.fb_type ?? fd.FB01_TYPE ?? fd["FB01 TYPE"] ?? "";
    const fb02Type = fd.FB02_TYPE ?? fd["FB02 TYPE"] ?? "";
    const fb03Type = fd.FB03_TYPE ?? fd["FB03 TYPE"] ?? "";
    const fb04Type = fd.FB04_TYPE ?? fd["FB04 TYPE"] ?? "";
    return {
      floor: fd.floor ?? fd["ΟΡΟΦΟΣ"] ?? fd.ΟΡΟΦΟΣ ?? "",
      fb_id: fd.fb_id ?? fd.FB_ID ?? fd["GIS ID"] ?? "",
      apartments: Number(fd.apartments ?? fd["ΔΙΑΜΕΡΙΣΜΑΤΑ"] ?? fd.ΔΙΑΜΕΡΙΣΜΑΤΑ ?? 0),
      shops: Number(fd.shops ?? fd["ΚΑΤΑΣΤΗΜΑΤΑ"] ?? fd.ΚΑΤΑΣΤΗΜΑΤΑ ?? 0),
      fb_count: totalFb || fb01,
      fb_type: fbType || fb02Type || fb03Type || fb04Type,
      fb02_count: fb02 || undefined,
      fb02_type: fb02Type || undefined,
      fb03_count: fb03 || undefined,
      fb03_type: fb03Type || undefined,
      fb04_count: fb04 || undefined,
      fb04_type: fb04Type || undefined,
      fb_customer: fd.fb_customer ?? fd["FB ΠΕΛΑΤΗ"] ?? fd.FB_ΠΕΛΑΤΗ ?? "",
      customer_space: fd.customer_space ?? fd["ΑΡΙΘΜΗΣΗ ΧΩΡΟΥ ΠΕΛΑΤΗ"] ?? fd.ΑΡΙΘΜΗΣΗ_ΧΩΡΟΥ_ΠΕΛΑΤΗ ?? "",
      meters: Number(fd.meters ?? fd["ΜΕΤΡΑ"] ?? fd.ΜΕΤΡΑ ?? 0),
      pipe_type: fd.pipe_type ?? fd["ΕΙΔΟΣ"] ?? fd.ΕΙΔΟΣ ?? "",
    };
  });

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

  // Extract BCP-BEP connection data from GIS
  const rawData = (gisData?.raw_data as any) || {};
  const bcpPlacement = rawData.bcp_placement || rawData["ΣΗΜΕΙΟ ΤΟΠΟΘΕΤΗΣΗΣ"] || "";
  const bcpKind = rawData.bcp_kind || rawData["ΕΙΔΟΣ"] || "";
  const bcpBepCableType = rawData.bcp_bep_cable_type || rawData["ΤΥΠΟΣ ΚΟΙ ΣΥΝΔΕΣΗ ΒCP ΜΕ BEP"] || "";
  const bcpBepLength = Number(rawData.bcp_bep_length || rawData["ΜΗΚΟΣ BCP-BEP"] || 0);
  const verticalRouting = rawData.vertical_routing || rawData["Είδος κάθετης υποδομής"] || "";
  const escalitType = rawData.escalit_type || rawData["ΕΣΚΑΛΗΤ"] || "";
  const bcpTypeOriz = rawData.bcp_type_oriz || rawData["BCP ΕΙΔΟΣ"] || "";

  // Total cable length = underground distance + sum of floor meters (vertical)
  const verticalMeters = floorBoxes.reduce((sum, fb) => sum + (fb.meters || 0), 0);
  const totalCableLength = Number(gisData?.distance_from_cabinet || 0) + verticalMeters;

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
    bcpPlacement,
    bcpKind,
    bcpBepCableType,
    bcpBepLength,
    verticalRouting,
    escalitType,
    bcpType: bcpTypeOriz,
    totalCableLength,
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
    ws.getCell(r, 1).value = fd.floor as any;     // A = ΟΡΟΦΟΣ
    ws.getCell(r, 2).value = fd.apartments;         // B = ΔΙΑΜΕΡΙΣΜΑΤΑ
    ws.getCell(r, 3).value = fd.shops;              // C = ΚΑΤΑΣΤΗΜΑΤΑ
    ws.getCell(r, 4).value = fd.fb_count;           // D = FB01
    ws.getCell(r, 5).value = fd.fb_type;            // E = FB01 TYPE
    ws.getCell(r, 12).value = fd.fb_customer || ""; // L = FB ΠΕΛΑΤΗ
    ws.getCell(r, 13).value = fd.customer_space || ""; // M = ΑΡΙΘΜΗΣΗ ΧΩΡΟΥ ΠΕΛΑΤΗ
    ws.getCell(r, 14).value = fd.fb_id || "";       // N = GIS ID
  });
}
/* ────────────────────────────────────────────
   Helper: Derive BEP/BMO/BCP template header strings
   from GIS bepType/bmoType/newBcp fields
   ──────────────────────────────────────────── */

function extractSizeFromType(typeStr: string): string {
  const upper = (typeStr || "").toUpperCase().trim();
  if (upper.startsWith("XLARGE") || upper.includes("/XLARGE")) return "XLARGE";
  if (upper.startsWith("LARGE") || upper.includes("/LARGE")) return "LARGE";
  if (upper.startsWith("MEDIUM") || upper.includes("/MEDIUM")) return "MEDIUM";
  if (upper.startsWith("SMALL") || upper.includes("/SMALL")) return "SMALL";
  if (upper.includes("XLARGE")) return "XLARGE";
  if (upper.includes("LARGE")) return "LARGE";
  if (upper.includes("MEDIUM")) return "MEDIUM";
  if (upper.includes("SMALL")) return "SMALL";
  return "";
}

function extractBrandFromType(typeStr: string): string {
  // "LARGE/28/RAYCAP" → "RAYCAP", "SMALL/4/ZTT" → "ZTT"
  const parts = (typeStr || "").split("/");
  if (parts.length >= 3) return parts[parts.length - 1].trim().split(" ")[0];
  if (parts.length === 2) return parts[1].trim().split(" ")[0];
  return "";
}

function getBepHeader(bepType: string): string {
  if (!bepType || !bepType.trim()) return "";
  const size = extractSizeFromType(bepType);
  const brand = extractBrandFromType(bepType);
  if (!size && !brand) return bepType; // return raw if can't parse
  return `${size || "?"} BEP with 1 splitter  ${brand}`.trim();
}

function getBmoHeader(bmoType: string): string {
  if (!bmoType || !bmoType.trim()) return "";
  const size = extractSizeFromType(bmoType);
  const brand = extractBrandFromType(bmoType);
  if (!size && !brand) return bmoType;
  return `ΒΜΟ ${size || "?"} with 1 splitter  ${brand}`.trim();
}

function getBcpHeader(newBcp: string): string {
  if (!newBcp || !newBcp.trim()) return "";
  const size = extractSizeFromType(newBcp);
  const brand = extractBrandFromType(newBcp);
  if (!size && !brand) return newBcp;
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
 *  Also handles paths without trailing 'a': "BEP01_SB01(1:8).01_03a_BMO01_1" -> "SB01.01_FB(+01).1_01_BMO01_1"
 */
function computeBepLabel(path: string, bmoFbMap: Map<string, string>): string {
  // Extract SB ID and port: SB01(1:8).XX or SB02(1:8).XX
  const sbMatch = path.match(/(SB\d+)\([\d:]+\)\.(\d+)/);
  const sbId = sbMatch ? sbMatch[1] : "SB01";
  const sbPort = sbMatch ? sbMatch[2] : "";

  // Extract BMO part: BMO01_XXa or BMO01_XX (with or without trailing 'a')
  const bmoMatch = path.match(/(BMO\d+_\d+a?)/);
  const bmoId = bmoMatch ? bmoMatch[1] : "";

  // Find FB path via BMO→FB map
  const fbPath = bmoId ? (bmoFbMap.get(bmoId) || "") : "";

  if (sbPort && fbPath && bmoId) {
    return `${sbId}.${sbPort}_${fbPath}_${bmoId}`;
  }
  if (sbPort && bmoId) {
    return `${sbId}.${sbPort}_${bmoId}`;
  }
  if (sbPort) {
    return `${sbId}.${sbPort}__`;
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
  // Template has formulas in visible cells (B7=AG2, D7=AG3, I6=AG2, Q6=$AG$2 etc.)
  // We only need to fill data columns Y and AA-AG. DO NOT overwrite column A (visible layout).

  // Update A3 with actual BEP header for this SR
  ws.getCell("A3").value = getBepHeader(d.bepType);
  // Update BCP header at A21 if BCP exists
  if (d.newBcp) {
    ws.getCell("A21").value = getBcpHeader(d.newBcp);
  }
  // Update H31 (SMALL BCP with splitter detail) if BCP exists
  if (d.newBcp) {
    ws.getCell("H31").value = getBcpHeader(d.newBcp);
  }

  const bepBmoPaths = d.opticalPaths.filter(op => op.type === "BEP-BMO");
  const bepOnlyPaths = d.opticalPaths.filter(op => op.type === "BEP" || op.type === "BCP-BEP");
  const allBepPaths = [...bepBmoPaths, ...bepOnlyPaths];

  // Build BMO→FB map for label generation
  const bmoFbMap = new Map<string, string>();
  d.opticalPaths.filter(op => op.type === "BMO-FB" || op.type === "BMO").forEach(op => {
    const bmoMatch = op.path.match(/(BMO\d+[_]\d+a?)/);
    const fbMatch = op.path.match(/(FB\([^)]+\)\.\d+_\d+)/);
    if (bmoMatch && fbMatch) bmoFbMap.set(bmoMatch[1], fbMatch[1]);
  });

  // Clear data columns Y, AA-AG (rows 2-96) — preserve row 1 headers
  for (let r = 2; r <= 96; r++) {
    ws.getCell(r, 25).value = "";   // Y
    ws.getCell(r, 27).value = "";   // AA
    ws.getCell(r, 28).value = "";   // AB
    ws.getCell(r, 29).value = "";   // AC
    ws.getCell(r, 30).value = "";   // AD
    ws.getCell(r, 32).value = "";   // AF
    ws.getCell(r, 33).value = "";   // AG
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

    const sbIdMatch = p.match(/(SB\d+)/);
    const sbId = sbIdMatch ? sbIdMatch[1] : "";
    ws.getCell(r, 27).value = sbId;                     // AA

    const portMatch = p.match(/SB\d+\([\d:]+\)\.(\d+)/);
    const port = portMatch ? `.${portMatch[1]}_` : "";
    ws.getCell(r, 28).value = port;                     // AB

    const bmoMatch = p.match(/(BMO\d+[_]\d+a?)/);
    const bmoId = bmoMatch ? bmoMatch[1] : "";
    ws.getCell(r, 29).value = bmoId;                    // AC

    const fbPath = bmoId ? (bmoFbMap.get(bmoId) || "") : "";
    ws.getCell(r, 30).value = fbPath;                   // AD

    ws.getCell(r, 32).value = i + 1;                    // AF

    // AG = final label
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
    ws.getCell(r, 33).value = label;                    // AG
  }

  // For unused paths beyond data, set AG to "_" (matches template pattern for empty formula refs)
  for (let i = allBepPaths.length; i < 37; i++) {
    const r = 2 + i;
    ws.getCell(r, 32).value = i + 1;                    // AF = sequential index
    ws.getCell(r, 33).value = "_";                       // AG = empty marker
  }

  // Update visible BEP labels (rows 7-12, B/D columns) — override cached formula values
  // Template formulas: B7=AG2, D7=AG3, B8=AG4, D8=AG5, etc.
  const maxLabelPairs = 6; // rows 7-12
  for (let pair = 0; pair < maxLabelPairs; pair++) {
    const r = 7 + pair;
    const agIdxA = 2 + pair * 2;
    const agIdxB = 3 + pair * 2;
    const labelA = ws.getCell(agIdxA, 33).value || "";
    const labelB = ws.getCell(agIdxB, 33).value || "";
    const hasA = labelA && labelA !== "_" && labelA !== "";
    const hasB = labelB && labelB !== "_" && labelB !== "";
    ws.getCell(r, 2).value = hasA ? labelA : "-";       // B
    ws.getCell(r, 4).value = hasB ? labelB : "-";       // D
    if (!hasA && !hasB) {
      ws.getCell(r, 5).value = "χωρίς ports";           // E
    }
  }

  console.log(`✅ LABELS BEP: wrote ${allBepPaths.length} paths to Y + pre-computed AA-AG`);
}

function fillLabelsBmoSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  // Template has formulas in visible cells (B7=AE2, D7=AE3, I6=AE2, Q6=$AE$2 etc.)
  // We only need to fill data columns Y and Z-AE. DO NOT overwrite column A (visible layout).

  // Update A3 with actual BEP header for this SR
  ws.getCell("A3").value = getBepHeader(d.bepType);
  // Update BCP header at A21 if BCP exists
  if (d.newBcp) {
    ws.getCell("A21").value = getBcpHeader(d.newBcp);
  }

  const bmoFbPaths = d.opticalPaths.filter(op => op.type === "BMO-FB" || op.type === "BMO");

  // Clear data columns Y, Z-AE (rows 2-96) — preserve row 1 headers
  for (let r = 2; r <= 96; r++) {
    ws.getCell(r, 25).value = "";   // Y
    ws.getCell(r, 26).value = "";   // Z
    ws.getCell(r, 27).value = "";   // AA
    ws.getCell(r, 30).value = "";   // AD
    ws.getCell(r, 31).value = "";   // AE
  }

  // Column Y: Write BMO-FB paths
  for (let i = 0; i < 36; i++) {
    const r = 2 + i;
    ws.getCell(r, 25).value = i < bmoFbPaths.length ? bmoFbPaths[i].path : "";
  }

  // Columns Z, AA, AD, AE: Pre-compute values
  for (let i = 0; i < 36; i++) {
    const r = 2 + i;
    if (i < bmoFbPaths.length) {
      const p = bmoFbPaths[i].path;
      const bmoMatch = p.match(/(BMO\d+[_]\d+a?)/);
      ws.getCell(r, 26).value = bmoMatch ? bmoMatch[1] : "";   // Z
      const fbMatch = p.match(/(FB\([^)]+\)\.\d+_\d+)/);
      ws.getCell(r, 27).value = fbMatch ? fbMatch[1] : "";     // AA
      ws.getCell(r, 30).value = i + 1;                          // AD
      ws.getCell(r, 31).value = fbMatch ? fbMatch[1] : "";     // AE
    } else {
      ws.getCell(r, 30).value = i + 1;                          // AD
    }
  }

  // Update visible BMO labels (rows 7-12, B/D columns) — override cached formula values
  const maxLabelPairs = 6;
  for (let pair = 0; pair < maxLabelPairs; pair++) {
    const r = 7 + pair;
    const aeIdxA = 2 + pair * 2;
    const aeIdxB = 3 + pair * 2;
    const labelA = ws.getCell(aeIdxA, 31).value || "";
    const labelB = ws.getCell(aeIdxB, 31).value || "";
    const hasA = labelA && labelA !== "";
    const hasB = labelB && labelB !== "";
    ws.getCell(r, 2).value = hasA ? labelA : "-";       // B
    ws.getCell(r, 4).value = hasB ? labelB : "-";       // D
    if (!hasA && !hasB) {
      ws.getCell(r, 5).value = "χωρίς ports";           // E
    }
  }

  console.log(`✅ LABELS BMO: wrote ${bmoFbPaths.length} BMO-FB paths to Y + pre-computed Z-AE`);
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

  // ── 3. BEP position ── (B22 is a label "ΟΡΟΦΟΣ ΤΟΠΟΘΕΤΗΣΗΣ ΒΕΡ" — don't overwrite)
  // BEP floor value already written at G8 above

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
    ws.getCell(r, 15).value = fd.fb_id || "";        // O = GIS ID
    ws.getCell(r, 16).value = fd.meters || "";       // P = ΜΕΤΡΑ
    ws.getCell(r, 17).value = fd.pipe_type || "";    // Q = ΕΙΔΟΣ
  });

  // ══════════════════════════════════════════════════════════════
  // 5. CAB-BEP OPTICAL PATHS (rows 44-47, F=type, G=path)
  // Reference: Only primary CAB-BEP path (with SGA/SGB) at row 44,
  // remaining rows show "CAB-BEP" as filler text
  // ══════════════════════════════════════════════════════════════
  const allCabPaths = d.opticalPaths.filter(op => op.type === "CAB-BEP" || op.type === "CAB-BCP");
  // Primary path = the one containing SGA/SGB + SB (full routing), if any
  const primaryCab = allCabPaths.find(op => /SG[AB]\d+/i.test(op.path) && /SB\d+/i.test(op.path));
  // Order: primary first, then rest
  const orderedCabPaths = primaryCab
    ? [primaryCab, ...allCabPaths.filter(p => p !== primaryCab)]
    : [...allCabPaths];

  for (let r = 44; r <= 47; r++) {
    ws.getCell(r, 6).value = null; // F
    ws.getCell(r, 7).value = null; // G
  }
  for (let i = 0; i < orderedCabPaths.length && i < 4; i++) {
    ws.getCell(44 + i, 6).value = orderedCabPaths[i].type;
    ws.getCell(44 + i, 7).value = orderedCabPaths[i].path;
  }
  console.log(`✅ CAB-BEP: wrote ${Math.min(orderedCabPaths.length, 4)} paths to F44:G47`);

  // ══════════════════════════════════════════════════════════════
  // 5a2. Write BMO type header at I46 and BEP type header at B61
  // ══════════════════════════════════════════════════════════════
  // BMO header at T46 (col 20) per template
  ws.getCell("T46").value = getBmoHeader(d.bmoType);
  // BEP header at F61 (col 6) per template
  ws.getCell("F61").value = getBepHeader(d.bepType);

  // BMO position headers (T47-T48 per template)
  ws.getCell("T47").value = "ΘΕΣΗ";
  ws.getCell("U47").value = "A";
  ws.getCell("V47").value = "ΘΕΣΗ";
  ws.getCell("W47").value = "B";
  ws.getCell("X47").value = "ΠΑΡΑΤΗΡΗΣΕΙΣ";
  // BMO positions row 48 (from cabinet)
  ws.getCell("T48").value = 1;
  ws.getCell("U48").value = 1;
  ws.getCell("V48").value = 25;
  ws.getCell("W48").value = 2;
  ws.getCell("X48").value = "από καμπίνα";
  // BMO positions row 49
  ws.getCell("T49").value = 2;
  ws.getCell("U49").value = 3;
  ws.getCell("V49").value = 26;
  ws.getCell("W49").value = 4;

  // ══════════════════════════════════════════════════════════════
  // 5b. CABLE INDICES (rows 53-58, F=index, G=cable_number, H=address)
  // Extract cable numbers from ALL CAB-BEP/CAB-BCP paths
  // ══════════════════════════════════════════════════════════════
  for (let r = 53; r <= 58; r++) {
    ws.getCell(r, 6).value = 0;
    ws.getCell(r, 7).value = 0;
    ws.getCell(r, 8).value = null;
  }

  // Extract cable numbers from all CAB paths
  const cableNumbers: string[] = [];
  for (const cp of allCabPaths) {
    const cableNum = extractCableIndex(cp.path);
    if (cableNum) cableNumbers.push(cableNum);
  }

  // Write BCP header if BCP data exists
  const hasBcp = (d.newBcp || "").trim().length > 0 ||
    d.opticalPaths.some(op => (op.type || "").toUpperCase().includes("BCP"));
  if (hasBcp && d.newBcp) {
    ws.getCell("F51").value = getBcpHeader(d.newBcp);
  }

  // Write cable numbers (from all CAB paths)
  for (let i = 0; i < cableNumbers.length && i < 6; i++) {
    const r = 53 + i;
    const cn = cableNumbers[i];
    ws.getCell(r, 6).value = i + 1;
    ws.getCell(r, 7).value = /^\d+$/.test(cn) ? Number(cn) : cn;
    ws.getCell(r, 8).value = d.address;
  }
  console.log(`✅ Cable indices: wrote ${Math.min(cableNumbers.length, 6)} cables to F53:H58`);

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

  // Clear old BMO-FB data (rows 50-71, cols T-X = 20-24)
  for (let r = 50; r <= 71; r++) {
    ws.getCell(r, 20).value = null;  // T = position A
    ws.getCell(r, 21).value = null;  // U = FB path A
    ws.getCell(r, 22).value = null;  // V = position B
    ws.getCell(r, 23).value = null;  // W = FB path B
    ws.getCell(r, 24).value = null;  // X = notes
  }

  // Extract FB paths from BMO-FB paths and write them paired
  // Template: T=position(3,4,...), U=FB_A, V=position(27,28,...), W=FB_B
  for (let i = 0; i < bmoFbPaths.length && i < 36; i++) {
    const pairIdx = Math.floor(i / 2);
    const r = 50 + pairIdx;
    const isB = i % 2 === 1;
    const fbMatch = bmoFbPaths[i].path.match(/(FB\([^)]+\)\.\d+_\d+)/);
    const fbLabel = fbMatch ? fbMatch[1] : bmoFbPaths[i].path;
    if (!isB) {
      ws.getCell(r, 20).value = pairIdx + 3;       // T = position (3,4,5...)
      ws.getCell(r, 21).value = fbLabel;            // U = FB path A
      ws.getCell(r, 22).value = pairIdx + 27;       // V = position (27,28,29...)
    } else {
      ws.getCell(r, 23).value = fbLabel;            // W = FB path B
    }
  }

  // Fill remaining slots with 0/- and position indices
  const bmoWritten = Math.min(bmoFbPaths.length, 36);
  for (let i = bmoWritten; i < 36; i++) {
    const pairIdx = Math.floor(i / 2);
    const r = 50 + pairIdx;
    const isB = i % 2 === 1;
    if (r <= 71) {
      if (!isB) {
        ws.getCell(r, 20).value = pairIdx + 3;
        ws.getCell(r, 21).value = pairIdx + 3 > 20 ? "-" : 0;
        ws.getCell(r, 22).value = pairIdx + 27;
      } else {
        ws.getCell(r, 23).value = pairIdx + 27 > 44 ? "-" : 0;
        if (i >= bmoWritten) {
          ws.getCell(r, 24).value = "χωρίς ports";
        }
      }
    }
  }
  console.log(`✅ BMO-FB: wrote ${bmoWritten} FB paths to T50:W71`);

  // ── 6. ΟΡΙΖΟΝΤΟΓΡΑΦΙΑ ──
  // U83="ΑΠΟΣΤΑΣΗ ΒΜΟ- BEP" → V83=distance value
  ws.getCell("V83").value = d.distanceFromCabinet || "";
  ws.getCell("V85").value = d.isNewInfrastructure ? "ΝΕΑ ΥΠΟΔΟΜΗ" : "";
  ws.getCell("V91").value = d.trenchLengthM || "";
}

/** Extract cable index from CAB-BEP/CAB-BCP path string.
 *  Handles both numeric (G526_249_BEP...) and alphanumeric (G137_B1.5_BEP...) formats.
 *  Also handles SGA paths: G137_SGA01(1:8).02_B1.5_BEP01(b24)_01_SB01(1:8) -> "B1.5"
 *  Also handles BCP paths: G151_SGA01(1:8).07_C1.1_BCP01(c19)_01 -> "C1.1"
 */
function extractCableIndex(path: string): string {
  // Find the segment(s) before "BEP" or "BCP" keyword
  const bepIdx = path.search(/B[CE]P/);
  if (bepIdx < 0) return "";
  const beforeBep = path.substring(0, bepIdx);
  const parts = beforeBep.split("_").filter(Boolean);
  // Skip the first part (CAB ID like G526) and SGA/SGB parts
  for (let i = parts.length - 1; i >= 1; i--) {
    const part = parts[i];
    if (part.startsWith("SGA") || part.startsWith("SGB")) continue;
    // Return the cable identifier (numeric or alphanumeric like B1.5, C1.1)
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
    const bmoMatch = op.path.match(/(BMO\d+_\d+a?)/);
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
          distanceFromCabinet: data.distanceFromCabinet || 0,
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
