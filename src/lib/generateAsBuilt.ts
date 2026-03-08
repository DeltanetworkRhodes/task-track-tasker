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
  type: string;    // BEP-BMO, BMO-FB, CAB-BEP, BEP
  path: string;
  gis_id?: string;
}

interface ConstructionWork {
  type: string;        // ΤΥΠΟΣ ΕΡΓΑΣΙΑΣ
  description: string; // ΕΡΓΑΣΙΑ
  quantity: number;    // ΠΟΣΟΤΗΤΑ
  floor?: string;      // ΟΡΟΦΟΣ
}

interface AsBuiltData {
  // Page 1 - ΚΤΗΡΙΟ
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
  // Assignment
  address: string;
  // Page 2 - ΟΡΟΦΟΙ
  floorDetails: FloorBox[];
  // Page 3 - OPTICAL PATHS
  opticalPaths: OpticalPathEntry[];
  // Page 4 - ΕΡΓΑΣΙΕΣ
  works: ConstructionWork[];
  // Sketch image
  sketchImageUrl: string | null;
  // Επιμέτρηση specific
  isNewInfrastructure: boolean;
  trenchLengthM: number;
  cabId: string;
}

/* ────────────────────────────────────────────
   Data Fetching from Supabase
   ──────────────────────────────────────────── */

async function fetchAsBuiltData(srId: string): Promise<AsBuiltData> {
  // 1. Assignment
  const { data: assignment, error: aErr } = await supabase
    .from("assignments")
    .select("*")
    .eq("sr_id", srId)
    .maybeSingle();
  if (aErr) throw new Error(`Assignment fetch error: ${aErr.message}`);
  if (!assignment) throw new Error(`Δεν βρέθηκε ανάθεση για SR: ${srId}`);

  // 2. GIS data
  const { data: gisData, error: gErr } = await supabase
    .from("gis_data")
    .select("*")
    .eq("assignment_id", assignment.id)
    .maybeSingle();
  if (gErr) throw new Error(`GIS data fetch error: ${gErr.message}`);

  // 3. Construction works
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

  // 4. Inspection report (sketch)
  const { data: inspection } = await supabase
    .from("inspection_reports")
    .select("sketch_notes")
    .eq("assignment_id", assignment.id)
    .maybeSingle();

  // Parse GIS
  const rawPaths = (gisData?.optical_paths as any[]) || [];
  const floorDetails = (gisData?.floor_details as any[]) || [];
  const gisWorks = (gisData?.gis_works as any[]) || [];

  const opticalPaths: OpticalPathEntry[] = rawPaths.map((p: any) => ({
    type: p.type || p.OPTICAL_PATH_TYPE || "BEP-BMO",
    path: p.path || p.OPTICAL_PATH || p.optical_path || "",
    gis_id: p.gis_id || "",
  }));

  const floorBoxes: FloorBox[] = floorDetails.map((fd: any) => ({
    floor: fd.floor ?? fd.ΟΡΟΦΟΣ ?? "",
    fb_id: fd.fb_id ?? fd.FB_ID ?? "",
    apartments: fd.apartments ?? fd.ΔΙΑΜΕΡΙΣΜΑΤΑ ?? 0,
    shops: fd.shops ?? fd.ΚΑΤΑΣΤΗΜΑΤΑ ?? 0,
    fb_count: fd.fb_count ?? fd.FB01 ?? 0,
    fb_type: fd.fb_type ?? fd.FB01_TYPE ?? "",
    fb_customer: fd.fb_customer ?? fd.FB_ΠΕΛΑΤΗ ?? "",
    customer_space: fd.customer_space ?? fd.ΑΡΙΘΜΗΣΗ_ΧΩΡΟΥ_ΠΕΛΑΤΗ ?? "",
    meters: fd.meters ?? fd.ΜΕΤΡΑ ?? 0,
    pipe_type: fd.pipe_type ?? fd.ΕΙΔΟΣ ?? "",
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
   Fill Sheet Helpers
   ──────────────────────────────────────────── */

function fillKtirioSheet(sheet: ExcelJS.Worksheet, data: AsBuiltData) {
  // Row 2 (data row after header)
  const r = 2;
  sheet.getCell(r, 1).value = data.srId;
  sheet.getCell(r, 2).value = data.buildingId;
  sheet.getCell(r, 3).value = data.areaType;
  sheet.getCell(r, 4).value = data.floors;
  sheet.getCell(r, 5).value = data.customerFloor;
  sheet.getCell(r, 6).value = data.bepFloor;
  sheet.getCell(r, 7).value = data.adminSignature ? "TRUE" : "FALSE";
  sheet.getCell(r, 8).value = data.bepOnly ? "TRUE" : "FALSE";
  sheet.getCell(r, 9).value = data.bepTemplate;
  sheet.getCell(r, 10).value = data.bepType;
  sheet.getCell(r, 11).value = data.bmoType;
  sheet.getCell(r, 12).value = data.nanotronix ? "TRUE" : "FALSE";
  sheet.getCell(r, 13).value = data.smartReadiness ? "TRUE" : "FALSE";
  sheet.getCell(r, 14).value = data.associatedBcp;
  sheet.getCell(r, 15).value = data.nearbyBcp;
  sheet.getCell(r, 16).value = data.newBcp;
  sheet.getCell(r, 17).value = data.conduit;
  sheet.getCell(r, 18).value = data.distanceFromCabinet;
  sheet.getCell(r, 19).value = data.latitude;
  sheet.getCell(r, 20).value = data.longitude;
  sheet.getCell(r, 21).value = data.notes;
  sheet.getCell(r, 22).value = data.warning;
  sheet.getCell(r, 23).value = data.failure;
}

function fillOrofoiSheet(sheet: ExcelJS.Worksheet, data: AsBuiltData) {
  const startRow = 2;
  data.floorDetails.forEach((fd, idx) => {
    const r = startRow + idx;
    sheet.getCell(r, 1).value = fd.floor;
    sheet.getCell(r, 2).value = fd.apartments;
    sheet.getCell(r, 3).value = fd.shops;
    sheet.getCell(r, 4).value = fd.fb_count;
    sheet.getCell(r, 5).value = fd.fb_type;
    sheet.getCell(r, 6).value = fd.fb_customer || "";
    sheet.getCell(r, 7).value = fd.customer_space || "";
  });
}

function fillOpticalPathsSheet(sheet: ExcelJS.Worksheet, data: AsBuiltData) {
  const startRow = 2;
  data.opticalPaths.forEach((op, idx) => {
    const r = startRow + idx;
    sheet.getCell(r, 1).value = op.type;
    sheet.getCell(r, 2).value = op.path;
    sheet.getCell(r, 3).value = op.gis_id || "";
  });
}

function fillErgasiesSheet(sheet: ExcelJS.Worksheet, data: AsBuiltData) {
  const startRow = 2;
  data.works.forEach((w, idx) => {
    const r = startRow + idx;
    sheet.getCell(r, 1).value = w.type;
    sheet.getCell(r, 2).value = w.description;
    sheet.getCell(r, 3).value = w.quantity;
    sheet.getCell(r, 4).value = w.floor || "";
  });
}

function fillLabelsSheet(sheet: ExcelJS.Worksheet, data: AsBuiltData, filterTypes: string[]) {
  const startRow = 2;
  const filtered = data.opticalPaths.filter(op => filterTypes.includes(op.type));
  filtered.forEach((op, idx) => {
    sheet.getCell(startRow + idx, 1).value = op.path;
  });
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

/**
 * Generate from pre-built data (allows testing with mock data)
 */
export async function generateAsBuiltFromData(data: AsBuiltData): Promise<AsBuiltResult> {
  const warnings: string[] = [];
  // Load template
  const templateResp = await fetch("/templates/as_build_template.xlsx");
  if (!templateResp.ok) {
    throw new Error("Δεν βρέθηκε το AS-BUILD template. Ελέγξτε ότι υπάρχει στο /templates/as_build_template.xlsx");
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await templateResp.arrayBuffer());

  // Get sheet references (by name or index)
  const sheets = workbook.worksheets;
  const ktirioSheet = sheets[0];      // Page 1: ΚΤΗΡΙΟ
  const orofoiSheet = sheets[1];      // Page 2: ΟΡΟΦΟΙ
  const optPathSheet = sheets[2];     // Page 3: OPTICAL PATHS
  const ergasiesSheet = sheets[3];    // Page 4: ΕΡΓΑΣΙΕΣ
  const labelsBepSheet = sheets[4];   // Page 5: LABELS BEP
  const labelsBmoSheet = sheets[5];   // Page 6: LABELS BMO
  const epimetrisiSheet = sheets[6];  // Page 7: AS build-Επιμέτρηση

  // Fill each sheet
  if (ktirioSheet) fillKtirioSheet(ktirioSheet, data);
  if (orofoiSheet) fillOrofoiSheet(orofoiSheet, data);
  if (optPathSheet) fillOpticalPathsSheet(optPathSheet, data);
  if (ergasiesSheet) fillErgasiesSheet(ergasiesSheet, data);
  if (labelsBepSheet) fillLabelsSheet(labelsBepSheet, data, ["BEP-BMO", "BEP", "CAB-BEP"]);
  if (labelsBmoSheet) fillLabelsSheet(labelsBmoSheet, data, ["BMO-FB", "BEP-BMO"]);

  // Fill Επιμέτρηση (main sheet)
  if (epimetrisiSheet) {
    // The Επιμέτρηση sheet copies values from other tabs into specific locations
    // Section 0: SR info - row ~5 area (E4=type, F4=SR, address)
    // Based on template: row with SR is around row 6 in section "0 ΣΤΟΙΧΕΙΑ ΑΙΤΗΜΑΤΟΣ"
    // SR -> column E (5), Address -> next position
    // Let's find by scanning for known markers or use fixed positions from template
    
    // From template analysis:
    // Row ~4-5: SRId, BUILDING ID, etc. mapped in section "COPY PASTE VALUES FROM TAB ΚΤΗΡΙΟ"
    // The main "Επιμέτρηση" data section positions (from template Page 7):
    
    // Section 1 ΚΤΗΡΙΟ - row 9 area: copy paste GIS values
    const ktRow = 9; // "COPY PASTE VALUES FROM TAB ΚΤΗΡΙΟ" row
    epimetrisiSheet.getCell(ktRow, 2).value = data.srId;
    epimetrisiSheet.getCell(ktRow, 3).value = data.buildingId;
    epimetrisiSheet.getCell(ktRow, 4).value = data.areaType;
    epimetrisiSheet.getCell(ktRow, 5).value = data.floors;
    epimetrisiSheet.getCell(ktRow, 6).value = data.customerFloor;
    epimetrisiSheet.getCell(ktRow, 7).value = data.bepFloor;
    epimetrisiSheet.getCell(ktRow, 8).value = data.adminSignature ? "TRUE" : "FALSE";
    epimetrisiSheet.getCell(ktRow, 9).value = data.bepOnly ? "TRUE" : "FALSE";
    epimetrisiSheet.getCell(ktRow, 10).value = data.bepTemplate;
    epimetrisiSheet.getCell(ktRow, 11).value = data.bepType;
    epimetrisiSheet.getCell(ktRow, 12).value = data.bmoType;
    epimetrisiSheet.getCell(ktRow, 13).value = data.nanotronix ? "TRUE" : "FALSE";
    epimetrisiSheet.getCell(ktRow, 14).value = data.smartReadiness ? "TRUE" : "FALSE";
    epimetrisiSheet.getCell(ktRow, 17).value = data.conduit;

    // Section header info - SR and Address
    // From template: row 6 has "RETAIL", SR, ΔΙΕΥΘΥΝΣΗ
    epimetrisiSheet.getCell(6, 5).value = data.srId;       // E6
    epimetrisiSheet.getCell(6, 6).value = data.address;     // F6

    // Section 2: KOI CAB - first box
    // Row ~14: FIRST BOX, ΤΥΠΟΣ ΚΟΙ, ΜΗΚΟΣ
    epimetrisiSheet.getCell(14, 4).value = "BEP";                      // FIRST BOX
    epimetrisiSheet.getCell(14, 5).value = "4' μ cable";               // ΤΥΠΟΣ ΚΟΙ
    epimetrisiSheet.getCell(14, 6).value = data.distanceFromCabinet;   // ΜΗΚΟΣ

    // Section 4: BEP-ΟΡΟΦΟΙ - copy from ΟΡΟΦΟΙ tab
    const orofoiStartRow = 26; // "COPY PASTE VALUES FROM ΤΑΒ ΟΡΟΦΟΙ"
    data.floorDetails.forEach((fd, idx) => {
      const r = orofoiStartRow + idx;
      epimetrisiSheet.getCell(r, 2).value = fd.floor;
      epimetrisiSheet.getCell(r, 3).value = fd.apartments;
      epimetrisiSheet.getCell(r, 4).value = fd.shops;
      epimetrisiSheet.getCell(r, 5).value = fd.fb_count;
      epimetrisiSheet.getCell(r, 6).value = fd.fb_type;
      epimetrisiSheet.getCell(r, 14).value = fd.fb_customer || "";
      epimetrisiSheet.getCell(r, 15).value = fd.customer_space || "";
      epimetrisiSheet.getCell(r, 16).value = fd.meters || "";
      epimetrisiSheet.getCell(r, 17).value = fd.pipe_type || "";
    });

    // Section 5: OPTICAL PATHS - CAB-BEP entries
    const cabBepPaths = data.opticalPaths.filter(op => op.type === "CAB-BEP");
    const optStartRow = 45; // "COPY PASTE VALUES FROM TAB OPTICAL PATHS"
    cabBepPaths.forEach((op, idx) => {
      const r = optStartRow + idx;
      epimetrisiSheet.getCell(r, 7).value = op.type;
      epimetrisiSheet.getCell(r, 8).value = op.path;
    });

    // Section 6 ΟΡΙΖΟΝΤΟΓΡΑΦΙΑ - sketch image + measurements
    // "ΕΙΔΟΣ ΕΙΣΑΓΩΓΗΣ" near row 86 (col U = 21)
    // Based on template structure:
    const measRow = 86;
    epimetrisiSheet.getCell(measRow, 22).value = data.isNewInfrastructure ? "ΝΕΑ ΥΠΟΔΟΜΗ" : "";
    // Ball Marker row
    epimetrisiSheet.getCell(measRow + 1, 22).value = ""; // Ball Marker value
    // ΝΕΑ ΣΩΛΗΝΩΣΗ
    epimetrisiSheet.getCell(measRow + 6, 22).value = data.trenchLengthM || "";

    // Sketch image injection – oneCell anchor at B46, max 800px width, keep aspect ratio
    if (data.sketchImageUrl) {
      const imgBuf = await fetchImageBuffer(data.sketchImageUrl);
      if (imgBuf) {
        // Detect image dimensions to maintain aspect ratio
        const MAX_WIDTH_PX = 800;
        const MAX_HEIGHT_PX = 600;

        // Determine extension from URL or default to png
        const ext = data.sketchImageUrl.toLowerCase().includes(".jpg") ||
          data.sketchImageUrl.toLowerCase().includes(".jpeg")
          ? "jpeg" as const
          : "png" as const;

        const imgId = workbook.addImage({ buffer: imgBuf, extension: ext });

        // Use oneCell anchor: image starts at B46 (col 1, row 45) with fixed pixel extents
        // ExcelJS expects ext in EMUs (1px ≈ 9525 EMU) for oneCell anchor
        const pxToEmu = 9525;
        epimetrisiSheet.addImage(imgId, {
          tl: { col: 1, row: 45 } as any,
          ext: { width: MAX_WIDTH_PX * pxToEmu, height: MAX_HEIGHT_PX * pxToEmu },
          editAs: "oneCell",
        } as any);
      } else {
        warnings.push("Η εικόνα σκαριφήματος δεν μπόρεσε να φορτωθεί. Ο χώρος παραμένει κενός.");
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
