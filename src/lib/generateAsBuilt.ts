import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

/* ────────────────────────────────────────────
   Types
   ──────────────────────────────────────────── */

interface FloorBox {
  floor: string | number;
  fb_id: string;
}

interface OpticalPathRaw {
  bep_id?: string; BEP_ID?: string;
  conduit?: string; CONDUIT?: string;
  splitter?: string; SPLITTER?: string;
  port?: string; PORT?: string;
  bmo_id?: string; BMO_ID?: string;
  fb_id?: string; FB_ID?: string;
  index?: number;
}

interface ConstructionWork {
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  subtotal: number;
}

interface AsBuiltData {
  srId: string;
  address: string;
  // GIS fields
  bepId: string;
  conduit: string;        // from GIS CONDUIT
  splitter: string;       // from GIS BEP TEMPLATE
  bmoId: string;
  isNewInfrastructure: boolean; // ΝΕΑ ΥΠΟΔΟΜΗ -> U25 = 'ΝΑΙ'
  trenchLengthM: number;       // -> U30
  // Floor details for port-to-FB mapping
  floorBoxes: FloorBox[];
  // Optical paths (raw, will be expanded with ports 1-12)
  opticalPathsRaw: OpticalPathRaw[];
  // Sketch image
  sketchImageUrl: string | null;
  // Construction works for ΕΡΓΑΣΙΕΣ sheet
  works: ConstructionWork[];
}

/* ────────────────────────────────────────────
   Data Fetching
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

  // 3. Construction + works
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
      code: w.work_pricing?.code || "",
      description: w.work_pricing?.description || "",
      quantity: w.quantity || 0,
      unit: w.work_pricing?.unit || "τεμ.",
      unit_price: w.unit_price || 0,
      subtotal: w.subtotal || 0,
    }));
  }

  // 4. Inspection report (sketch)
  const { data: inspection } = await supabase
    .from("inspection_reports")
    .select("sketch_notes")
    .eq("assignment_id", assignment.id)
    .maybeSingle();

  // Parse GIS fields
  const rawPaths = (gisData?.optical_paths as OpticalPathRaw[]) || [];
  const floorDetails = (gisData?.floor_details as any[]) || [];
  const gisWorks = (gisData?.gis_works as any[]) || [];

  const conduit = gisData?.conduit || "";
  const splitter = gisData?.bep_template || "";
  const bepId = rawPaths[0]?.bep_id || rawPaths[0]?.BEP_ID || gisData?.associated_bcp || "";
  const bmoId = rawPaths[0]?.bmo_id || rawPaths[0]?.BMO_ID || gisData?.bmo_type || "";

  // Determine if new infrastructure
  const areaType = gisData?.area_type || "";
  const entryWork = gisWorks.find((w: any) => w.key === "entry_type")?.value || "";
  const isNewInfrastructure =
    areaType.toUpperCase().includes("ΝΕΑ ΥΠΟΔΟΜΗ") ||
    entryWork.toUpperCase().includes("ΝΕΑ");

  // Trench length
  const trenchLengthM = Number(
    gisWorks.find((w: any) => w.key === "trench_length_m")?.value ||
    gisData?.distance_from_cabinet ||
    0
  );

  // Floor boxes from floor_details
  const floorBoxes: FloorBox[] = floorDetails.map((fd: any) => ({
    floor: fd.floor ?? fd.FLOOR ?? "",
    fb_id: fd.fb_id ?? fd.FB_ID ?? fd.floorbox ?? "",
  }));

  return {
    srId: assignment.sr_id,
    address: assignment.address || "",
    bepId,
    conduit,
    splitter,
    bmoId,
    isNewInfrastructure,
    trenchLengthM,
    floorBoxes,
    opticalPathsRaw: rawPaths,
    sketchImageUrl: inspection?.sketch_notes || null,
    works,
  };
}

/* ────────────────────────────────────────────
   Optical Path Label Builder
   Formula: {BEP_ID}({CONDUIT})_{SPLITTER}.{PORT}_{INDEX}_{BMO_ID}_{FB_ID}
   Loop ports 1-12, match to floor boxes
   ──────────────────────────────────────────── */

function buildOpticalPathLabels(data: AsBuiltData): string[] {
  const labels: string[] = [];
  const maxPorts = 12;

  for (let port = 1; port <= maxPorts; port++) {
    // Match port to floor box (by index)
    const fb = data.floorBoxes[port - 1];
    const fbId = fb?.fb_id || "";

    const label = [
      `${data.bepId}(${data.conduit})`,
      `${data.splitter}.${port}`,
      `${port}`,
      data.bmoId,
      fbId,
    ].join("_");

    labels.push(label);
  }

  return labels;
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
   Main Generator
   ──────────────────────────────────────────── */

export async function generateAsBuilt(srId: string): Promise<void> {
  // 1. Fetch all data
  const data = await fetchAsBuiltData(srId);

  // 2. Load template
  const templateResp = await fetch("/templates/construction_template.xlsx");
  if (!templateResp.ok) {
    throw new Error("Δεν βρέθηκε το template AS-BUILD. Βεβαιωθείτε ότι υπάρχει στο /templates/construction_template.xlsx");
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await templateResp.arrayBuffer());

  /* ── Sheet 1: AS build-Επιμέτρηση ── */
  const epSheet =
    workbook.getWorksheet("AS build-Επιμέτρηση") ||
    workbook.getWorksheet("Επιμέτρηση") ||
    workbook.worksheets[0];

  if (epSheet) {
    // Basic fields
    epSheet.getCell("E4").value = data.srId;
    epSheet.getCell("F4").value = data.address;

    // U25: ΝΑΙ if ΝΕΑ ΥΠΟΔΟΜΗ
    epSheet.getCell("U25").value = data.isNewInfrastructure ? "ΝΑΙ" : "";

    // U30: trench length
    epSheet.getCell("U30").value = data.trenchLengthM || "";

    // Image injection – ΟΡΙΖΟΝΤΟΓΡΑΦΙΑ section
    if (data.sketchImageUrl) {
      const imgBuf = await fetchImageBuffer(data.sketchImageUrl);
      if (imgBuf) {
        const imgId = workbook.addImage({ buffer: imgBuf, extension: "png" });
        epSheet.addImage(imgId, {
          tl: { col: 0, row: 34 } as any,
          br: { col: 19, row: 54 } as any,
        });
      }
    }
  }

  /* ── Sheet 2 & 3: LABELS BEP / LABELS BMO ── */
  const labels = buildOpticalPathLabels(data);

  const fillLabelsSheet = (sheetName: string) => {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return;
    const startRow = 2; // row 1 = header
    labels.forEach((label, idx) => {
      sheet.getCell(startRow + idx, 1).value = label;
    });
  };

  fillLabelsSheet("LABELS BEP");
  fillLabelsSheet("LABELS BMO");

  /* ── Sheet 4: ΕΡΓΑΣΙΕΣ (Auto-Billing works) ── */
  const worksSheet = workbook.getWorksheet("ΕΡΓΑΣΙΕΣ");
  if (worksSheet && data.works.length > 0) {
    const startRow = 2; // row 1 = header assumed
    data.works.forEach((w, idx) => {
      const row = startRow + idx;
      worksSheet.getCell(row, 1).value = w.code;         // A: Κωδικός
      worksSheet.getCell(row, 2).value = w.description;  // B: Περιγραφή
      worksSheet.getCell(row, 3).value = w.unit;         // C: ΜΜ
      worksSheet.getCell(row, 4).value = w.quantity;      // D: Ποσότητα
      worksSheet.getCell(row, 5).value = w.unit_price;    // E: Τιμή μονάδας
      worksSheet.getCell(row, 6).value = w.subtotal;      // F: Σύνολο
    });
  }

  /* ── Generate & Download ── */
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
}
