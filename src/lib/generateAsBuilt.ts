import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

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

  // Parse GIS JSON fields
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

  // Auto-build works from gis_works if no construction_works
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
    sketchImageUrl: inspection?.sketch_notes || null,
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
   Sheet 1: ΚΤΗΡΙΟ (row 2)
   ──────────────────────────────────────────── */

function fillKtirioSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  const r = 2;
  const vals = [
    d.srId, d.buildingId, d.areaType, d.floors, d.customerFloor, d.bepFloor,
    d.adminSignature ? "TRUE" : "FALSE", d.bepOnly ? "TRUE" : "FALSE",
    d.bepTemplate, d.bepType, d.bmoType,
    d.nanotronix ? "TRUE" : "FALSE", d.smartReadiness ? "TRUE" : "FALSE",
    d.associatedBcp, d.nearbyBcp, d.newBcp, d.conduit,
    d.distanceFromCabinet, d.latitude, d.longitude, d.notes, d.warning, d.failure,
  ];
  vals.forEach((v, i) => { ws.getCell(r, i + 1).value = v as any; });
}

/* ────────────────────────────────────────────
   Sheet 2: ΟΡΟΦΟΙ (row 2+)
   ──────────────────────────────────────────── */

function fillOrofoiSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  d.floorDetails.forEach((fd, idx) => {
    const r = 2 + idx;
    ws.getCell(r, 1).value = fd.floor as any;
    ws.getCell(r, 2).value = fd.apartments;
    ws.getCell(r, 3).value = fd.shops;
    ws.getCell(r, 4).value = fd.fb_count;
    ws.getCell(r, 5).value = fd.fb_type;
    ws.getCell(r, 6).value = fd.fb_customer || "";
    ws.getCell(r, 7).value = fd.customer_space || "";
  });
}

/* ────────────────────────────────────────────
   Sheet 3: OPTICAL PATHS (row 2+)
   ──────────────────────────────────────────── */

function fillOpticalPathsSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  d.opticalPaths.forEach((op, idx) => {
    const r = 2 + idx;
    ws.getCell(r, 1).value = op.type;
    ws.getCell(r, 2).value = op.path;
    ws.getCell(r, 3).value = op.gis_id || "";
  });
}

/* ────────────────────────────────────────────
   Sheet 4: ΕΡΓΑΣΙΕΣ (row 2+)
   ──────────────────────────────────────────── */

function fillErgasiesSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  d.works.forEach((w, idx) => {
    const r = 2 + idx;
    ws.getCell(r, 1).value = w.type;
    ws.getCell(r, 2).value = w.description;
    ws.getCell(r, 3).value = w.quantity;
    ws.getCell(r, 4).value = w.floor || "";
  });
}

/* ────────────────────────────────────────────
   Sheet 5 & 6: LABELS BEP / LABELS BMO
   Dynamic optical path generation
   ──────────────────────────────────────────── */

function fillLabelsBepSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  // Fill 12 rows for ports 1-12
  // Use BEP-BMO and BEP paths first, then fill remaining with "χωρίς ports"
  const bepPaths = d.opticalPaths.filter(op => op.type === "BEP-BMO" || op.type === "BEP");
  for (let port = 0; port < 12; port++) {
    const r = 2 + port;
    if (port < bepPaths.length) {
      ws.getCell(r, 1).value = bepPaths[port].path;
    } else {
      ws.getCell(r, 1).value = "χωρίς ports";
    }
  }
  // Also add CAB-BEP paths below
  const cabBepPaths = d.opticalPaths.filter(op => op.type === "CAB-BEP");
  cabBepPaths.forEach((op, idx) => {
    ws.getCell(14 + idx, 1).value = op.path;
  });
}

function fillLabelsBmoSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  const bmoPaths = d.opticalPaths.filter(op => op.type === "BMO-FB" || op.type === "BEP-BMO");
  bmoPaths.forEach((op, idx) => {
    ws.getCell(2 + idx, 1).value = op.path;
  });
}

/* ────────────────────────────────────────────
   Sheet 7: AS build-Επιμέτρηση
   Exact cell mapping per user specifications
   ──────────────────────────────────────────── */

function fillEpimetrisiSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  // ── 0. ΣΤΟΙΧΕΙΑ ΑΙΤΗΜΑΤΟΣ ──
  // E4 = SRId, F4 = Address (user-specified cells)
  ws.getCell("E4").value = d.srId;
  ws.getCell("F4").value = d.address;

  // Also fill E6/F6 which is where the template visually shows SR/Address
  ws.getCell("E6").value = d.srId;
  ws.getCell("F6").value = d.address;

  // ── 1. ΚΤΗΡΙΟ ── Row 9: COPY PASTE VALUES FROM TAB ΚΤΗΡΙΟ
  const ktRow = 9;
  ws.getCell(ktRow, 2).value = d.srId;          // B9
  ws.getCell(ktRow, 3).value = d.buildingId;    // C9
  ws.getCell(ktRow, 4).value = d.areaType;      // D9
  ws.getCell(ktRow, 5).value = d.floors;        // E9
  ws.getCell(ktRow, 6).value = d.customerFloor; // F9
  ws.getCell(ktRow, 7).value = d.bepFloor;      // G9
  ws.getCell(ktRow, 8).value = d.adminSignature ? "TRUE" : "FALSE";
  ws.getCell(ktRow, 9).value = d.bepOnly ? "TRUE" : "FALSE";
  ws.getCell(ktRow, 10).value = d.bepTemplate;
  ws.getCell(ktRow, 11).value = d.bepType;
  ws.getCell(ktRow, 12).value = d.bmoType;
  ws.getCell(ktRow, 13).value = d.nanotronix ? "TRUE" : "FALSE";
  ws.getCell(ktRow, 14).value = d.smartReadiness ? "TRUE" : "FALSE";
  ws.getCell(ktRow, 15).value = d.associatedBcp;
  ws.getCell(ktRow, 16).value = d.nearbyBcp;
  ws.getCell(ktRow, 17).value = d.newBcp;
  ws.getCell(ktRow, 18).value = d.conduit;

  // ── 2. KOI CAB first box ── Row 14
  ws.getCell("D14").value = "BEP";
  ws.getCell("E14").value = "4' μ cable";
  ws.getCell("F14").value = d.distanceFromCabinet;

  // ── 4. BEP-ΟΡΟΦΟΙ ── Row 26+: COPY PASTE VALUES FROM ΤΑΒ ΟΡΟΦΟΙ
  const orofoiStartRow = 26;
  d.floorDetails.forEach((fd, idx) => {
    const r = orofoiStartRow + idx;
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

  // ── 5. ΣΤΟΙΧΕΙΑ ΚΑΜΠΙΝΑΣ / LABEL BEP ── Row 45+: CAB-BEP optical paths
  const cabBepPaths = d.opticalPaths.filter(op => op.type === "CAB-BEP");
  const optStartRow = 45;
  cabBepPaths.forEach((op, idx) => {
    const r = optStartRow + idx;
    ws.getCell(r, 7).value = op.type;  // G = OPTICAL PATH TYPE
    ws.getCell(r, 8).value = op.path;  // H = OPTICAL PATH
  });

  // ── 6. ΟΡΙΖΟΝΤΟΓΡΑΦΙΑ ──
  // U25 = ΝΕΑ ΥΠΟΔΟΜΗ (user-specified)
  ws.getCell("U25").value = d.isNewInfrastructure ? "ΝΑΙ" : "";

  // U26 = Ball Marker (cable_bcp_bep_m) - use distance as proxy
  ws.getCell("U26").value = d.distanceFromCabinet || "";

  // U30 = ΝΕΑ ΣΩΛΗΝΩΣΗ / trench_length_m (user-specified)
  ws.getCell("U30").value = d.trenchLengthM || "";
}

/* ────────────────────────────────────────────
   Main AS-BUILD Generator
   ──────────────────────────────────────────── */

export interface AsBuiltResult {
  success: boolean;
  warnings: string[];
}

export async function generateAsBuilt(srId: string): Promise<AsBuiltResult> {
  const data = await fetchAsBuiltData(srId);
  return generateAsBuiltFromData(data);
}

export async function generateAsBuiltFromData(data: AsBuiltData): Promise<AsBuiltResult> {
  const warnings: string[] = [];

  // Load template
  const templateResp = await fetch("/templates/as_build_template.xlsx");
  if (!templateResp.ok) {
    throw new Error("Δεν βρέθηκε το AS-BUILD template. Ελέγξτε ότι υπάρχει στο /templates/as_build_template.xlsx");
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await templateResp.arrayBuffer());

  const sheets = workbook.worksheets;
  const ktirioSheet = sheets[0];       // ΚΤΗΡΙΟ
  const orofoiSheet = sheets[1];       // ΟΡΟΦΟΙ
  const optPathSheet = sheets[2];      // OPTICAL PATHS
  const ergasiesSheet = sheets[3];     // ΕΡΓΑΣΙΕΣ
  const labelsBepSheet = sheets[4];    // LABELS BEP
  const labelsBmoSheet = sheets[5];    // LABELS BMO
  const epimetrisiSheet = sheets[6];   // AS build-Επιμέτρηση

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

    // Sketch image injection at B46 with oneCell anchor
    if (data.sketchImageUrl) {
      const imgBuf = await fetchImageBuffer(data.sketchImageUrl);
      if (imgBuf) {
        const ext = data.sketchImageUrl.toLowerCase().includes(".jpg") ||
          data.sketchImageUrl.toLowerCase().includes(".jpeg")
          ? "jpeg" as const : "png" as const;
        const imgId = workbook.addImage({ buffer: imgBuf, extension: ext });
        const pxToEmu = 9525;
        epimetrisiSheet.addImage(imgId, {
          tl: { col: 1, row: 45 } as any,  // B46 (0-indexed: col=1, row=45)
          ext: { width: 800 * pxToEmu, height: 600 * pxToEmu },
          editAs: "oneCell",
        } as any);
      } else {
        warnings.push("Η εικόνα σκαριφήματος δεν μπόρεσε να φορτωθεί.");
      }
    } else {
      warnings.push("Δεν βρέθηκε εικόνα σκαριφήματος (sketch). Ο χώρος '6 ΟΡΙΖΟΝΤΟΓΡΑΦΙΑ' θα είναι κενός.");
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
   Mock Data for Testing
   ──────────────────────────────────────────── */

export function getMockAsBuiltData(): AsBuiltData {
  return {
    srId: "2-334066371997",
    buildingId: "667102934",
    areaType: "OTE",
    floors: 4,
    customerFloor: "+01",
    bepFloor: "+00",
    adminSignature: true,
    bepOnly: false,
    bepTemplate: "BEP 1SP 1:8(01..12) ΚΔ",
    bepType: "MEDIUM/12/ZTT (01..12)",
    bmoType: "SMALL/16/RAYCAP",
    nanotronix: false,
    smartReadiness: true,
    associatedBcp: "",
    nearbyBcp: "",
    newBcp: "",
    conduit: "b04",
    distanceFromCabinet: 134,
    latitude: 37939475,
    longitude: 23743480,
    notes: "",
    warning: "",
    failure: "",
    address: "ΑΓΙΟΥ ΚΩΝΣΤΑΝΤΙΝΟΥ 58",
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
    sketchImageUrl: null,
    isNewInfrastructure: true,
    trenchLengthM: 156,
    cabId: "G526",
  };
}
