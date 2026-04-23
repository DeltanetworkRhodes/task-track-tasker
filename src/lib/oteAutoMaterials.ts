/**
 * OTE Auto-Materials Engine
 * --------------------------
 * Παίρνει την κατάσταση της Φόρμας Κατασκευής και επιστρέφει λίστα
 * υλικών προς χρέωση: { material_id, quantity, reason }.
 *
 * Κανόνες:
 * - Live: τρέχει σε κάθε αλλαγή
 * - Μη καταστροφικό: ποτέ δεν αφαιρεί χειροκίνητα προστιθέμενα υλικά
 * - Tier-replacement: όταν αλλάζουν τα μέτρα/όροφοι, αντικαθιστά μόνο τα δικά του auto-added
 *
 * Πεδία οδήγησης (per user spec):
 * - floor_meters[] → microduct 7/4mm + καλώδιο 4FO ή 12FO ανά όροφο
 *   • Τύπος καλωδίου: αν fb_ports = 4 → 4FO, αν fb_ports = 6/12 → 12FO (default 4FO)
 * - building_type → BEP (Small/Medium/Large/X-Large)
 */

export interface MaterialRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  price: number;
  source: string;
}

export interface FloorMeterEntry {
  meters?: string | number;
  fb_ports?: string | number; // 4, 6, 12
  type?: string; // optional: '4FO' | '12FO'
}

export interface AutoMaterialsInput {
  building_type?: string | null;
  /** Από GIS (gis_data.bep_type) — π.χ. "MEDIUM/12/RAYCAP". Αν υπάρχει, υπερισχύει του building_type. */
  bep_type?: string | null;
  floor_meters?: FloorMeterEntry[];
}

export interface MaterialBillingItem {
  material_id: string;
  quantity: number;
  reason: string;
}

export interface ExistingMaterialItem {
  material_id: string;
  code: string;
  quantity: number;
}

export interface MaterialMergeOptions {
  autoAddedIds?: Set<string>;
}

// ── Material code constants (από ote_materials πίνακα) ──
// Χρησιμοποιούμε prefix-based matching γιατί κάποιοι κωδικοί έχουν παραλλαγές μονάδας.
const CODE_MICRODUCT_INDOOR = "14027164"; // Microduct 7/4mm indoor LSZH
const CODE_FIBER_4FO_INDOOR = "14027437"; // 4 FO indoor micro cable LSZH
const CODE_FIBER_12FO_INDOOR = "14027438"; // 12 FO indoor micro cable LSZH

// BEP κωδικοί (με 1 splitter preinstalled)
const CODE_BEP_SMALL = "14028868";
const CODE_BEP_MEDIUM = "14028869";
const CODE_BEP_LARGE = "14028870";
const CODE_BEP_XLARGE = "14028871";

/**
 * Επιλέγει τον κωδικό BEP βάσει GIS bep_type (πρώτη προτεραιότητα),
 * διαφορετικά πέφτει σε building_type.
 *
 * GIS bep_type παραδείγματα:
 *   "SMALL/4/RAYCAP", "MEDIUM/12/RAYCAP (01a..06b)", "LARGE/24/...", "XLARGE/48/..."
 */
function pickBepCode(
  buildingType?: string | null,
  bepType?: string | null,
): string | null {
  // 1) Priority: GIS bep_type
  if (bepType) {
    const upper = bepType.toUpperCase();
    if (upper.includes("XLARGE") || upper.includes("X-LARGE") || upper.includes("X LARGE")) return CODE_BEP_XLARGE;
    if (upper.includes("LARGE")) return CODE_BEP_LARGE;
    if (upper.includes("MEDIUM")) return CODE_BEP_MEDIUM;
    if (upper.includes("SMALL")) return CODE_BEP_SMALL;
    // Αν είναι αδιευκρίνιστο, μη μαντεύεις από building_type — επέστρεψε MEDIUM ως safe default
    return CODE_BEP_MEDIUM;
  }

  // 2) Fallback: building_type (παλιά λογική)
  switch (buildingType) {
    case "mono":
    case "mez":
    case "small":
    case "small_apt":
      return CODE_BEP_SMALL;
    case "medium":
    case "medium_apt":
      return CODE_BEP_MEDIUM;
    case "large":
    case "large_apt":
      return CODE_BEP_LARGE;
    case "xlarge":
    case "xlarge_apt":
      return CODE_BEP_XLARGE;
    case "poly":
      // 'poly' (πολυκατοικία) είναι γενικός όρος — default σε MEDIUM
      // αν δεν υπάρχει GIS bep_type. Ο τεχνικός το αλλάζει χειροκίνητα αν χρειάζεται.
      return CODE_BEP_MEDIUM;
    default:
      return buildingType ? CODE_BEP_MEDIUM : null;
  }
}

/** Επιλέγει τύπο καλωδίου βάσει fb_ports: 4→4FO, 6/12→12FO. */
function pickFiberCode(fbPorts?: string | number): string {
  const n = Number(fbPorts) || 0;
  if (n >= 6) return CODE_FIBER_12FO_INDOOR;
  return CODE_FIBER_4FO_INDOOR;
}

/**
 * Βρίσκει το πρώτο material row που ταιριάζει με τον κωδικό.
 * Προτιμά "Μέτρα" για microduct/fiber και "Τεμάχιο" για BEP.
 */
function findMaterialByCode(
  materials: MaterialRow[],
  code: string,
  preferUnit?: "meters" | "piece",
): MaterialRow | null {
  const matches = materials.filter((m) => m.code === code);
  if (matches.length === 0) return null;
  if (matches.length === 1 || !preferUnit) return matches[0];

  const isMeters = (u: string) => /μέτρα|^μ$|meter/i.test(u);
  const isPiece = (u: string) =>
    /τεμάχιο|τεμ|tmx|piece/i.test(u);

  const filtered = matches.filter((m) =>
    preferUnit === "meters" ? isMeters(m.unit) : isPiece(m.unit),
  );
  return filtered[0] || matches[0];
}

/**
 * Κύρια συνάρτηση. Επιστρέφει όλα τα υλικά που πρέπει να χρεωθούν αυτόματα.
 */
export function computeAutoMaterials(
  input: AutoMaterialsInput,
  materials: MaterialRow[],
): MaterialBillingItem[] {
  const items: MaterialBillingItem[] = [];

  // ── 1) BEP βάσει GIS bep_type (priority) ή building_type (fallback) ──
  const bepCode = pickBepCode(input.building_type, input.bep_type);
  if (bepCode) {
    const bep = findMaterialByCode(materials, bepCode, "piece");
    if (bep) {
      items.push({
        material_id: bep.id,
        quantity: 1,
        reason: input.bep_type
          ? `BEP από GIS bep_type "${input.bep_type}"`
          : `BEP για κτίριο τύπου ${input.building_type || "?"}`,
      });
    }
  }

  // ── 2) floor_meters → microduct + fiber ανά όροφο ──
  // Συγκεντρώνουμε totals: συνολικά μέτρα microduct + ξεχωριστά totals για 4FO/12FO.
  let totalMicroductMeters = 0;
  let total4FOMeters = 0;
  let total12FOMeters = 0;

  for (const fm of input.floor_meters || []) {
    const m = parseFloat(String(fm?.meters ?? "0")) || 0;
    if (m <= 0) continue;
    totalMicroductMeters += m;
    const fiberCode = pickFiberCode(fm?.fb_ports);
    if (fiberCode === CODE_FIBER_12FO_INDOOR) {
      total12FOMeters += m;
    } else {
      total4FOMeters += m;
    }
  }

  if (totalMicroductMeters > 0) {
    const microduct = findMaterialByCode(
      materials,
      CODE_MICRODUCT_INDOOR,
      "meters",
    );
    if (microduct) {
      items.push({
        material_id: microduct.id,
        quantity: Math.ceil(totalMicroductMeters),
        reason: `Microduct 7/4mm για ${totalMicroductMeters}m όδευσης`,
      });
    }
  }

  if (total4FOMeters > 0) {
    const fiber4 = findMaterialByCode(
      materials,
      CODE_FIBER_4FO_INDOOR,
      "meters",
    );
    if (fiber4) {
      items.push({
        material_id: fiber4.id,
        quantity: Math.ceil(total4FOMeters),
        reason: `4FO καλώδιο για ορόφους με 4 FB ports`,
      });
    }
  }

  if (total12FOMeters > 0) {
    const fiber12 = findMaterialByCode(
      materials,
      CODE_FIBER_12FO_INDOOR,
      "meters",
    );
    if (fiber12) {
      items.push({
        material_id: fiber12.id,
        quantity: Math.ceil(total12FOMeters),
        reason: `12FO καλώδιο για ορόφους με 6/12 FB ports`,
      });
    }
  }

  return items;
}

/**
 * Όλα τα material IDs που είναι "auto-managed" από τη μηχανή στην τρέχουσα state.
 * Χρησιμοποιείται για replacement όταν αλλάζει το building_type (BEP κωδικός αλλάζει).
 */
const ALL_BEP_CODES = [
  CODE_BEP_SMALL,
  CODE_BEP_MEDIUM,
  CODE_BEP_LARGE,
  CODE_BEP_XLARGE,
];

const ALL_FIBER_CODES = [CODE_FIBER_4FO_INDOOR, CODE_FIBER_12FO_INDOOR];

/** Codes που η μηχανή διαχειρίζεται (για να αναγνωρίζονται κατά την αρχική φόρτωση). */
export function getAllAutoMaterialCodes(): string[] {
  return [
    CODE_MICRODUCT_INDOOR,
    ...ALL_FIBER_CODES,
    ...ALL_BEP_CODES,
  ];
}

export function isAutoManagedMaterialCode(code: string): boolean {
  return getAllAutoMaterialCodes().includes(code);
}

/**
 * Συγχωνεύει τις προτάσεις με τα υπάρχοντα materialItems.
 * - Tier-replacement: αν άλλαξε το BEP type, αφαιρεί το παλιό auto-added BEP.
 * - Auto-added items: sync ποσότητα ακριβώς (πάνω/κάτω).
 * - Manual items: μόνο αυξάνει αν χρειαστεί, ποτέ δεν μειώνει/διαγράφει.
 */
export function mergeAutoMaterials<T extends ExistingMaterialItem>(
  existing: T[],
  computed: MaterialBillingItem[],
  materials: MaterialRow[],
  buildItem: (mat: MaterialRow, quantity: number) => T,
  options: MaterialMergeOptions = {},
): {
  items: T[];
  added: MaterialBillingItem[];
  updated: MaterialBillingItem[];
  removed: string[];
  nextAutoAddedIds: Set<string>;
} {
  const auto = options.autoAddedIds ?? new Set<string>();
  const result = [...existing];
  const added: MaterialBillingItem[] = [];
  const updated: MaterialBillingItem[] = [];
  const removed: string[] = [];
  const nextAuto = new Set<string>(auto);
  const computedIds = new Set(computed.map((c) => c.material_id));

  // ── Step 1: BEP tier-replacement
  // Αν προτείνεται νέο BEP (διαφορετικός κωδικός), αφαίρεσε το παλιό auto-added BEP.
  const newBepItem = computed.find((c) => {
    const mat = materials.find((m) => m.id === c.material_id);
    return mat && ALL_BEP_CODES.includes(mat.code);
  });

  if (newBepItem) {
    for (let i = result.length - 1; i >= 0; i--) {
      const cur = result[i];
      if (
        ALL_BEP_CODES.includes(cur.code) &&
        cur.material_id !== newBepItem.material_id &&
        auto.has(cur.material_id)
      ) {
        result.splice(i, 1);
        nextAuto.delete(cur.material_id);
        removed.push(cur.material_id);
      }
    }
  }

  // ── Step 2: Fiber tier-replacement
  // Αν αλλάζει ο τύπος fiber (4FO ↔ 12FO) που είχε προστεθεί αυτόματα.
  const computedFiberIds = new Set(
    computed
      .map((c) => materials.find((m) => m.id === c.material_id))
      .filter((m): m is MaterialRow => !!m && ALL_FIBER_CODES.includes(m.code))
      .map((m) => m.id),
  );

  for (let i = result.length - 1; i >= 0; i--) {
    const cur = result[i];
    if (
      ALL_FIBER_CODES.includes(cur.code) &&
      auto.has(cur.material_id) &&
      !computedFiberIds.has(cur.material_id)
    ) {
      result.splice(i, 1);
      nextAuto.delete(cur.material_id);
      removed.push(cur.material_id);
    }
  }

  // ── Step 3: Add/Update
  for (const c of computed) {
    const mat = materials.find((m) => m.id === c.material_id);
    if (!mat) continue;
    const existingIdx = result.findIndex((w) => w.material_id === c.material_id);

    if (existingIdx === -1) {
      result.push(buildItem(mat, c.quantity));
      added.push(c);
      nextAuto.add(c.material_id);
    } else {
      const cur = result[existingIdx];
      if (auto.has(c.material_id)) {
        if (c.quantity !== cur.quantity) {
          result[existingIdx] = { ...cur, quantity: c.quantity };
          updated.push(c);
        }
      } else {
        if (c.quantity > cur.quantity) {
          result[existingIdx] = { ...cur, quantity: c.quantity };
          updated.push(c);
        }
      }
    }
  }

  // ── Step 4: Remove auto-added items που δεν προτείνονται πια
  for (const matId of Array.from(nextAuto)) {
    if (!computedIds.has(matId)) {
      const idx = result.findIndex((w) => w.material_id === matId);
      if (idx !== -1) {
        result.splice(idx, 1);
        removed.push(matId);
      }
      nextAuto.delete(matId);
    }
  }

  return { items: result, added, updated, removed, nextAutoAddedIds: nextAuto };
}
