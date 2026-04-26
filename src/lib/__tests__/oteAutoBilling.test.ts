import { describe, it, expect } from "vitest";
import { computeAutoBilling, type BillingItem } from "../oteAutoBilling";

// ============================================================
// MOCK ARTICLES
// ============================================================
const MOCK_ARTICLES: any[] = [
  { code: "1956.1", title_full: "Αυτοψία μεσαίο/μεγάλο", price: 30 },
  { code: "1956.2", title_full: "Αυτοψία μικρό", price: 20 },
  { code: "1970.4", title_full: "BEP μικρό", price: 25 },
  { code: "1970.5", title_full: "BEP μεγάλο", price: 35 },
  { code: "1963.1", title_full: "Εσκαλήτ ≤5m", price: 15 },
  { code: "1963.2", title_full: "Εσκαλήτ >5m", price: 25 },
  { code: "1965.5", title_full: "Νέα σωλ. ≤5m", price: 30 },
  { code: "1965.6", title_full: "Νέα σωλ. ≤15m", price: 60 },
  { code: "1965.7", title_full: "Νέα σωλ. ≤30m", price: 90 },
  { code: "1965.8", title_full: "Νέα σωλ. >30m", price: 120 },
  { code: "1965.1", title_full: "Νέα σωλ. ≤5m παλιό", price: 25 },
  { code: "1965.2", title_full: "Νέα σωλ. ≤15m παλιό", price: 50 },
  { code: "1965.3", title_full: "Νέα σωλ. ≤30m παλιό", price: 75 },
  { code: "1965.4", title_full: "Νέα σωλ. >30m παλιό", price: 100 },
  { code: "1991.1.1", title_full: "BCP Δημ ≤3m", price: 40 },
  { code: "1991.1.2", title_full: "BCP Δημ ≤10m", price: 80 },
  { code: "1991.1.3", title_full: "BCP Δημ >10m", price: 120 },
  { code: "1991.2.1", title_full: "BCP Ιδιωτ ≤5m", price: 35 },
  { code: "1991.2.2", title_full: "BCP Ιδιωτ ≤15m", price: 70 },
  { code: "1991.2.3", title_full: "BCP Ιδιωτ >15m", price: 105 },
  { code: "1993.1.5", title_full: "Καμπ→BEP υπόγ ≤5m", price: 50 },
  { code: "1993.1.6", title_full: "Καμπ→BEP υπόγ ≤15m", price: 100 },
  { code: "1993.1.7", title_full: "Καμπ→BEP υπόγ ≤30m", price: 150 },
  { code: "1993.1.8", title_full: "Καμπ→BEP υπόγ >30m", price: 200 },
  { code: "1993.1.1", title_full: "Καμπ→BEP υπόγ ≤5m παλιό", price: 40 },
  { code: "1993.1.2", title_full: "Καμπ→BEP υπόγ ≤15m παλιό", price: 80 },
  { code: "1993.1.3", title_full: "Καμπ→BEP υπόγ ≤30m παλιό", price: 120 },
  { code: "1993.1.4", title_full: "Καμπ→BEP υπόγ >30m παλιό", price: 160 },
  { code: "1993.2", title_full: "Καμπ→BEP εναέρ >16m", price: 90 },
  { code: "1993.3", title_full: "Καμπ→BEP εναέρ ≤16m", price: 60 },
  { code: "1994Α", title_full: "ADSS αυτοστήρικτο", price: 30 },
  { code: "1980.1", title_full: "Εμφύσηση", price: 25 },
  { code: "1980.2", title_full: "Εμφύσηση κατειλημμένη", price: 40 },
  { code: "1984.i", title_full: "Οριζοντογραφία ≤10", price: 50 },
  { code: "1984.ii", title_full: "Οριζοντογραφία >10", price: 80 },
];

function hasCode(items: BillingItem[], code: string): boolean {
  return items.some((i) => i.code === code);
}

// ============================================================
// AUTOPSIA (1956.x)
// ============================================================
describe("Αυτοψία (1956.x)", () => {
  it("μικρό κτίριο 'mono' → 1956.2", () => {
    const items = computeAutoBilling(
      { sr_id: "2-123456", building_type: "mono" },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1956.2")).toBe(true);
    expect(hasCode(items, "1956.1")).toBe(false);
  });

  it("μεγάλο κτίριο 'poly' → 1956.1", () => {
    const items = computeAutoBilling(
      { sr_id: "2-123456", building_type: "poly" },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1956.1")).toBe(true);
    expect(hasCode(items, "1956.2")).toBe(false);
  });

  it("medium_apt → 1956.1", () => {
    const items = computeAutoBilling(
      { sr_id: "2-123456", building_type: "medium_apt" },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1956.1")).toBe(true);
  });

  it("biz → 1956.1", () => {
    const items = computeAutoBilling(
      { sr_id: "2-123456", building_type: "biz" },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1956.1")).toBe(true);
  });
});

// ============================================================
// CRITICAL: ΚΥΑ 2023 (1965.5-8)
// ============================================================
describe("ΚΥΑ 2023 — Νέα σωλήνωση (1965.5-8)", () => {
  it("3m → 1965.5 (ΟΧΙ 1965.1)", () => {
    const items = computeAutoBilling(
      { sr_id: "2-123", building_type: "mono", eisagogi_type: "ΝΕΑ ΥΠΟΔΟΜΗ", eisagogi_meters: 3 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1965.5")).toBe(true);
    expect(hasCode(items, "1965.1")).toBe(false);
  });

  it("12m → 1965.6 (ΟΧΙ 1965.2)", () => {
    const items = computeAutoBilling(
      { sr_id: "2-123", building_type: "mono", eisagogi_type: "ΝΕΑ ΥΠΟΔΟΜΗ", eisagogi_meters: 12 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1965.6")).toBe(true);
    expect(hasCode(items, "1965.2")).toBe(false);
  });

  it("23m → 1965.7 (ΟΧΙ 1965.3)", () => {
    const items = computeAutoBilling(
      { sr_id: "2-123", building_type: "mono", eisagogi_type: "ΝΕΑ ΥΠΟΔΟΜΗ", eisagogi_meters: 23 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1965.7")).toBe(true);
    expect(hasCode(items, "1965.3")).toBe(false);
  });

  it("50m → 1965.8 (ΟΧΙ 1965.4)", () => {
    const items = computeAutoBilling(
      { sr_id: "2-123", building_type: "mono", eisagogi_type: "ΝΕΑ ΥΠΟΔΟΜΗ", eisagogi_meters: 50 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1965.8")).toBe(true);
    expect(hasCode(items, "1965.4")).toBe(false);
  });

  it("boundary: 5m → 1965.5", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", eisagogi_type: "ΝΕΑ ΥΠΟΔΟΜΗ", eisagogi_meters: 5 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1965.5")).toBe(true);
  });

  it("boundary: 6m → 1965.6", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", eisagogi_type: "ΝΕΑ ΥΠΟΔΟΜΗ", eisagogi_meters: 6 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1965.6")).toBe(true);
  });

  it("boundary: 30m → 1965.7", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", eisagogi_type: "ΝΕΑ ΥΠΟΔΟΜΗ", eisagogi_meters: 30 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1965.7")).toBe(true);
  });

  it("boundary: 31m → 1965.8", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", eisagogi_type: "ΝΕΑ ΥΠΟΔΟΜΗ", eisagogi_meters: 31 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1965.8")).toBe(true);
  });
});

// ============================================================
// CRITICAL: BCP→BEP υπόγεια (1993.1.5-8)
// ============================================================
describe("ΚΥΑ 2023 — Καμπ→BEP υπόγεια (1993.1.5-8)", () => {
  it("REGRESSION TEST: 23m → 1993.1.7 (ΟΧΙ 1993.1.4)", () => {
    const items = computeAutoBilling(
      { sr_id: "2-339981751841", building_type: "mono", bcp_to_bep_underground_meters: 23 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1993.1.7")).toBe(true);
    expect(hasCode(items, "1993.1.4")).toBe(false);
  });

  it("3m → 1993.1.5", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", bcp_to_bep_underground_meters: 3 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1993.1.5")).toBe(true);
  });

  it("10m → 1993.1.6", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", bcp_to_bep_underground_meters: 10 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1993.1.6")).toBe(true);
  });

  it("50m → 1993.1.8", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", bcp_to_bep_underground_meters: 50 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1993.1.8")).toBe(true);
  });

  it("backward compat: bcp_bep_underground_meters alias works", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", bcp_bep_underground_meters: 12 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1993.1.6")).toBe(true);
  });
});

// ============================================================
// BCP — Separation των 3 πεδίων
// ============================================================
describe("BCP — Separation των 3 πεδίων", () => {
  it("σκάμα Δημόσιο 5m → 1991.1.2", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", has_bcp: true, bcp_eidos: "ΔΗΜΟΣΙΟ", bcp_skamma_meters: 5 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1991.1.2")).toBe(true);
  });

  it("σκάμα Ιδιωτικό 12m → 1991.2.2", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", has_bcp: true, bcp_eidos: "ΙΔΙΩΤΙΚΟ", bcp_skamma_meters: 12 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1991.2.2")).toBe(true);
  });

  it("3 BCP πεδία ταυτόχρονα → 3+ ξεχωριστά άρθρα", () => {
    const items = computeAutoBilling(
      {
        sr_id: "2-1",
        building_type: "poly",
        has_bcp: true,
        bcp_eidos: "ΔΗΜΟΣΙΟ",
        bcp_skamma_meters: 2,
        bcp_to_bep_underground_meters: 10,
        bcp_to_bep_aerial_meters: 8,
      },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1991.1.1")).toBe(true);
    expect(hasCode(items, "1993.1.6")).toBe(true);
    expect(hasCode(items, "1993.3")).toBe(true);
    expect(hasCode(items, "1994Α")).toBe(true);
  });

  it("BCP χωρίς eidos → δεν χρεώνεται σκάμα", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", has_bcp: true, bcp_eidos: null, bcp_skamma_meters: 5 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1991.1.1")).toBe(false);
    expect(hasCode(items, "1991.1.2")).toBe(false);
    expect(hasCode(items, "1991.2.1")).toBe(false);
  });

  it("backward compat: bcp_meters fallback για σκάμα", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", has_bcp: true, bcp_eidos: "ΔΗΜΟΣΙΟ", bcp_meters: 5 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1991.1.2")).toBe(true);
  });
});

// ============================================================
// BCP εναέρια + ADSS
// ============================================================
describe("BCP εναέρια + ADSS", () => {
  it("εναέρια 10m → 1993.3 + 1994Α", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", has_bcp: true, bcp_to_bep_aerial_meters: 10 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1993.3")).toBe(true);
    expect(hasCode(items, "1994Α")).toBe(true);
  });

  it("εναέρια 20m → 1993.2 + 1994Α", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", has_bcp: true, bcp_to_bep_aerial_meters: 20 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1993.2")).toBe(true);
    expect(hasCode(items, "1994Α")).toBe(true);
  });
});

// ============================================================
// Routes
// ============================================================
describe("Καμπίνα → BEP από routes", () => {
  it("route_cab_to_bep_meters 12m → 1993.1.6", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", route_cab_to_bep_meters: 12 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1993.1.6")).toBe(true);
  });

  it("route_aerial_cab_to_bep_meters 8m → 1993.3", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", route_aerial_cab_to_bep_meters: 8 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1993.3")).toBe(true);
  });
});

// ============================================================
// EDGE CASES
// ============================================================
describe("Edge Cases", () => {
  it("0 μέτρα → δεν προστίθεται άρθρο σωλήνωσης", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", eisagogi_type: "ΝΕΑ ΥΠΟΔΟΜΗ", eisagogi_meters: 0 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1965.5")).toBe(false);
    expect(hasCode(items, "1965.6")).toBe(false);
    expect(hasCode(items, "1965.7")).toBe(false);
    expect(hasCode(items, "1965.8")).toBe(false);
  });

  it("Negative μέτρα → ignored (defensive)", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", eisagogi_type: "ΝΕΑ ΥΠΟΔΟΜΗ", eisagogi_meters: -5 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1965.5")).toBe(false);
  });

  it("Empty input → δεν crashάρει", () => {
    const items = computeAutoBilling({ sr_id: "2-1" }, MOCK_ARTICLES);
    expect(items.length).toBeGreaterThanOrEqual(0);
  });

  it("ΕΣΚΑΛΗΤ 3m → 1963.1", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", eisagogi_type: "ΕΣΚΑΛΗΤ", eisagogi_meters: 3 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1963.1")).toBe(true);
  });

  it("ΕΣΚΑΛΗΤ 8m → 1963.2", () => {
    const items = computeAutoBilling(
      { sr_id: "2-1", building_type: "mono", eisagogi_type: "ΕΣΚΑΛΗΤ", eisagogi_meters: 8 },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1963.2")).toBe(true);
  });
});

// ============================================================
// REAL-WORLD SCENARIO
// ============================================================
describe("Real-world scenario — Πλήρες SR", () => {
  it("Μικρό κτίριο + 12m νέα σωλήνωση + BCP δημόσιο 5m + 23m υπόγεια BCP→BEP", () => {
    const items = computeAutoBilling(
      {
        sr_id: "2-339981751841",
        building_type: "mono",
        floors: 1,
        eisagogi_type: "ΝΕΑ ΥΠΟΔΟΜΗ",
        eisagogi_meters: 12,
        has_bcp: true,
        bcp_eidos: "ΔΗΜΟΣΙΟ",
        bcp_skamma_meters: 5,
        bcp_to_bep_underground_meters: 23,
      },
      MOCK_ARTICLES
    );
    expect(hasCode(items, "1956.2")).toBe(true);
    expect(hasCode(items, "1965.6")).toBe(true);
    expect(hasCode(items, "1991.1.2")).toBe(true);
    expect(hasCode(items, "1993.1.7")).toBe(true);
    expect(hasCode(items, "1956.1")).toBe(false);
    expect(hasCode(items, "1965.2")).toBe(false);
    expect(hasCode(items, "1993.1.4")).toBe(false);
  });
});
