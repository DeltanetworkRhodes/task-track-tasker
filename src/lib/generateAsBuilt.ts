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
  dehNanotronix: boolean;
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
  bcpPlacement: string;
  bcpKind: string;
  bcpBepCableType: string;
  bcpBepLength: number;
  verticalRouting: string;
  escalitType: string;
  bcpType: string;
  totalCableLength: number;
  technicianName: string;
  akId: string;
  sesId: string;
  exportDate: string;
  additionalBcpConnections: { placement: string; kind: string; cableType: string; length: number }[];
  verticalInfra?: string;
  ballMarkerBep?: number | string;
  msCount?: number | string;
  otdrPositions?: { pos: number; a: any; b: any; c: any; d: any }[];
  floorMeters?: { floor: string; meters: any; pipe_type: string }[];
  koiTypeCabBep?: string;
  koiTypeCabBcp?: string;
  koiCabBepLength?: number;
  koiCabBcpLength?: number;
  s6?: any;
  bepPhotoUrl?: string | null;
  bmoPhotoUrl?: string | null;
  bcpPhotoUrl?: string | null;
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

  let technicianName = "";
  if (assignment.technician_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", assignment.technician_id)
      .maybeSingle();
    technicianName = profile?.full_name || "";
  }

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

  const rawData = (gisData?.raw_data as any) || {};
  const bcpPlacement = rawData.bcp_placement || rawData["ΣΗΜΕΙΟ ΤΟΠΟΘΕΤΗΣΗΣ"] || "";
  const bcpKind = rawData.bcp_kind || rawData["ΕΙΔΟΣ"] || "";
  const bcpBepCableType = rawData.bcp_bep_cable_type || rawData["ΤΥΠΟΣ ΚΟΙ ΣΥΝΔΕΣΗ ΒCP ΜΕ BEP"] || "";
  const bcpBepLength = Number(rawData.bcp_bep_length || rawData["ΜΗΚΟΣ BCP-BEP"] || 0);
  const verticalRouting = rawData.vertical_routing || rawData["Είδος κάθετης υποδομής"] || "";
  const escalitType = rawData.escalit_type || rawData["ΕΣΚΑΛΗΤ"] || "";
  const bcpTypeOriz = rawData.bcp_type_oriz || rawData["BCP ΕΙΔΟΣ"] || "";

  const additionalBcpConnections: { placement: string; kind: string; cableType: string; length: number }[] = [];
  const bcpArray = rawData.bcp_connections || rawData["BCP_CONNECTIONS"] || [];
  if (Array.isArray(bcpArray)) {
    bcpArray.forEach((bcp: any) => {
      additionalBcpConnections.push({
        placement: bcp.placement || bcp["ΣΗΜΕΙΟ ΤΟΠΟΘΕΤΗΣΗΣ"] || "",
        kind: bcp.kind || bcp["ΕΙΔΟΣ"] || "",
        cableType: bcp.cable_type || bcp["ΤΥΠΟΣ ΚΟΙ"] || "",
        length: Number(bcp.length || bcp["ΜΗΚΟΣ"] || 0),
      });
    });
  }

  const verticalMeters = floorBoxes.reduce((sum, fb) => sum + (fb.meters || 0), 0);
  const totalCableLength = Number(gisData?.distance_from_cabinet || 0) + verticalMeters;

  // Fetch first photo URLs (BEP, BMO, BCP) from storage — bucket is private, use signed URLs
  const constructionId = construction?.id || "";
  const safeSrId = srId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const storagePrefix = `constructions/${safeSrId}/${constructionId}`;
  let bepPhotoUrl: string | null = null;
  let bmoPhotoUrl: string | null = null;
  let bcpPhotoUrl: string | null = null;

  async function getFirstPhotoSignedUrl(folder: string): Promise<string | null> {
    try {
      const { data: files, error: listErr } = await supabase.storage
        .from("photos")
        .list(`${storagePrefix}/${folder}`, { limit: 100 });
      if (listErr) {
        console.warn(`[AS-BUILD] list ${folder} error:`, listErr);
        return null;
      }
      const imageFiles = (files || []).filter(f =>
        /\.(jpe?g|png|webp)$/i.test(f.name)
      );
      if (imageFiles.length === 0) {
        console.log(`[AS-BUILD] No photos found in ${folder}`);
        return null;
      }
      // Sort by name (timestamp prefix) ascending → first uploaded
      imageFiles.sort((a, b) => a.name.localeCompare(b.name));
      const path = `${storagePrefix}/${folder}/${imageFiles[0].name}`;
      const { data: signed, error: signErr } = await supabase.storage
        .from("photos")
        .createSignedUrl(path, 60 * 10); // 10 minutes
      if (signErr || !signed?.signedUrl) {
        console.warn(`[AS-BUILD] sign ${folder} error:`, signErr);
        return null;
      }
      console.log(`[AS-BUILD] ✅ ${folder} photo:`, path);
      return signed.signedUrl;
    } catch (e) {
      console.warn(`[AS-BUILD] ${folder} photo fetch failed:`, e);
      return null;
    }
  }

  if (constructionId) {
    [bepPhotoUrl, bmoPhotoUrl, bcpPhotoUrl] = await Promise.all([
      getFirstPhotoSignedUrl("BEP"),
      getFirstPhotoSignedUrl("BMO"),
      getFirstPhotoSignedUrl("BCP"),
    ]);
  } else {
    console.warn("[AS-BUILD] No constructionId — skipping photo fetch");
  }

  // ── DRIVE FALLBACK ──────────────────────────────────────
  // Αν λείπει κάποια φωτό από Supabase, ψάξε στο Google Drive folder του SR
  if (!bepPhotoUrl || !bmoPhotoUrl || !bcpPhotoUrl) {
    try {
      console.log("[AS-BUILD] 🔍 Drive fallback for missing photos...");
      const { data: driveData, error: driveErr } = await supabase.functions.invoke(
        "google-drive-files",
        { body: { action: "sr_folder", sr_id: srId } }
      );

      if (driveErr) {
        console.warn("[AS-BUILD] Drive fallback error:", driveErr);
      } else if (driveData?.found && driveData?.subfolders) {
        const subfolders = driveData.subfolders as Record<string, { id: string; files: any[] }>;

        // Βρες subfolder που ταιριάζει με keyword (case-insensitive)
        const findFolderFiles = (keyword: string): any[] => {
          const kw = keyword.toUpperCase();
          for (const [name, info] of Object.entries(subfolders)) {
            if (name.toUpperCase().includes(kw)) {
              return info.files || [];
            }
          }
          return [];
        };

        const isImage = (f: any) => {
          const n = (f.name || "").toLowerCase();
          const m = (f.mimeType || "").toLowerCase();
          return /\.(jpe?g|png|webp)$/i.test(n) || m.startsWith("image/");
        };

        // Κατέβασμα πρώτης εικόνας μέσω edge function (επιστρέφει public_url)
        const downloadFirst = async (files: any[]): Promise<string | null> => {
          const imgs = files.filter(isImage).sort((a, b) =>
            (a.name || "").localeCompare(b.name || "")
          );
          if (imgs.length === 0) return null;
          try {
            const { data, error } = await supabase.functions.invoke(
              "google-drive-files",
              { body: { action: "download", file_id: imgs[0].id } }
            );
            if (error || !data?.public_url) {
              console.warn("[AS-BUILD] Drive download failed:", error);
              return null;
            }
            return data.public_url;
          } catch (e) {
            console.warn("[AS-BUILD] Drive download exception:", e);
            return null;
          }
        };

        if (!bepPhotoUrl) {
          const files = findFolderFiles("BEP");
          if (files.length > 0) {
            bepPhotoUrl = await downloadFirst(files);
            if (bepPhotoUrl) console.log("[AS-BUILD] ✅ BEP photo from Drive");
          }
        }
        if (!bmoPhotoUrl) {
          const files = findFolderFiles("BMO");
          if (files.length > 0) {
            bmoPhotoUrl = await downloadFirst(files);
            if (bmoPhotoUrl) console.log("[AS-BUILD] ✅ BMO photo from Drive");
          }
        }
        if (!bcpPhotoUrl) {
          const files = findFolderFiles("BCP");
          if (files.length > 0) {
            bcpPhotoUrl = await downloadFirst(files);
            if (bcpPhotoUrl) console.log("[AS-BUILD] ✅ BCP photo from Drive");
          }
        }

        // Αν ακόμα δεν υπάρχει BMO αλλά υπάρχει BCP → fallback σε BCP
        if (!bmoPhotoUrl && bcpPhotoUrl) {
          bmoPhotoUrl = bcpPhotoUrl;
          console.log("[AS-BUILD] ↪ Using BCP photo as BMO fallback");
        }
      } else {
        console.warn("[AS-BUILD] Drive folder not found for SR", srId);
      }
    } catch (e) {
      console.warn("[AS-BUILD] Drive fallback exception:", e);
    }
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
    dehNanotronix: gisData?.deh_nanotronix || false,
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
    technicianName,
    akId: construction?.ak || "",
    sesId: construction?.ses_id || "",
    exportDate: new Date().toLocaleDateString("el-GR"),
    additionalBcpConnections,
    verticalInfra: (construction as any)?.vertical_infra || "ΙΣ",
    ballMarkerBep: (construction as any)?.ball_marker_bep ?? "",
    msCount: (construction as any)?.ms_count ?? "",
    otdrPositions: ((construction as any)?.otdr_positions as any[]) || [],
    floorMeters: ((construction as any)?.floor_meters as any[]) || [],
    koiTypeCabBep: (construction as any)?.koi_type_cab_bep || "4' μ cable",
    koiTypeCabBcp: (construction as any)?.koi_type_cab_bcp || "4' μ cable",
    koiCabBepLength: Number(
      (Array.isArray((construction as any)?.routes) && (construction as any).routes[0]?.koi) || 0
    ),
    koiCabBcpLength: Number(
      (Array.isArray((construction as any)?.routes) && (construction as any).routes[1]?.koi) || 0
    ),
    s6: (construction as any)?.asbuilt_section6 || {},
    bepPhotoUrl,
    bmoPhotoUrl,
    bcpPhotoUrl,
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
   Styling helpers
   ──────────────────────────────────────────── */

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };

function styleHeaderRow(ws: ExcelJS.Worksheet, colCount: number) {
  const row = ws.getRow(1);
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }
  ws.views = [{ state: "frozen" as const, ySplit: 1, xSplit: 0, topLeftCell: "A2", activeCell: "A2" }];
}

/* ────────────────────────────────────────────
   Sheet 1: ΚΤΗΡΙΟ
   ──────────────────────────────────────────── */

const KTIRIO_HEADERS = [
  "SRId", "BUILDING ID", "AREA TYPE", "ΟΡΟΦΟΙ",
  "ΟΡΟΦΟΣ ΠΕΛΑΤΗ", "ΟΡΟΦΟΣ BEP", "ΥΠΟΓΡΑΦΗ ΔΙΑΧΕΙΡΙΣΤΗ",
  "BEP ONLY", "BEP TEMPLATE", "BEP TYPE", "BMO TYPE",
  "ΥΠΟΔΟΜΗ ΑΠΟ ΔΕΗ-ΚΑΤΑΣΚΕΥΗ ΜΕ NANOTRONIX",
  "NANOTRONIX", "SMART READINESS", "ΣΥΣΧΕΤΙΣΜΕΝΟ BCP",
  "ΚΟΝΤΙΝΟ BCP", "ΝΕΟ BCP", "CONDUIT",
  "ΑΠΟΣΤΑΣΗ ΑΠΟ ΚΑΜΠΙΝΑ", "LATITUDE", "LONGITUDE",
  "NOTES", "WARNING", "FAILURE",
];

function buildKtirioSheet(wb: ExcelJS.Workbook, d: AsBuiltData) {
  const ws = wb.addWorksheet("ΚΤΗΡΙΟ");
  KTIRIO_HEADERS.forEach((h, i) => { ws.getCell(1, i + 1).value = h; });
  styleHeaderRow(ws, KTIRIO_HEADERS.length);

  const vals: (string | number | boolean)[] = [
    d.srId, d.buildingId, d.areaType, d.floors, d.customerFloor, d.bepFloor,
    d.adminSignature, d.bepOnly, d.bepTemplate, d.bepType, d.bmoType,
    d.dehNanotronix, d.nanotronix, d.smartReadiness,
    d.associatedBcp, d.nearbyBcp, d.newBcp, d.conduit,
    d.distanceFromCabinet, d.latitude, d.longitude,
    d.notes, d.warning, d.failure,
  ];
  vals.forEach((v, i) => { ws.getCell(2, i + 1).value = v as any; });

  // Auto-width
  KTIRIO_HEADERS.forEach((h, i) => {
    ws.getColumn(i + 1).width = Math.max(h.length + 2, 14);
  });
}

/* ────────────────────────────────────────────
   Sheet 2: ΟΡΟΦΟΙ
   ──────────────────────────────────────────── */

const OROFOI_HEADERS = [
  "ΟΡΟΦΟΣ", "ΔΙΑΜΕΡΙΣΜΑΤΑ", "ΚΑΤΑΣΤΗΜΑΤΑ",
  "FB01", "FB01 TYPE", "FB02", "FB02 TYPE",
  "FB03", "FB03 TYPE", "FB04", "FB04 TYPE",
  "FB ΠΕΛΑΤΗ", "ΑΡΙΘΜΗΣΗ ΧΩΡΟΥ ΠΕΛΑΤΗ", "GIS ID",
];

function buildOrofoiSheet(wb: ExcelJS.Workbook, d: AsBuiltData) {
  const ws = wb.addWorksheet("ΟΡΟΦΟΙ");
  OROFOI_HEADERS.forEach((h, i) => { ws.getCell(1, i + 1).value = h; });
  styleHeaderRow(ws, OROFOI_HEADERS.length);

  d.floorDetails.forEach((fd, idx) => {
    const r = 2 + idx;
    ws.getCell(r, 1).value = fd.floor as any;
    ws.getCell(r, 2).value = fd.apartments;
    ws.getCell(r, 3).value = fd.shops;
    ws.getCell(r, 4).value = fd.fb_count;
    ws.getCell(r, 5).value = fd.fb_type;
    ws.getCell(r, 6).value = fd.fb02_count || "";
    ws.getCell(r, 7).value = fd.fb02_type || "";
    ws.getCell(r, 8).value = fd.fb03_count || "";
    ws.getCell(r, 9).value = fd.fb03_type || "";
    ws.getCell(r, 10).value = fd.fb04_count || "";
    ws.getCell(r, 11).value = fd.fb04_type || "";
    ws.getCell(r, 12).value = fd.fb_customer || "";
    ws.getCell(r, 13).value = fd.customer_space || "";
    ws.getCell(r, 14).value = fd.fb_id || "";
  });

  OROFOI_HEADERS.forEach((h, i) => {
    ws.getColumn(i + 1).width = Math.max(h.length + 2, 12);
  });
}

/* ────────────────────────────────────────────
   Sheet 3: OPTICAL PATHS
   ──────────────────────────────────────────── */

const OPTICAL_HEADERS = ["OPTICAL PATH TYPE", "OPTICAL PATH", "GISID"];

function buildOpticalPathsSheet(wb: ExcelJS.Workbook, d: AsBuiltData) {
  const ws = wb.addWorksheet("OPTICAL PATHS");
  OPTICAL_HEADERS.forEach((h, i) => { ws.getCell(1, i + 1).value = h; });
  styleHeaderRow(ws, OPTICAL_HEADERS.length);

  d.opticalPaths.forEach((op, idx) => {
    const r = 2 + idx;
    ws.getCell(r, 1).value = op.type;
    ws.getCell(r, 2).value = op.path;
    ws.getCell(r, 3).value = op.gis_id || "";
  });

  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 60;
  ws.getColumn(3).width = 16;
}

/* ────────────────────────────────────────────
   Helpers for Επιμέτρηση
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
  const parts = (typeStr || "").split("/");
  if (parts.length >= 3) return parts[parts.length - 1].trim().split(" ")[0];
  if (parts.length === 2) return parts[1].trim().split(" ")[0];
  return "";
}

function getBepHeader(bepType: string): string {
  if (!bepType || !bepType.trim()) return "";
  const size = extractSizeFromType(bepType);
  const brand = extractBrandFromType(bepType);
  if (!size && !brand) return bepType;
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

function computeBepLabel(path: string, bmoFbMap: Map<string, string>): string {
  const sbMatch = path.match(/(SB\d+)\([\d:]+\)\.(\d+)/);
  const sbId = sbMatch ? sbMatch[1] : "SB01";
  const sbPort = sbMatch ? sbMatch[2] : "";
  const bmoMatch = path.match(/(BMO\d+_\d+a?)/);
  const bmoId = bmoMatch ? bmoMatch[1] : "";
  const fbPath = bmoId ? (bmoFbMap.get(bmoId) || "") : "";
  if (sbPort && fbPath && bmoId) return `${sbId}.${sbPort}_${fbPath}_${bmoId}`;
  if (sbPort && bmoId) return `${sbId}.${sbPort}_${bmoId}`;
  if (sbPort) return `${sbId}.${sbPort}__`;
  return path;
}

function extractCableIndex(path: string): string {
  const bepIdx = path.search(/B[CE]P/);
  if (bepIdx < 0) return "";
  const beforeBep = path.substring(0, bepIdx);
  const parts = beforeBep.split("_").filter(Boolean);
  for (let i = parts.length - 1; i >= 1; i--) {
    const part = parts[i];
    if (part.startsWith("SGA") || part.startsWith("SGB")) continue;
    return part;
  }
  return "";
}

/* ────────────────────────────────────────────
   Sheet 4: AS build-Επιμέτρηση (template-based)
   ──────────────────────────────────────────── */

function fillEpimetrisiSheet(ws: ExcelJS.Worksheet, d: AsBuiltData) {
  // ── 0. ΣΤΟΙΧΕΙΑ ΑΙΤΗΜΑΤΟΣ + META ──
  ws.getCell("E5").value = d.srId;
  ws.getCell("F5").value = d.address;
  // R4 είναι label "ΑΚ" στο template — ΜΗΝ το αγγίζεις
  ws.getCell("R5").value = d.akId || "";

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
  const hasCabBcp = d.opticalPaths.some((op) => op.type === "CAB-BCP");
  ws.getCell("D13").value = hasCabBcp ? "BCP" : "BEP";
  ws.getCell("E13").value = d.koiTypeCabBep || "4' μ cable";
  ws.getCell("F13").value = d.koiCabBepLength || d.totalCableLength || d.distanceFromCabinet || "";

  // ── 3a. KOI BCP-BEP section (rows 17-18+) ──
  if (hasCabBcp) {
    ws.getCell("D18").value = d.bcpPlacement || "";
    ws.getCell("E18").value = d.bcpKind || "";
    ws.getCell("F18").value = d.koiTypeCabBcp || "4' μ cable";
    ws.getCell("G18").value = d.koiCabBcpLength || d.bcpBepLength || "";
  } else {
    ws.getCell("D18").value = null;
    ws.getCell("E18").value = null;
    ws.getCell("F18").value = null;
    ws.getCell("G18").value = null;
  }
  if (d.additionalBcpConnections && d.additionalBcpConnections.length > 0) {
    d.additionalBcpConnections.forEach((bcp, idx) => {
      const r = 19 + idx;
      ws.getCell(r, 4).value = bcp.placement || "";
      ws.getCell(r, 5).value = bcp.kind || "";
      ws.getCell(r, 6).value = bcp.cableType || "";
      ws.getCell(r, 7).value = bcp.length || "";
    });
  }

  // ── 4. BEP-ΟΡΟΦΟΙ ── Rows 25-39
  // C22/D22 vertical infrastructure
  ws.getCell("C22").value = d.verticalInfra === "ΙΣ" ? "ΙΣ" : "";
  ws.getCell("D22").value = d.verticalInfra === "ΚΑΓΚΕΛΟ" ? "ΚΑΓΚΕΛΟ" : "";

  for (let r = 25; r <= 39; r++) {
    for (let c = 2; c <= 17; c++) {
      ws.getCell(r, c).value = null;
    }
  }
  d.floorDetails.forEach((fd, idx) => {
    const r = 25 + idx;
    ws.getCell(r, 2).value = fd.floor as any;
    ws.getCell(r, 3).value = fd.apartments;
    ws.getCell(r, 4).value = fd.shops;
    ws.getCell(r, 5).value = fd.fb_count;
    ws.getCell(r, 6).value = fd.fb_type;
    ws.getCell(r, 7).value = fd.fb02_count || "";
    ws.getCell(r, 8).value = fd.fb02_type || "";
    ws.getCell(r, 9).value = fd.fb03_count || "";
    ws.getCell(r, 10).value = fd.fb03_type || "";
    ws.getCell(r, 11).value = fd.fb04_count || "";
    ws.getCell(r, 12).value = fd.fb04_type || "";
    ws.getCell(r, 13).value = fd.fb_customer || "";
    ws.getCell(r, 14).value = fd.customer_space || "";
    ws.getCell(r, 15).value = fd.fb_id || "";
    // Merge floorMeters with floorDetails for P/Q (cols 16/17)
    const fm = (d.floorMeters || []).find((m) => String(m.floor) === String(fd.floor));
    ws.getCell(r, 16).value = (fm?.meters as any) || fd.meters || "";
    ws.getCell(r, 17).value = fm?.pipe_type || fd.pipe_type || "";
  });

  // ── 5. CAB-BEP OPTICAL PATHS (rows 44-47) ──
  const allCabPaths = d.opticalPaths.filter(op => op.type === "CAB-BEP" || op.type === "CAB-BCP");
  const primaryCab = allCabPaths.find(op => /SG[AB]\d+/i.test(op.path) && /SB\d+/i.test(op.path));
  const orderedCabPaths = primaryCab
    ? [primaryCab, ...allCabPaths.filter(p => p !== primaryCab)]
    : [...allCabPaths];

  for (let r = 44; r <= 47; r++) {
    ws.getCell(r, 6).value = null;
    ws.getCell(r, 7).value = null;
  }
  for (let i = 0; i < orderedCabPaths.length && i < 4; i++) {
    ws.getCell(44 + i, 6).value = orderedCabPaths[i].type;
    ws.getCell(44 + i, 7).value = orderedCabPaths[i].path;
  }

  // 5a2. BCP / BEP / BMO label tables — ΑΦΑΙΡΕΘΗΚΑΝ
  // Αντικαθίστανται από τις φωτογραφίες (BEP: col F-I, BMO/BCP: col U-Y, rows 50-67).
  // Διατηρείται μόνο ο CAB-BEP/CAB-BCP πίνακας πιο πάνω (rows 44-47).


  // ── 6. ΟΡΙΖΟΝΤΟΓΡΑΦΙΑ ──
  const s6 = d.s6 || {};
  ws.getCell("V83").value = s6.bmo_bep_distance || d.distanceFromCabinet || "";
  const eisagogiLabel: Record<string, string> = {
    "ΝΕΑ ΥΠΟΔΟΜΗ": "NEA YPODOMH",
    "ΕΣΚΑΛΗΤ": "ΕΣΚΑΛΗΤ",
    "ΕΣΚΑΛΗΤ Β1": "ΕΣΚΑΛΗΤ Β1",
    "BCP": "BCP",
  };
  ws.getCell("V85").value = eisagogiLabel[s6.eisagogi_type] || (d.isNewInfrastructure ? "NEA YPODOMH" : "");

  if (s6.eisagogi_type === "ΝΕΑ ΥΠΟΔΟΜΗ") {
    ws.getCell("V86").value = s6.ball_marker_bep || "";
    ws.getCell("V87").value = s6.ms_skamma || "";
  }
  if (s6.eisagogi_type === "ΕΣΚΑΛΗΤ") {
    ws.getCell("V89").value = "ΕΣΚΑΛΗΤ";
    ws.getCell("V90").value = s6.eskalit_ms || "";
    ws.getCell("V91").value = s6.eskalit_nea_solienosi || "";
    ws.getCell("V92").value = s6.eskalit_solienosi_eisagogis || "";
    ws.getCell("V93").value = s6.eskalit_bep || "";
  }
  if (s6.eisagogi_type === "ΕΣΚΑΛΗΤ Β1") {
    ws.getCell("V95").value = "ΕΣΚΑΛΗΤ Β1";
    ws.getCell("V96").value = s6.eskalit_b1_bep || "";
  }
  if (s6.eisagogi_type === "BCP") {
    ws.getCell("V98").value = "BCP";
    ws.getCell("V99").value = s6.bcp_eidos || "";
    ws.getCell("V100").value = s6.bcp_ball_marker || "";
    ws.getCell("V101").value = s6.bcp_ms || "";
    ws.getCell("V102").value = s6.bcp_bep_ypogeia || "";
    ws.getCell("V103").value = s6.bcp_bep_enaeria || "";
  }
}

/* ────────────────────────────────────────────
   Preview / Debug Logger
   ──────────────────────────────────────────── */

function logPreview(d: AsBuiltData) {
  console.group("📊 AS-BUILD Preview");
  console.log("SR:", d.srId, "| Address:", d.address, "| Building:", d.buildingId);
  console.log("Floors:", d.floors, "| CAB:", d.cabId, "| Conduit:", d.conduit);
  const types = ["CAB-BEP", "CAB-BCP", "BCP-BEP", "BEP-BMO", "BEP", "BMO-FB"];
  console.group("🔗 OPTICAL PATHS (first 2 per type)");
  types.forEach(t => {
    const items = d.opticalPaths.filter(op => op.type === t).slice(0, 2);
    if (items.length) console.log(`${t}:`, items.map(i => i.path));
  });
  console.groupEnd();
  console.groupEnd();
}

/* ────────────────────────────────────────────
   Filename helper
   ──────────────────────────────────────────── */

function buildFileName(srId: string, address: string): string {
  const cleanAddr = (address || "UNKNOWN")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, "_")
    .substring(0, 60);
  return `${srId}_${cleanAddr}_ASBUILT.xlsx`;
}

/* ────────────────────────────────────────────
   Main AS-BUILD Generator
   ──────────────────────────────────────────── */

export interface AsBuiltResult {
  success: boolean;
  warnings: string[];
  buffer?: ArrayBuffer;
  fileName?: string;
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
  if (!data.bepType) warnings.push("Λείπει BEP Type — τα headers εξοπλισμού θα είναι κενά");
  if (!data.bmoType) warnings.push("Λείπει BMO Type — τα headers εξοπλισμού θα είναι κενά");
  if (!data.conduit) warnings.push("Λείπει Conduit — τα optical paths δεν θα έχουν σωστό κωδικό");
  if (data.distanceFromCabinet === 0) warnings.push("Απόσταση από CAB είναι 0");
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
  logPreview(data);

  // Load template
  const templateResp = await fetch("/templates/as_build_template.xlsx");
  if (!templateResp.ok) {
    throw new Error("Δεν βρέθηκε το AS-BUILD template. Ελέγξτε ότι υπάρχει στο /templates/as_build_template.xlsx");
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await templateResp.arrayBuffer());

  // Remove all sheets except Επιμέτρηση
  const keepName = "AS build-Επιμέτρηση";
  for (const ws of [...wb.worksheets]) {
    if (ws.name !== keepName) wb.removeWorksheet(ws.id);
  }

  // Fill Επιμέτρηση
  const epSheet = wb.getWorksheet(keepName);
  if (epSheet) {
    fillEpimetrisiSheet(epSheet, data);

    // Sketch image
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
          verticalRouting: data.verticalRouting || "",
          floors: data.floors || 0,
          bepFloor: data.bepFloor || "",
        });
      } catch (e) {
        console.warn("Auto-sketch generation failed:", e);
        warnings.push("Δεν ήταν δυνατή η αυτόματη δημιουργία σκαριφήματος.");
      }
    }
    if (sketchBuf) {
      const imgId = wb.addImage({ buffer: sketchBuf, extension: "png" });
      epSheet.addImage(imgId, {
        tl: { col: 1, row: 82, nativeCol: 1, nativeRow: 82, nativeColOff: 0, nativeRowOff: 0 } as any,
        br: { col: 17, row: 101, nativeCol: 17, nativeRow: 101, nativeColOff: 0, nativeRowOff: 0 } as any,
        editAs: "twoCell",
      } as any);
    }

    // BEP photo — col F-I, row 51-67
    if (data.bepPhotoUrl) {
      const bepBuf = await fetchImageBuffer(data.bepPhotoUrl);
      if (bepBuf) {
        const ext = data.bepPhotoUrl.toLowerCase().includes(".png") ? "png" : "jpeg";
        const bepImgId = wb.addImage({ buffer: bepBuf, extension: ext as any });
        epSheet.addImage(bepImgId, {
          tl: { col: 5, row: 50 } as any,
          br: { col: 9, row: 67 } as any,
          editAs: "oneCell",
        } as any);
      }
    }

    // BMO ή BCP photo — col U-Y, row 51-67 (προτεραιότητα BMO)
    const bmoOrBcpUrl = data.bmoPhotoUrl || data.bcpPhotoUrl || null;
    if (bmoOrBcpUrl) {
      const bmoBuf = await fetchImageBuffer(bmoOrBcpUrl);
      if (bmoBuf) {
        const ext = bmoOrBcpUrl.toLowerCase().includes(".png") ? "png" : "jpeg";
        const bmoImgId = wb.addImage({ buffer: bmoBuf, extension: ext as any });
        epSheet.addImage(bmoImgId, {
          tl: { col: 20, row: 50 } as any,
          br: { col: 25, row: 67 } as any,
          editAs: "oneCell",
        } as any);
      }
    }
  }

  // Add 3 data sheets (they append after Επιμέτρηση)
  buildKtirioSheet(wb, data);
  buildOrofoiSheet(wb, data);
  buildOpticalPathsSheet(wb, data);

  // Reorder: ΚΤΗΡΙΟ, ΟΡΟΦΟΙ, OPTICAL PATHS, AS build-Επιμέτρηση
  // ExcelJS stores sheets in _worksheets array (1-indexed, slot 0 is undefined)
  const wsList = (wb as any)._worksheets as (ExcelJS.Worksheet | undefined)[];
  const ordered: ExcelJS.Worksheet[] = [];
  const nameOrder = ["ΚΤΗΡΙΟ", "ΟΡΟΦΟΙ", "OPTICAL PATHS", keepName];
  for (const n of nameOrder) {
    const found = wsList.find(ws => ws && ws.name === n);
    if (found) ordered.push(found);
  }
  // Rebuild _worksheets array
  for (let i = 0; i < wsList.length; i++) wsList[i] = undefined;
  ordered.forEach((ws, idx) => {
    wsList[idx + 1] = ws;
    (ws as any).orderNo = idx + 1;
  });

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const arrayBuf = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : (buffer as Uint8Array)).buffer as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const fileName = buildFileName(data.srId, data.address);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { success: true, warnings, buffer: arrayBuf, fileName };
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
    bmoType: "SMALL/16/RAYCAP", dehNanotronix: false, nanotronix: false, smartReadiness: false,
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
    bcpPlacement: "", bcpKind: "", bcpBepCableType: "", bcpBepLength: 0,
    verticalRouting: "ΚΑΓΚΕΛΟ", escalitType: "", bcpType: "", totalCableLength: 138,
    technicianName: "Δημήτρης Παπαδόπουλος", akId: "AK-045", sesId: "SES-101", exportDate: "", additionalBcpConnections: [],
  },
  "SR-DEMO-02": {
    srId: "SR-DEMO-02", buildingId: "BLD-IAL-015", areaType: "OTE", floors: 5,
    customerFloor: "+03", bepFloor: "+00", adminSignature: true, bepOnly: false,
    bepTemplate: "BEP 1SP 1:8(01..12) ΚΔ", bepType: "MEDIUM/12/ZTT (01..12)",
    bmoType: "SMALL/16/RAYCAP", dehNanotronix: false, nanotronix: false, smartReadiness: true,
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
    bcpPlacement: "", bcpKind: "", bcpBepCableType: "", bcpBepLength: 0,
    verticalRouting: "ΚΛΙΜΑΚΟΣΤΑΣΙΟ", escalitType: "", bcpType: "", totalCableLength: 426,
    technicianName: "Γιώργος Αντωνίου", akId: "AK-112", sesId: "SES-205", exportDate: "", additionalBcpConnections: [],
  },
  "SR-DEMO-03": {
    srId: "SR-DEMO-03", buildingId: "BLD-FAL-008", areaType: "OTE", floors: 4,
    customerFloor: "+01", bepFloor: "+00", adminSignature: true, bepOnly: false,
    bepTemplate: "BEP 1SP 1:8(01..12) ΚΔ", bepType: "MEDIUM/12/ZTT (01..12)",
    bmoType: "SMALL/16/RAYCAP", dehNanotronix: false, nanotronix: false, smartReadiness: false,
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
    bcpPlacement: "", bcpKind: "", bcpBepCableType: "", bcpBepLength: 0,
    verticalRouting: "ΚΑΓΚΕΛΟ", escalitType: "", bcpType: "", totalCableLength: 240,
    technicianName: "Νίκος Κωστόπουλος", akId: "AK-089", sesId: "SES-310", exportDate: "", additionalBcpConnections: [],
  },
  "2-334066371997": {
    srId: "2-334066371997", buildingId: "667102934", areaType: "OTE", floors: 4,
    customerFloor: "+01", bepFloor: "+00", adminSignature: true, bepOnly: false,
    bepTemplate: "BEP 1SP 1:8(01..12) ΚΔ", bepType: "MEDIUM/12/ZTT (01..12)",
    bmoType: "SMALL/16/RAYCAP", dehNanotronix: false, nanotronix: false, smartReadiness: true,
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
    bcpPlacement: "", bcpKind: "", bcpBepCableType: "", bcpBepLength: 0,
    verticalRouting: "ΚΑΓΚΕΛΟ", escalitType: "", bcpType: "", totalCableLength: 220,
    technicianName: "Κώστας Δημητρίου", akId: "AK-526", sesId: "SES-400", exportDate: "", additionalBcpConnections: [],
  },
};

export function getDemoAsBuiltData(srId: string) {
  const data = DEMO_SR_DATA[srId];
  if (data) return { ...data };
  const fallback = { ...DEMO_SR_DATA["2-334066371997"] };
  fallback.srId = srId;
  return fallback;
}
