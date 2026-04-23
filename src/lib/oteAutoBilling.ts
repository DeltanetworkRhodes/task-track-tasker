/**
 * OTE Auto-Billing Engine
 * ------------------------
 * Παίρνει την κατάσταση της Φόρμας Κατασκευής και επιστρέφει λίστα
 * άρθρων ΟΤΕ προς χρέωση: { code, quantity, reason }.
 *
 * Κανόνες:
 * - Live: τρέχει σε κάθε αλλαγή
 * - Μη καταστροφικό: ποτέ δεν αφαιρεί χειροκίνητα προστιθέμενα άρθρα
 * - Γ' Φάση (KYA): ΜΟΝΟ όταν το SR ξεκινά με "2-" → προσθέτει 1955.2
 */

import type { OteArticleRow } from "./oteArticleCategories";

export interface AutoBillingInput {
  sr_id?: string | null;
  building_type?: string | null; // 'mono' | 'mez' | 'small_apt' | 'medium_apt' | 'large_apt' | ...
  floors?: number;

  // Routes (από πεδία διαδρομών)
  route_cab_to_bep_meters?: number;       // FTTH ΥΠΟΓ ΔΔ (Cabin to BEP) → ΚΟΙ μέτρα
  route_aerial_cab_to_bep_meters?: number;// ΕΝΑΕΡΙΟ FTTH ΔΔ (Cabinet BCP to BEP)
  route_aerial_bep_to_fb_meters?: number; // ΕΝΑΕΡΙΟ FTTH ΣΥΝΔΡΟΜ
  route_inhouse_meters?: number;          // FTTH INHOUSE = sum floor_meters

  // Floor meters (BMO→FB ανά όροφο)
  floor_meters_count?: number;            // πλήθος γραμμών floor_meters (≈ ορόφους με όδευση)

  // Section6 / Οριζοντογραφία
  eisagogi_type?: string | null;          // 'ΝΕΑ ΥΠΟΔΟΜΗ' | 'ΕΣΚΑΛΗΤ' | 'ΕΣΚΑΛΗΤ Β1' | 'BCP'
  eisagogi_meters?: number;               // μέτρα του "είδους εισαγωγής"

  // 🆕 BCP — ΞΕΧΩΡΙΣΤΑ πεδία για κάθε εργασία (split από bcp_meters sum)
  bcp_eidos?: string | null;              // 'ΔΗΜΟΣΙΟ' | 'ΙΔΙΩΤΙΚΟ' (από τεχνικό)
  bcp_skamma_meters?: number;             // Μ/Σ — σκάμα Καμπ→BCP (1991.x)
  bcp_to_bep_underground_meters?: number; // BCP→BEP υπόγεια (1993.1.x)
  bcp_to_bep_aerial_meters?: number;      // BCP→BEP εναέρια (1993.2/3 + 1994Α)
  has_bcp?: boolean;                      // αν υπάρχει BCP (από GIS ή τεχνικό)

  /** @deprecated Χρησιμοποίησε τα ξεχωριστά πεδία bcp_skamma_meters κλπ. Διατηρείται για backward compat. */
  bcp_meters?: number;

  fb_same_level_as_bep?: boolean;
  horizontal_meters?: number;
  cab_to_bep_damaged?: boolean;           // 1980.2 αν κατειλημμένη υποδομή
}

export interface BillingItem {
  code: string;
  quantity: number;
  reason: string;
}

const isKya = (sr_id?: string | null) =>
  !!sr_id && sr_id.trim().startsWith("2-");

const isSmallBuilding = (bt?: string | null) => {
  const normalized = String(bt || "").toLowerCase().trim();
  return (
    normalized === "mono" ||
    normalized === "mez" ||
    normalized === "small" ||
    normalized === "small_apt"
  );
};

// "poly" / "medium_apt" / "large_apt" / "biz" / "complex" → μεσαίο/μεγάλο.
const isMediumLargeBuilding = (bt?: string | null) => {
  const normalized = String(bt || "").toLowerCase().trim();
  return (
    normalized === "poly" ||
    normalized === "medium_apt" ||
    normalized === "large_apt" ||
    normalized === "biz" ||
    normalized === "complex"
  );
};

// (defensive default ώστε να μη χάνεται 1956.1/1970.5 όταν λείπει το type).
const isKnownBuildingType = (bt?: string | null) =>
  !!bt && bt.length > 0;

/**
 * Επιλέγει άρθρο ΝΕΑΣ ΣΩΛΗΝΩΣΗΣ (1965.x) με βάση τα μέτρα.
 * Επιστρέφει πάντα το standard (όχι ΚΥΑ) — η ΚΥΑ μετατροπή γίνεται μόνο για 1955.2.
 */
function pickNewPipeCode(meters: number): string {
  // Default: ΚΥΑ 2023 (1965.5-8) — οι νέες τιμές
  if (meters <= 5) return "1965.5";
  if (meters <= 15) return "1965.6";
  if (meters <= 30) return "1965.7";
  return "1965.8";
}

function pickEskalitCode(meters: number): string {
  return meters <= 5 ? "1963.1" : "1963.2";
}

function pickBcpPublicCode(meters: number): string {
  if (meters <= 3) return "1991.1.1";
  if (meters <= 10) return "1991.1.2";
  return "1991.1.3";
}

function pickBcpPrivateCode(meters: number): string {
  if (meters <= 5) return "1991.2.1";
  if (meters <= 15) return "1991.2.2";
  return "1991.2.3";
}

function pickCabToBepUndergroundCode(meters: number): string {
  // Default: ΚΥΑ 2023 (1993.1.5-8) — οι νέες τιμές
  if (meters <= 5) return "1993.1.5";
  if (meters <= 15) return "1993.1.6";
  if (meters <= 30) return "1993.1.7";
  return "1993.1.8";
}

function pickCabToBepAerialCode(meters: number): string {
  return meters <= 16 ? "1993.3" : "1993.2";
}

// BCP → BEP χρησιμοποιεί τους ίδιους πίνακες tier με Καμπ→BEP
function pickBcpToBepUndergroundCode(meters: number): string {
  return pickCabToBepUndergroundCode(meters);
}
function pickBcpToBepAerialCode(meters: number): string {
  return pickCabToBepAerialCode(meters);
}

/**
 * Κύρια συνάρτηση. Επιστρέφει όλα τα άρθρα που εντοπίζονται από τη φόρμα.
 */
export function computeAutoBilling(
  input: AutoBillingInput,
  articles: OteArticleRow[],
): BillingItem[] {
  const items: BillingItem[] = [];
  const has = (code: string) => articles.some((a) => a.code === code);
  const push = (code: string, quantity: number, reason: string) => {
    if (quantity <= 0) return;
    if (!has(code)) return; // safety: μόνο όσα υπάρχουν στον τιμοκατάλογο
    items.push({ code, quantity, reason });
  };

  const small = isSmallBuilding(input.building_type);
  const kya = isKya(input.sr_id);
  const floors = Math.max(0, Number(input.floors) || 0);

  // === Διαγνωστικά ===
  console.log("[computeAutoBilling] 📊 INPUT:", {
    sr_id: input.sr_id,
    building_type: input.building_type,
    floors,
    small,
    kya,
    eisagogi_type: input.eisagogi_type,
    eisagogi_meters: input.eisagogi_meters,
    bcp_eidos: input.bcp_eidos,
    bcp_skamma_meters: input.bcp_skamma_meters,
    bcp_to_bep_underground_meters: input.bcp_to_bep_underground_meters,
    bcp_to_bep_aerial_meters: input.bcp_to_bep_aerial_meters,
    has_bcp: input.has_bcp,
    fb_same_level_as_bep: input.fb_same_level_as_bep,
    horizontal_meters: input.horizontal_meters,
    route_cab_to_bep_meters: input.route_cab_to_bep_meters,
    route_aerial_cab_to_bep_meters: input.route_aerial_cab_to_bep_meters,
    floor_meters_count: input.floor_meters_count,
  });

  // ── 1) ΑΥΤΟΨΙΑ ──
  push(
    small ? "1956.2" : "1956.1",
    1,
    small ? "Μικρό κτίριο" : "Μεσαίο/Μεγάλο κτίριο",
  );

  // ── 2) 🆕 BCP — split σε ΤΡΕΙΣ ξεχωριστές εργασίες ──
  const hasBcp = input.has_bcp || input.eisagogi_type === "BCP";
  const bcpSkamma = Number(input.bcp_skamma_meters) || 0;
  const bcpUg = Number(input.bcp_to_bep_underground_meters) || 0;
  const bcpAir = Number(input.bcp_to_bep_aerial_meters) || 0;

  if (hasBcp) {
    // 2A) Σκάψιμο Καμπ→BCP (1991.x)
    if (bcpSkamma > 0 && input.bcp_eidos) {
      const eidos = String(input.bcp_eidos).toUpperCase();
      if (eidos === "ΔΗΜΟΣΙΟ" || eidos === "DIMOSIO") {
        push(pickBcpPublicCode(bcpSkamma), 1, `BCP Δημ. Χώρος σκάμα ${bcpSkamma}m`);
      } else if (eidos === "ΙΔΙΩΤΙΚΟ" || eidos === "IDIOTIKO") {
        push(pickBcpPrivateCode(bcpSkamma), 1, `BCP Ιδιωτ. Χώρος σκάμα ${bcpSkamma}m`);
      } else {
        console.warn(
          `[AutoBilling] ⚠️ BCP Είδος άγνωστο: "${input.bcp_eidos}" — το σκάμα δεν χρεώνεται`
        );
      }
    }

    // 2B) BCP→BEP υπόγεια (1993.1.x)
    if (bcpUg > 0) {
      push(pickBcpToBepUndergroundCode(bcpUg), 1, `Υπόγεια BCP→BEP ${bcpUg}m`);
    }

    // 2C) BCP→BEP εναέρια (1993.2/3 + 1994Α)
    if (bcpAir > 0) {
      push(pickBcpToBepAerialCode(bcpAir), 1, `Εναέρια BCP→BEP ${bcpAir}m`);
      push("1994Α", 1, `ADSS αυτοστήρικτο για εναέρια ${bcpAir}m`);
    }

    // 2D) Τοποθέτηση κουτιού BCP — ΠΑΝΤΑ όταν υπάρχει BCP
    push("1997", 1, "Τοποθέτηση κουτιού BCP");
  }

  // ── 3) ΕΙΣΑΓΩΓΗ έως BEP ──
  if (input.eisagogi_type === "ΝΕΑ ΥΠΟΔΟΜΗ" && (input.eisagogi_meters ?? 0) > 0) {
    push(
      pickNewPipeCode(input.eisagogi_meters!),
      1,
      `Νέα σωλήνωση ${input.eisagogi_meters}m`,
    );
  }
  if (input.eisagogi_type === "ΕΣΚΑΛΗΤ" && (input.eisagogi_meters ?? 0) > 0) {
    push(
      pickEskalitCode(input.eisagogi_meters!),
      1,
      `Εσκαλίτ ${input.eisagogi_meters}m`,
    );
  }

  // ── 4) BEP – Τοποθέτηση (πάντα ένα) ──
  push(
    small ? "1970.4" : "1970.5",
    1,
    small ? "BEP μικρό κτίριο" : "BEP μεσαίο/μεγάλο",
  );

  // ── 5) ΚΟΙ Καμπίνα → BEP — ΜΟΝΟ αν ΔΕΝ έχει BCP
  // (αλλιώς τα 1993.x έχουν ήδη χρεωθεί από το 2B/2C)
  const cabBepUg = Number(input.route_cab_to_bep_meters) || 0;
  const cabBepAir = Number(input.route_aerial_cab_to_bep_meters) || 0;

  if (!hasBcp) {
    if (cabBepUg > 0) {
      push(
        pickCabToBepUndergroundCode(cabBepUg),
        1,
        `Υπόγεια Καμπ→BEP ${cabBepUg}m`,
      );
    }
    if (cabBepAir > 0) {
      push(
        pickCabToBepAerialCode(cabBepAir),
        1,
        `Εναέρια Καμπ→BEP ${cabBepAir}m`,
      );
    }
  }

  // ── 6) Εμφύσηση CAB (1980.x) ──
  // Αν δεν έχει BCP → εξαρτάται από cabBepUg
  // Αν έχει BCP → εξαρτάται από bcpUg
  const blowingMeters = hasBcp ? bcpUg : cabBepUg;
  if (blowingMeters > 0) {
    const code = input.cab_to_bep_damaged ? "1980.2" : "1980.1";
    push(
      code,
      1,
      input.cab_to_bep_damaged
        ? `Κατειλημμένη υποδομή${hasBcp ? " (BCP)" : ""}`
        : `Ελεύθερη εμφύσηση${hasBcp ? " (BCP)" : ""}`,
    );
  }

  // ── 7) FB-BEP στο ίδιο επίπεδο ──
  if (input.fb_same_level_as_bep) {
    const h = Number(input.horizontal_meters) || 0;
    if (h > 0) {
      push(h <= 5 ? "1984.i" : "1984.ii", 1, `Οριζόντια ${h}m`);
    }
  }

  // ── 8) ΚΑΤΑΚΟΡΥΦΗ — 1985.2 ανά όροφο (3 fallback sources) ──
  let floorQty = 0;
  const fromFloorMeters = Number(input.floor_meters_count) || 0;
  const fromFloors = input.fb_same_level_as_bep
    ? Math.max(0, floors - 1)
    : floors;

  if (fromFloorMeters > 0) {
    floorQty = fromFloorMeters;
    console.log(`[computeAutoBilling] Using floor_meters_count: ${floorQty}`);
  } else if (fromFloors > 0) {
    floorQty = fromFloors;
    console.log(`[computeAutoBilling] Using floors: ${floorQty}`);
  } else if (!small) {
    console.warn(
      "[computeAutoBilling] ⚠️ Poly/Medium building but NO floors info — " +
      "Κατακόρυφη (1985.2) & Κολλήσεις (1986.3) ΔΕΝ προστέθηκαν!"
    );
  }

  if (floorQty > 0) {
    push("1985.2", floorQty, `${floorQty} όροφοι BMO→FB`);
  }

  // ── 9) ΚΟΛΛΗΣΕΙΣ — 1986.3 (3 πρώτοι) + 1986.4 (4ος+) ──
  if (floorQty > 0) {
    const first3 = Math.min(3, floorQty);
    const rest = Math.max(0, floorQty - 3);
    push("1986.3", first3, `${first3} κολλήσεις (πρώτοι όροφοι)`);
    if (rest > 0) push("1986.4", rest, `${rest} κολλήσεις (4ος+)`);
  }

  // ── 10) Γ' ΦΑΣΗ — Σύνδεση Πελάτη (μόνο αν SR ξεκινά με "2-") ──
  if (kya) {
    push("1955.2", 1, "Γ' Φάση — Σύνδεση πελάτη με ενεργοποίηση");
  }

  console.log(
    `[computeAutoBilling] OUTPUT ${items.length} articles:`,
    items.map((i) => `${i.code}×${i.quantity}`).join(", ")
  );

  return items;
}

/**
 * Συμβατό με το WorkItem state του ConstructionForm.
 * Επιστρέφει τη "συγχωνευμένη" λίστα: κρατάει ΟΛΑ τα υπάρχοντα χειροκίνητα
 * και προσθέτει όσα προτείνει η μηχανή που λείπουν.
 */
export interface ExistingWorkItem {
  work_pricing_id: string;
  code: string;
  description: string;
  unit: string;
  unit_price: number;
  quantity: number;
}

/**
 * Οικογένειες κωδικών που εξαρτώνται από μέτρα — όταν αλλάζουν τα μέτρα,
 * ο tier-κωδικός αλλάζει και πρέπει να αντικαθιστούμε ΜΟΝΟ τον προηγούμενο
 * auto-added κωδικό της ίδιας οικογένειας (όχι manual additions).
 */
const TIER_FAMILIES: Array<{ name: string; codes: string[] }> = [
  { name: "autopsia", codes: ["1956.1", "1956.2"] },
  { name: "bep", codes: ["1970.4", "1970.5"] },
  { name: "eskalit", codes: ["1963.1", "1963.2"] },
  { name: "new_pipe", codes: ["1965.1", "1965.2", "1965.3", "1965.4", "1965.5", "1965.6", "1965.7", "1965.8"] },
  { name: "bcp_public", codes: ["1991.1.1", "1991.1.2", "1991.1.3"] },
  { name: "bcp_private", codes: ["1991.2.1", "1991.2.2", "1991.2.3"] },
  { name: "cab_bep_ug", codes: ["1993.1.1", "1993.1.2", "1993.1.3", "1993.1.4"] },
  { name: "cab_bep_air", codes: ["1993.2", "1993.3"] },
  { name: "emfysisi", codes: ["1980.1", "1980.2"] },
  { name: "horizontal", codes: ["1984.i", "1984.ii"] },
];

function familyForCode(code: string): { name: string; codes: string[] } | null {
  return TIER_FAMILIES.find((f) => f.codes.includes(code)) || null;
}

/**
 * Όλοι οι κωδικοί που ανήκουν σε tier-families (auto-managed από τη μηχανή).
 * Χρησιμοποιείται κατά τη φόρτωση υπάρχουσας κατασκευής, ώστε αποθηκευμένα
 * tier-articles (π.χ. 1965.2) να σημαδεύονται ως auto-added και να μπορούν
 * να αντικατασταθούν όταν αλλάζουν τα μέτρα (1965.2 → 1965.3).
 */
export function getAllTierManagedCodes(): string[] {
  return TIER_FAMILIES.flatMap((f) => f.codes);
}

export function isTierManagedCode(code: string): boolean {
  return TIER_FAMILIES.some((f) => f.codes.includes(code));
}

export interface MergeOptions {
  /** Codes που έχουν προστεθεί προηγουμένως αυτόματα — επιτρέπεται replace/remove. */
  autoAddedCodes?: Set<string>;
}

export function mergeAutoBilling(
  existing: ExistingWorkItem[],
  computed: BillingItem[],
  articles: OteArticleRow[],
  options: MergeOptions = {},
): {
  items: ExistingWorkItem[];
  added: BillingItem[];
  updated: BillingItem[];
  removed: string[];
  nextAutoAddedCodes: Set<string>;
} {
  const auto = options.autoAddedCodes ?? new Set<string>();
  const result = [...existing];
  const added: BillingItem[] = [];
  const updated: BillingItem[] = [];
  const removed: string[] = [];
  const nextAuto = new Set<string>(auto);
  const computedCodes = new Set(computed.map((c) => c.code));

  // ── Step 1: Tier-replacement
  // Για κάθε οικογένεια, αν ο νέος προτεινόμενος κωδικός είναι διαφορετικός
  // από τον παλιό auto-added της ίδιας οικογένειας → αφαίρεσε τον παλιό.
  const newComputedFamilies = new Map<string, string>(); // family.name → new code
  for (const c of computed) {
    const fam = familyForCode(c.code);
    if (fam) newComputedFamilies.set(fam.name, c.code);
  }

  for (const [famName, newCode] of newComputedFamilies.entries()) {
    const fam = TIER_FAMILIES.find((f) => f.name === famName)!;
    for (const oldCode of fam.codes) {
      if (oldCode === newCode) continue;
      if (!auto.has(oldCode)) continue; // μην ακουμπάς manual
      const idx = result.findIndex((w) => w.code === oldCode);
      if (idx !== -1) {
        result.splice(idx, 1);
        nextAuto.delete(oldCode);
        removed.push(oldCode);
      }
    }
  }

  // ── Step 2: Add/Update
  for (const c of computed) {
    const article = articles.find((a) => a.code === c.code);
    if (!article) continue;
    const existingIdx = result.findIndex((w) => w.code === c.code);

    if (existingIdx === -1) {
      result.push({
        work_pricing_id: `ote:${article.id}`,
        code: article.code,
        description: article.full_title || article.short_label || article.code,
        unit: article.unit,
        unit_price: Number(article.price_eur) || 0,
        quantity: c.quantity,
      });
      added.push(c);
      nextAuto.add(c.code);
    } else {
      const cur = result[existingIdx];
      if (auto.has(c.code)) {
        // auto-added → sync ποσότητα ακριβώς (πάνω/κάτω)
        if (c.quantity !== cur.quantity) {
          result[existingIdx] = { ...cur, quantity: c.quantity };
          updated.push(c);
        }
      } else {
        // manual → μόνο αυξάνουμε αν χρειαστεί, ποτέ δεν μειώνουμε
        if (c.quantity > cur.quantity) {
          result[existingIdx] = { ...cur, quantity: c.quantity };
          updated.push(c);
        }
      }
    }
  }

  // ── Step 3: Remove auto-added items που δεν προτείνονται πια
  // (π.χ. ο τεχνικός άλλαξε eisagogi_type από ΝΕΑ ΥΠΟΔΟΜΗ σε BCP → 1965.x εξαφανίζεται)
  for (const code of Array.from(nextAuto)) {
    if (!computedCodes.has(code)) {
      const idx = result.findIndex((w) => w.code === code);
      if (idx !== -1) {
        result.splice(idx, 1);
        removed.push(code);
      }
      nextAuto.delete(code);
    }
  }

  return { items: result, added, updated, removed, nextAutoAddedCodes: nextAuto };
}
