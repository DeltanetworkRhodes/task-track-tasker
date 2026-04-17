import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

/* ─────────────────────────────────────────────────────────
   ΦΥΛΛΟ ΑΠΟΛΟΓΙΣΜΟΥ ΕΡΓΑΣΙΩΝ FTTH Β ΦΑΣΗ
   Γεμίζει το επίσημο template από public/templates/apologismos_template.xlsx
   ───────────────────────────────────────────────────────── */

export interface ApologismosResult {
  buffer: ArrayBuffer | null;
  warnings: string[];
}

const TEMPLATE_URL = "/templates/apologismos_template.xlsx";

// Header cells in template
const CELLS = {
  SR_ID: "G3",
  SES_ID: "G4",
  DATE: "G5",
  ADDRESS: "G6",
  ROUTING: "G7",
  FLOORS: "G8",
  AREA: "E3",
  AK: "B6",
  CAB: "B7",
  ANAMONI: "B8",
  // Routes (KOI lengths)
  ROUTE_CAB_BEP_UNDER: "L4",       // FTTH ΥΠΟΓ ΔΔ (Cabin to BEP)
  ROUTE_CAB_BEP_AERIAL: "L5",      // ΕΝΑΕΡΙΟ FTTH ΔΔ
  ROUTE_BEP_FB: "L6",              // ΕΝΑΕΡΙΟ FTTH ΣΥΝΔΡΟΜ.
  ROUTE_INHOUSE: "L7",             // FTTH INHOUSE
  TOTAL_KOI: "O6",
};

/**
 * Find row in template B-column matching the work code.
 * Returns row number for H column (quantity).
 */
function findWorkRow(ws: ExcelJS.Worksheet, code: string): number | null {
  const normalized = (code || "").trim();
  if (!normalized) return null;
  for (let row = 11; row <= 120; row++) {
    const cellVal = ws.getCell(`B${row}`).value;
    if (cellVal && String(cellVal).trim() === normalized) {
      return row;
    }
  }
  return null;
}

/**
 * Find row in template J-column matching material KAY code.
 * Returns row number for M column (quantity).
 */
function findMaterialRow(ws: ExcelJS.Worksheet, kayCode: string): number | null {
  const normalized = (kayCode || "").trim();
  if (!normalized) return null;
  for (let row = 11; row <= 90; row++) {
    const cellVal = ws.getCell(`J${row}`).value;
    if (cellVal && String(cellVal).trim() === normalized) {
      return row;
    }
  }
  return null;
}

export async function generateApologismos(srId: string): Promise<ApologismosResult> {
  const warnings: string[] = [];

  try {
    // 1. Fetch construction + assignment
    const { data: construction, error: cErr } = await supabase
      .from("constructions")
      .select("*, assignments!inner(*)")
      .eq("sr_id", srId)
      .maybeSingle();

    if (cErr || !construction) {
      return { buffer: null, warnings: [`Δεν βρέθηκε κατασκευή για ${srId}: ${cErr?.message || ""}`] };
    }

    const assignment = (construction as any).assignments;

    // 2. Fetch construction_works (with work_pricing for code)
    const { data: works } = await supabase
      .from("construction_works")
      .select("quantity, work_pricing(code, description)")
      .eq("construction_id", (construction as any).id);

    // 3. Fetch construction_materials (with materials.code = KAY)
    const { data: materials } = await supabase
      .from("construction_materials")
      .select("quantity, materials(code, name)")
      .eq("construction_id", (construction as any).id);

    // 4. Load template
    const resp = await fetch(TEMPLATE_URL);
    if (!resp.ok) {
      return { buffer: null, warnings: [`Αποτυχία φόρτωσης template (HTTP ${resp.status})`] };
    }
    const templateBuffer = await resp.arrayBuffer();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(templateBuffer);
    const ws = wb.getWorksheet("ΦΥΛΛΟ ΑΠΟΛΟΓΙΣΜΟΥ FTTH") || wb.worksheets[0];
    if (!ws) {
      return { buffer: null, warnings: ["Δεν βρέθηκε το φύλλο εργασίας στο template"] };
    }

    // 5. Fill HEADER
    ws.getCell(CELLS.SR_ID).value = srId;
    ws.getCell(CELLS.SES_ID).value = (construction as any).ses_id || "";
    ws.getCell(CELLS.DATE).value = new Date().toLocaleDateString("el-GR");
    ws.getCell(CELLS.ADDRESS).value = assignment?.address || "";
    ws.getCell(CELLS.ROUTING).value = (construction as any).routing_type || "";
    ws.getCell(CELLS.FLOORS).value = (construction as any).floors || 0;
    ws.getCell(CELLS.AREA).value = assignment?.area || "";
    ws.getCell(CELLS.AK).value = (construction as any).ak || "";
    ws.getCell(CELLS.CAB).value = (construction as any).cab || assignment?.cab || "";

    // 6. Fill ROUTES (KOI lengths) from construction.routes JSONB
    const routes = Array.isArray((construction as any).routes) ? (construction as any).routes : [];
    // routes structure: [{koi}, {koi}, ...] in order: cab→bep underground, cab→bep aerial, bep→fb, inhouse
    if (routes[0]?.koi) ws.getCell(CELLS.ROUTE_CAB_BEP_UNDER).value = Number(routes[0].koi) || 0;
    if (routes[1]?.koi) ws.getCell(CELLS.ROUTE_CAB_BEP_AERIAL).value = Number(routes[1].koi) || 0;
    if (routes[2]?.koi) ws.getCell(CELLS.ROUTE_BEP_FB).value = Number(routes[2].koi) || 0;
    if (routes[3]?.koi) ws.getCell(CELLS.ROUTE_INHOUSE).value = Number(routes[3].koi) || 0;

    // 7. Fill WORKS (column H) by matching code → row in B
    let worksMatched = 0;
    let worksUnmatched = 0;
    for (const w of works || []) {
      const code = (w as any).work_pricing?.code;
      const qty = Number((w as any).quantity) || 0;
      if (!code || qty === 0) continue;
      const row = findWorkRow(ws, code);
      if (row) {
        ws.getCell(`H${row}`).value = qty;
        worksMatched++;
      } else {
        worksUnmatched++;
        warnings.push(`Εργασία ${code} δεν βρέθηκε στο template`);
      }
    }

    // 8. Fill MATERIALS (column M) by matching KAY → row in J
    let materialsMatched = 0;
    let materialsUnmatched = 0;
    for (const m of materials || []) {
      const kay = (m as any).materials?.code;
      const qty = Number((m as any).quantity) || 0;
      if (!kay || qty === 0) continue;
      const row = findMaterialRow(ws, kay);
      if (row) {
        // Only set if cell is empty (don't overwrite formulas like =M17*0.05)
        const existing = ws.getCell(`M${row}`).value;
        const isFormula = existing && typeof existing === "object" && "formula" in (existing as any);
        if (!isFormula) {
          ws.getCell(`M${row}`).value = qty;
        }
        materialsMatched++;
      } else {
        materialsUnmatched++;
        warnings.push(`Υλικό ${kay} δεν βρέθηκε στο template`);
      }
    }

    console.log(
      `[Apologismos] Works: ${worksMatched} matched, ${worksUnmatched} unmatched. Materials: ${materialsMatched} matched, ${materialsUnmatched} unmatched.`
    );

    if (worksMatched === 0 && materialsMatched === 0) {
      warnings.push("Δεν αντιστοιχίστηκε καμία εργασία ή υλικό στο template");
    }

    // 9. Export buffer
    const buffer = await wb.xlsx.writeBuffer();
    return { buffer: buffer as ArrayBuffer, warnings };
  } catch (err: any) {
    console.error("[Apologismos] Generation failed:", err);
    return { buffer: null, warnings: [`Σφάλμα: ${err.message || err}`] };
  }
}
