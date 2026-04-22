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
  bcp_eidos?: string | null;              // 'ΔΗΜΟΣΙΟ' | 'ΙΔΙΩΤΙΚΟ' (όταν eisagogi=BCP)
  bcp_meters?: number;                    // μέτρα BCP εισαγωγής
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

const isSmallBuilding = (bt?: string | null) =>
  bt === "mono" || bt === "mez" || bt === "small";

/**
 * Επιλέγει άρθρο ΝΕΑΣ ΣΩΛΗΝΩΣΗΣ (1965.x) με βάση τα μέτρα.
 * Επιστρέφει πάντα το standard (όχι ΚΥΑ) — η ΚΥΑ μετατροπή γίνεται μόνο για 1955.2.
 */
function pickNewPipeCode(meters: number): string {
  if (meters <= 5) return "1965.1";
  if (meters <= 15) return "1965.2";
  if (meters <= 30) return "1965.3";
  return "1965.4";
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
  if (meters <= 5) return "1993.1.1";
  if (meters <= 15) return "1993.1.2";
  if (meters <= 30) return "1993.1.3";
  return "1993.1.4";
}

function pickCabToBepAerialCode(meters: number): string {
  return meters <= 16 ? "1993.3" : "1993.2";
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

  // ── 1) ΑΥΤΟΨΙΑ ──
  push(
    small ? "1956.2" : "1956.1",
    1,
    small ? "Μικρό κτίριο" : "Μεσαίο/Μεγάλο κτίριο",
  );

  // ── 2) BCP — Σκάψιμο έως BCP (όταν eisagogi=BCP) ──
  if (input.eisagogi_type === "BCP" && (input.bcp_meters ?? 0) > 0) {
    const m = input.bcp_meters ?? 0;
    if (input.bcp_eidos === "ΔΗΜΟΣΙΟ") {
      push(pickBcpPublicCode(m), 1, `BCP Δημ. Χώρος ${m}m`);
    } else if (input.bcp_eidos === "ΙΔΙΩΤΙΚΟ") {
      push(pickBcpPrivateCode(m), 1, `BCP Ιδιωτ. Χώρος ${m}m`);
    }
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

  // ── 5) ΚΟΙ Καμπίνα → BEP (από route_cab_to_bep ή route_aerial_cab_to_bep) ──
  const cabBepUg = Number(input.route_cab_to_bep_meters) || 0;
  const cabBepAir = Number(input.route_aerial_cab_to_bep_meters) || 0;

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

  // ── 6) Εμφύσηση CAB (1980.x) — όταν υπάρχει υπόγεια διαδρομή Καμπ→BEP ──
  if (cabBepUg > 0) {
    const code = input.cab_to_bep_damaged ? "1980.2" : "1980.1";
    push(code, 1, input.cab_to_bep_damaged ? "Κατειλημμένη υποδομή" : "Ελεύθερη εμφύσηση");
  }

  // ── 7) FB-BEP στο ίδιο επίπεδο ──
  if (input.fb_same_level_as_bep) {
    const h = Number(input.horizontal_meters) || 0;
    if (h > 0) {
      push(h <= 5 ? "1984.i" : "1984.ii", 1, `Οριζόντια ${h}m`);
    }
  }

  // ── 8) ΚΑΤΑΚΟΡΥΦΗ — 1985.2 ανά όροφο (ή αριθμός γραμμών floor_meters αν υπάρχουν) ──
  const floorQty = Math.max(
    Number(input.floor_meters_count) || 0,
    input.fb_same_level_as_bep ? Math.max(0, floors - 1) : floors,
  );
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

export function mergeAutoBilling(
  existing: ExistingWorkItem[],
  computed: BillingItem[],
  articles: OteArticleRow[],
): { items: ExistingWorkItem[]; added: BillingItem[]; updated: BillingItem[] } {
  const result = [...existing];
  const added: BillingItem[] = [];
  const updated: BillingItem[] = [];

  for (const c of computed) {
    const article = articles.find((a) => a.code === c.code);
    if (!article) continue;

    const existingIdx = result.findIndex((w) => w.code === c.code);

    if (existingIdx === -1) {
      // Δεν υπάρχει → προσθήκη
      result.push({
        work_pricing_id: `ote:${article.id}`,
        code: article.code,
        description: article.full_title || article.short_label || article.code,
        unit: article.unit,
        unit_price: Number(article.price_eur) || 0,
        quantity: c.quantity,
      });
      added.push(c);
    } else {
      // Υπάρχει — ενημέρωσε ΜΟΝΟ την ποσότητα ΑΝ είναι μεγαλύτερη
      // (διατηρούμε χειροκίνητες αυξήσεις, μη μειώνουμε αυτόματα)
      const cur = result[existingIdx];
      if (c.quantity > cur.quantity) {
        result[existingIdx] = { ...cur, quantity: c.quantity };
        updated.push(c);
      }
    }
  }

  return { items: result, added, updated };
}
