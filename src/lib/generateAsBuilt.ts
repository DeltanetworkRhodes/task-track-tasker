import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

interface AsBuiltData {
  srId: string;
  address: string;
  entryType: string;       // Είδος Εισαγωγής -> U25
  newPipe: string;         // Νέα Σωλήνωση -> U30
  ballMarker: string;      // Ball Marker -> U26
  opticalPaths: Array<{
    bep_id: string;
    conduit: string;
    splitter: string;
    port: string;
    bmo_id: string;
    fb_id: string;
  }>;
  sketchImageUrl: string | null;
}

/**
 * Fetches all necessary data for AS-BUILD generation from Supabase
 */
async function fetchAsBuiltData(srId: string): Promise<AsBuiltData> {
  // Fetch assignment
  const { data: assignment, error: aErr } = await supabase
    .from("assignments")
    .select("*")
    .eq("sr_id", srId)
    .maybeSingle();
  if (aErr) throw new Error(`Assignment fetch error: ${aErr.message}`);
  if (!assignment) throw new Error(`Δεν βρέθηκε ανάθεση για SR: ${srId}`);

  // Fetch GIS data
  const { data: gisData, error: gErr } = await supabase
    .from("gis_data")
    .select("*")
    .eq("assignment_id", assignment.id)
    .maybeSingle();
  if (gErr) throw new Error(`GIS data fetch error: ${gErr.message}`);

  // Fetch inspection report for sketch
  const { data: inspection, error: iErr } = await supabase
    .from("inspection_reports")
    .select("sketch_notes, engineer_signature")
    .eq("assignment_id", assignment.id)
    .maybeSingle();

  // Parse optical paths from GIS data
  const rawPaths = (gisData?.optical_paths as any[]) || [];
  const opticalPaths = rawPaths.map((p: any) => ({
    bep_id: p.bep_id || p.BEP_ID || "",
    conduit: p.conduit || p.CONDUIT || "",
    splitter: p.splitter || p.SPLITTER || "",
    port: p.port || p.PORT || "",
    bmo_id: p.bmo_id || p.BMO_ID || "",
    fb_id: p.fb_id || p.FB_ID || "",
  }));

  // Parse GIS works for measurement fields
  const gisWorks = (gisData?.gis_works as any[]) || [];
  const entryType = gisWorks.find((w: any) => w.key === "entry_type")?.value || gisData?.bep_type || "";
  const newPipe = gisWorks.find((w: any) => w.key === "new_pipe")?.value || gisData?.conduit || "";
  const ballMarker = gisWorks.find((w: any) => w.key === "ball_marker")?.value || "";

  // Get sketch image URL from survey files
  let sketchImageUrl: string | null = null;
  if (inspection?.sketch_notes) {
    // sketch_notes might contain a storage path reference
    sketchImageUrl = inspection.sketch_notes;
  }

  return {
    srId: assignment.sr_id,
    address: assignment.address || "",
    entryType,
    newPipe,
    ballMarker,
    opticalPaths,
    sketchImageUrl,
  };
}

/**
 * Composes optical path label string:
 * [BEP_ID]([CONDUIT])_[SPLITTER].[PORT]_[BMO_ID]_[FB_ID]
 */
function composeOpticalPathLabel(path: AsBuiltData["opticalPaths"][0]): string {
  return `${path.bep_id}(${path.conduit})_${path.splitter}.${path.port}_${path.bmo_id}_${path.fb_id}`;
}

/**
 * Fetches image as ArrayBuffer from a URL or Supabase storage path
 */
async function fetchImageBuffer(urlOrPath: string): Promise<ArrayBuffer | null> {
  try {
    // If it's a data URL (base64 signature/sketch)
    if (urlOrPath.startsWith("data:")) {
      const base64 = urlOrPath.split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }

    // If it's a supabase storage path
    if (!urlOrPath.startsWith("http")) {
      const { data } = supabase.storage.from("surveys").getPublicUrl(urlOrPath);
      if (data?.publicUrl) {
        const resp = await fetch(data.publicUrl);
        return resp.arrayBuffer();
      }
      return null;
    }

    // Direct URL
    const resp = await fetch(urlOrPath);
    return resp.arrayBuffer();
  } catch {
    console.warn("Could not fetch image:", urlOrPath);
    return null;
  }
}

/**
 * Main AS-BUILD generation function - runs client-side
 * Loads a template from /public/templates/, fills it with data, and triggers download
 */
export async function generateAsBuilt(srId: string): Promise<void> {
  // 1. Fetch data
  const data = await fetchAsBuiltData(srId);

  // 2. Load template
  const templateUrl = "/templates/construction_template.xlsx";
  const templateResp = await fetch(templateUrl);
  if (!templateResp.ok) {
    throw new Error("Δεν βρέθηκε το template AS-BUILD. Βεβαιωθείτε ότι υπάρχει στο /templates/construction_template.xlsx");
  }
  const templateBuffer = await templateResp.arrayBuffer();

  // 3. Open workbook with ExcelJS
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);

  // 4. Fill "Επιμέτρηση" sheet
  const epimetrisiSheet = workbook.getWorksheet("Επιμέτρηση") || workbook.worksheets[0];
  if (epimetrisiSheet) {
    // SR ID -> E4
    epimetrisiSheet.getCell("E4").value = data.srId;
    // Address -> F4
    epimetrisiSheet.getCell("F4").value = data.address;
    // Είδος Εισαγωγής -> U25
    epimetrisiSheet.getCell("U25").value = data.entryType;
    // Ball Marker -> U26
    epimetrisiSheet.getCell("U26").value = data.ballMarker;
    // Νέα Σωλήνωση -> U30
    epimetrisiSheet.getCell("U30").value = data.newPipe;

    // 5. Image injection (Σκαρίφημα) in "ΟΡΙΖΟΝΤΟΓΡΑΦΙΑ" section
    if (data.sketchImageUrl) {
      const imgBuffer = await fetchImageBuffer(data.sketchImageUrl);
      if (imgBuffer) {
        const imageId = workbook.addImage({
          buffer: imgBuffer,
          extension: "png",
        });
        // Place in the ΟΡΙΖΟΝΤΟΓΡΑΦΙΑ area (approximate rows 35-55, columns A-T)
        epimetrisiSheet.addImage(imageId, {
          tl: { col: 0, row: 34 },
          br: { col: 19, row: 54 },
        });
      }
    }
  }

  // 6. Fill "LABELS BEP" sheet
  const labelsBepSheet = workbook.getWorksheet("LABELS BEP");
  if (labelsBepSheet && data.opticalPaths.length > 0) {
    // Find the OPTICAL PATH column (usually column A or B, starting from row 2)
    const startRow = 2;
    data.opticalPaths.forEach((path, idx) => {
      const label = composeOpticalPathLabel(path);
      labelsBepSheet.getCell(startRow + idx, 1).value = label;
    });
  }

  // 7. Fill "LABELS BMO" sheet
  const labelsBmoSheet = workbook.getWorksheet("LABELS BMO");
  if (labelsBmoSheet && data.opticalPaths.length > 0) {
    const startRow = 2;
    data.opticalPaths.forEach((path, idx) => {
      const label = composeOpticalPathLabel(path);
      labelsBmoSheet.getCell(startRow + idx, 1).value = label;
    });
  }

  // 8. Generate and download
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
