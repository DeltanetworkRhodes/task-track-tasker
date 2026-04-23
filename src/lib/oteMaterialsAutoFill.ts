/**
 * OTE Materials Auto-Fill Engine
 * --------------------------------
 * Παράγει λίστα υλικών (code, quantity, source) με βάση:
 *  - gisData (BEP, BMO, FB, BCP, Pigtails, Patchcords)
 *  - section6 (Οριζοντογραφία → Microduct)
 *  - floorMeters (ΚΟΙ & σωλήνες ανά όροφο)
 *
 * Επιστρέφει ComputedMaterials έτοιμα για merge με manual additions.
 */

export interface MaterialsAutoFillInput {
  gisData: any;
  section6: Record<string, any> | null;
  floorMeters: Array<{
    floor: string;
    meters: string;
    pipe_type?: string;
    fo_type?: string;
  }>;
  materials: any[]; // catalog από supabase
  routes: Array<{ koi: string; fyraKoi?: string }>;
}

export interface ComputedMaterial {
  code: string;
  material_id: string;
  name: string;
  unit: string;
  price: number;
  source: string;
  quantity: number;
  reason: string;
}

function nameMatches(name: string, ...patterns: string[]): boolean {
  const upper = String(name || "").toUpperCase();
  return patterns.every((p) => upper.includes(String(p).toUpperCase()));
}

export function computeAutoMaterials(
  input: MaterialsAutoFillInput,
): ComputedMaterial[] {
  const { gisData, section6, floorMeters: _fm, materials, routes } = input;
  const items: ComputedMaterial[] = [];

  if (!materials || materials.length === 0) {
    console.warn("[computeAutoMaterials] ⚠️ No materials catalog loaded");
    return items;
  }

  const oteMaterials = materials.filter((m: any) => m.source === "OTE");
  const allMaterials = materials;

  const addMaterial = (
    match: (m: any) => boolean,
    qty: number,
    reason: string,
    sourceFilter?: string,
  ) => {
    if (qty <= 0) return;
    const pool = sourceFilter
      ? allMaterials.filter((m: any) => m.source === sourceFilter)
      : oteMaterials;
    const found = pool.find(match);
    if (found && !items.some((a) => a.material_id === found.id)) {
      items.push({
        code: found.code,
        material_id: found.id,
        name: found.name,
        unit: found.unit,
        price: Number(found.price) || 0,
        source: found.source,
        quantity: qty,
        reason,
      });
    }
  };

  // === 1. BEP (από gisData.bep_type) ===
  if (gisData?.bep_type) {
    const bepSize = String(gisData.bep_type).toUpperCase();
    if (bepSize.includes("SMALL")) {
      addMaterial((m) => nameMatches(m.name, "SMALL", "BEP"), 1, "BEP SMALL από GIS");
    } else if (bepSize.includes("MEDIUM")) {
      addMaterial((m) => nameMatches(m.name, "MEDIUM", "BEP"), 1, "BEP MEDIUM από GIS");
    } else if (bepSize.includes("X-LARGE") || bepSize.includes("XLARGE")) {
      addMaterial(
        (m) =>
          nameMatches(m.name, "X-LARGE", "BEP") ||
          nameMatches(m.name, "XLARGE", "BEP"),
        1,
        "BEP X-LARGE από GIS",
      );
    } else if (bepSize.includes("LARGE")) {
      addMaterial(
        (m) =>
          nameMatches(m.name, "LARGE", "BEP") &&
          !nameMatches(m.name, "X-LARGE") &&
          !nameMatches(m.name, "XLARGE"),
        1,
        "BEP LARGE από GIS",
      );
    }
  }

  // === 2. BMO (count από optical_paths) ===
  if (gisData?.bmo_type) {
    const bmoSize = String(gisData.bmo_type).toUpperCase();
    const optPaths = (gisData.optical_paths as any[]) || [];
    const bmoIds = new Set<string>();
    optPaths.forEach((p: any) => {
      const path = p.path || p["OPTICAL PATH"] || "";
      const m = String(path).match(/BMO(\d+)_/);
      if (m) bmoIds.add(m[1]);
    });
    const bmoCount = bmoIds.size > 0 ? bmoIds.size : 1;

    if (bmoSize.includes("SMALL")) {
      addMaterial((m) => nameMatches(m.name, "SMALL", "BMO"), bmoCount, `${bmoCount} BMO SMALL`);
    } else if (bmoSize.includes("MEDIUM")) {
      addMaterial((m) => nameMatches(m.name, "MEDIUM", "BMO"), bmoCount, `${bmoCount} BMO MEDIUM`);
    } else if (bmoSize.includes("X-LARGE") || bmoSize.includes("XLARGE")) {
      addMaterial(
        (m) =>
          nameMatches(m.name, "X-LARGE", "BMO") ||
          nameMatches(m.name, "XLARGE", "BMO"),
        bmoCount,
        `${bmoCount} BMO X-LARGE`,
      );
    } else if (bmoSize.includes("LARGE")) {
      addMaterial(
        (m) =>
          nameMatches(m.name, "LARGE", "BMO") &&
          !nameMatches(m.name, "X-LARGE") &&
          !nameMatches(m.name, "XLARGE"),
        bmoCount,
        `${bmoCount} BMO LARGE`,
      );
    }
  }

  // === 3. Floor Boxes (από floor_details) ===
  const floorDetails = (gisData?.floor_details as any[]) || [];
  let fb4Total = 0;
  let fb12Total = 0;
  let fbGenericTotal = 0;

  for (const fd of floorDetails) {
    const row = fd?.raw && typeof fd.raw === "object" ? fd.raw : fd;
    if (!row || typeof row !== "object") continue;
    const keys = Object.keys(row);

    for (const key of keys) {
      const upperKey = key.toUpperCase().trim();
      const isFbKey = /^FB\s?\d*$/i.test(upperKey);
      if (!isFbKey) continue;

      const val = parseInt(String(row[key])) || 0;
      if (val <= 0) continue;

      const typeKey = keys.find((k) => {
        const uk = k.toUpperCase().trim();
        return uk === upperKey + " TYPE" || uk === upperKey + "_TYPE";
      });
      const fbType = typeKey ? String(row[typeKey] || "").toUpperCase() : "";

      if (fbType.includes("12")) fb12Total += val;
      else if (fbType.includes("4")) fb4Total += val;
      else fbGenericTotal += val;
    }
  }

  if (fb4Total === 0 && fb12Total === 0 && fbGenericTotal === 0 && floorDetails.length > 0) {
    fbGenericTotal = floorDetails.length;
  }
  fb4Total += fbGenericTotal;

  if (fb4Total > 0) {
    addMaterial(
      (m) =>
        m.code === "14034172" ||
        nameMatches(m.name, "FLOOR", "BOX", "4") ||
        nameMatches(m.name, "FB", "4"),
      fb4Total,
      `${fb4Total} FB4`,
    );
  }
  if (fb12Total > 0) {
    addMaterial(
      (m) =>
        m.code === "14034173" ||
        nameMatches(m.name, "FLOOR", "BOX", "12") ||
        nameMatches(m.name, "FB", "12"),
      fb12Total,
      `${fb12Total} FB12`,
    );
  }

  // === 4. BCP ===
  if (gisData?.nearby_bcp || gisData?.new_bcp) {
    addMaterial((m) => nameMatches(m.name, "BCP"), 1, "BCP από GIS");
  }

  // === 5. Nanotronix ===
  if (gisData?.nanotronix) {
    addMaterial(
      (m) => nameMatches(m.name, "NANOTRONIX") || nameMatches(m.name, "NANO"),
      1,
      "Nanotronix",
    );
  }

  // === 6. Pigtail — BMO-FB paths + 4 καμπίνα ===
  const allOptPaths = (gisData?.optical_paths as any[]) || [];
  const bmoFbCount = allOptPaths.filter(
    (p: any) =>
      String(p?.type || p?.["OPTICAL PATH TYPE"] || "").toUpperCase() === "BMO-FB",
  ).length;
  if (bmoFbCount > 0) {
    addMaterial(
      (m) => nameMatches(m.name, "PIGTAIL") && String(m.name).includes("1,5"),
      bmoFbCount + 4,
      `${bmoFbCount + 4} Pigtails`,
    );
  }

  // === 7. Patchcord — BEP-BMO paths ===
  const bepBmoCount = allOptPaths.filter(
    (p: any) =>
      String(p?.type || p?.["OPTICAL PATH TYPE"] || "").toUpperCase() === "BEP-BMO",
  ).length;
  if (bepBmoCount > 0) {
    addMaterial(
      (m) =>
        nameMatches(m.name, "PATCHCORD") ||
        (nameMatches(m.name, "PATCH") && nameMatches(m.name, "CORD")),
      bepBmoCount,
      `${bepBmoCount} Patchcords`,
    );
  }

  // === 8. Microduct — από Ball Marker ή route fallback ===
  const hasBcp = !!(
    gisData?.new_bcp ||
    gisData?.nearby_bcp ||
    (gisData?.optical_paths as any[])?.some((p: any) =>
      String(p?.type || p?.["OPTICAL PATH TYPE"] || "")
        .toUpperCase()
        .includes("BCP"),
    )
  );
  const ballMarkerMeters = hasBcp
    ? parseFloat(String(section6?.bcp_ball_marker || "0")) || 0
    : parseFloat(String(section6?.ball_marker_bep || "0")) || 0;

  const fallbackMeters =
    ballMarkerMeters || parseFloat(String(routes?.[0]?.koi || "0")) || 0;

  if (fallbackMeters > 0) {
    addMaterial(
      (m) => m.code === "14026586" || nameMatches(m.name, "Microduct", "7/4"),
      fallbackMeters,
      `Microduct 7/4mm (${fallbackMeters}m)`,
    );
    addMaterial(
      (m) =>
        m.code === "14034565" ||
        m.code === "14034374" ||
        nameMatches(m.name, "Microduct", "8/10") ||
        nameMatches(m.name, "Microduct", "Mde"),
      fallbackMeters,
      `Microduct 8/10mm (${fallbackMeters}m)`,
    );
  }

  // === 9. Ενδεικτικό πλέγμα σήμανσης 20cm (14023051) ===
  // Ίσα μέτρα με το Μ/Σ (ms_skamma) από Οριζοντογραφία AS-BUILD.
  const msSkammaMeters = parseFloat(String((section6 as any)?.ms_skamma ?? "0")) || 0;
  if (msSkammaMeters > 0) {
    addMaterial(
      (m) => m.code === "14023051" || nameMatches(m.name, "πλέγμα", "σήμανσης"),
      Math.ceil(msSkammaMeters),
      `Πλέγμα σήμανσης 20cm (${Math.ceil(msSkammaMeters)}m Μ/Σ)`,
    );
  }

  console.log(
    `[computeAutoMaterials] OUTPUT ${items.length} materials:`,
    items.map((i) => `${i.name}×${i.quantity}`).join(", "),
  );

  return items;
}

/**
 * Merge: διατηρεί manual edits, ανανεώνει auto-added μόνο.
 */
export interface MergeMaterialsOptions {
  autoAddedIds?: Set<string>;
}

export function mergeAutoMaterials(
  existing: any[],
  computed: ComputedMaterial[],
  options: MergeMaterialsOptions = {},
): {
  items: any[];
  added: ComputedMaterial[];
  updated: ComputedMaterial[];
  removed: string[];
  nextAutoAddedIds: Set<string>;
} {
  const auto = options.autoAddedIds ?? new Set<string>();
  const result = [...existing];
  const added: ComputedMaterial[] = [];
  const updated: ComputedMaterial[] = [];
  const removed: string[] = [];
  const nextAuto = new Set<string>(auto);
  const computedIds = new Set(computed.map((c) => c.material_id));

  // Add/Update
  for (const c of computed) {
    const existingIdx = result.findIndex((w) => w.material_id === c.material_id);

    if (existingIdx === -1) {
      result.push({
        material_id: c.material_id,
        code: c.code,
        name: c.name,
        unit: c.unit,
        price: c.price,
        source: c.source,
        quantity: c.quantity,
      });
      added.push(c);
      nextAuto.add(c.material_id);
    } else {
      const cur = result[existingIdx];
      if (auto.has(c.material_id)) {
        if (c.quantity !== cur.quantity) {
          result[existingIdx] = { ...cur, quantity: c.quantity };
          updated.push(c);
        }
      }
      // Manual → δεν αγγίζουμε
    }
  }

  // Remove auto items που δεν προτείνονται πλέον
  for (const id of Array.from(nextAuto)) {
    if (!computedIds.has(id)) {
      const idx = result.findIndex((w) => w.material_id === id);
      if (idx !== -1) {
        result.splice(idx, 1);
        removed.push(id);
      }
      nextAuto.delete(id);
    }
  }

  return { items: result, added, updated, removed, nextAutoAddedIds: nextAuto };
}
