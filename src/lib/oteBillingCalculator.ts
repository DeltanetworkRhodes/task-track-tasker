// OTE Billing Auto-Calculator
// Reads construction data and proposes OTE articles based on business rules

export interface SRBillingInput {
  // Building characteristics
  building_size: "small" | "medium_large"; // 1956.1 vs 1956.2
  floors_count: number;

  // Spatial configuration
  fb_same_level_as_bep: boolean;

  // Distribution from cabinet
  distribution_type:
    | "bcp_public"
    | "bcp_private"
    | "eskalit"
    | "new_pipe"
    | "direct"
    | "none";
  distribution_meters?: number;
  distribution_surface?: "formed" | "unformed";

  // Cabin to BEP
  cab_to_bep_damaged?: boolean;

  // Horizontal routing
  horizontal_meters?: number;

  // Customer (Phase 3 - usually separate SR)
  has_customer_activation?: boolean;
  customer_has_new_vertical?: boolean;
  customer_during_construction?: boolean;

  // Aerial
  is_aerial?: boolean;
  aerial_meters?: number;

  // Commercial center
  is_commercial_center?: boolean;
  fb_count?: number;

  // Damage scenarios
  has_damage?: boolean;
  damage_type?: "bep_bcp" | "polypipe" | "bcp_splice";
  fiber_count_for_splice?: number;

  // Height work (requires OTE approval)
  height_work_approved?: boolean;
  height_work_type?: "1973.1" | "1973.2" | "1973.3";
}

export interface CalculatedArticle {
  code: string;
  quantity: number;
  unit_price: number;
  total: number;
  reason: string;
  is_required: boolean;
}

export interface ArticleInfo {
  id: string;
  price: number;
  title: string;
}

/**
 * Magic floors formula:
 *   if FB same_level_as_bep → N_vertical = floors_count - 1
 *   else → N_vertical = floors_count
 */
export function calculateVerticalFloors(input: SRBillingInput): number {
  if (input.fb_same_level_as_bep) {
    return Math.max(0, input.floors_count - 1);
  }
  return input.floors_count;
}

/**
 * Main calculator: takes input + articles map, returns proposed articles.
 */
export function calculateOteBilling(
  input: SRBillingInput,
  articlesMap: Map<string, ArticleInfo>
): CalculatedArticle[] {
  const items: CalculatedArticle[] = [];

  const addArticle = (
    code: string,
    quantity: number,
    reason: string,
    required = true
  ) => {
    const art = articlesMap.get(code);
    if (!art) {
      // eslint-disable-next-line no-console
      console.warn(`[OteBilling] Article ${code} not found in catalog`);
      return;
    }
    items.push({
      code,
      quantity,
      unit_price: art.price,
      total: art.price * quantity,
      reason,
      is_required: required,
    });
  };

  // 1. AUTOPSIA (always 1 of 2)
  if (input.building_size === "small") {
    addArticle("1956.2", 1, "Μικρό κτίριο (≤4 διαμερίσματα σε ≤2 επίπεδα)");
  } else {
    addArticle("1956.1", 1, "Μεσαίο/μεγάλο κτίριο");
  }

  // 2. BCP (if applicable)
  if (input.distribution_type === "bcp_public") {
    const m = input.distribution_meters || 0;
    if (m <= 3) addArticle("1991.1.1", 1, `BCP σε Δ.Χ. έως 3m (${m}m)`);
    else if (m <= 10) addArticle("1991.1.2", 1, `BCP σε Δ.Χ. 3-10m (${m}m)`);
    else addArticle("1991.1.3", 1, `BCP σε Δ.Χ. 10-15m (${m}m)`);
  } else if (input.distribution_type === "bcp_private") {
    const m = input.distribution_meters || 0;
    if (m <= 5) addArticle("1991.2.1", 1, `BCP σε Ι.Χ. έως 5m (${m}m)`);
    else if (m <= 15) addArticle("1991.2.2", 1, `BCP σε Ι.Χ. έως 15m (${m}m)`);
    else addArticle("1991.2.3", 1, `BCP σε Ι.Χ. έως 30m (${m}m)`);
  }

  // 3. ESKALIT or NEW PIPE
  if (input.distribution_type === "eskalit") {
    const m = input.distribution_meters || 0;
    if (m <= 5) addArticle("1963.1", 1, `Εσκαλίτ έως 5m (${m}m)`);
    else addArticle("1963.2", 1, `Εσκαλίτ έως 15m (${m}m)`);
    addArticle("1970.1", 1, "Extra για εισαγωγή σε εσκαλίτ");
  } else if (input.distribution_type === "new_pipe") {
    const m = input.distribution_meters || 0;
    // Always use KYA 2023 version (1965.5-8)
    if (m <= 5) addArticle("1965.5", 1, `Νέα σωλήνωση έως 5m (ΚΥΑ 2023)`);
    else if (m <= 15)
      addArticle("1965.6", 1, `Νέα σωλήνωση έως 15m (ΚΥΑ 2023)`);
    else if (m <= 30)
      addArticle("1965.7", 1, `Νέα σωλήνωση έως 30m (ΚΥΑ 2023)`);
    else addArticle("1965.8", 1, `Νέα σωλήνωση έως 60m (ΚΥΑ 2023)`);
    addArticle("1970.1", 1, "Extra για εισαγωγή σε νέα σωλήνωση");
  }

  // 4. BEP (always 1)
  if (input.building_size === "small") {
    addArticle("1970.4", 1, "BEP μικρό κτίριο (ΚΥΑ 2023)");
  } else {
    addArticle("1970.5", 1, "BEP μεσαίο/μεγάλο κτίριο (ΚΥΑ 2023)");
  }

  // 5. KOI Cabin → BEP (always 1)
  if (input.cab_to_bep_damaged) {
    addArticle("1980.2", 1, "ΚΟΙ Καμπίνα→BEP κατειλημμένη (βλάβη)");
  } else {
    addArticle("1980.1", 1, "ΚΟΙ Καμπίνα→BEP εμφύσηση");
  }

  // 6. HORIZONTAL (if FB same level)
  if (input.fb_same_level_as_bep) {
    const h = input.horizontal_meters || 0;
    if (h <= 5)
      addArticle("1984.i", 1, "Οριζόντια έως 5m (FB ίδιο επίπεδο)");
    else addArticle("1984.ii", 1, `Οριζόντια >5m (${h}m, FB ίδιο επίπεδο)`);
  }

  // 7. VERTICAL & FIBER SPLICING (× N floors)
  const verticalFloors = calculateVerticalFloors(input);
  if (verticalFloors > 0) {
    addArticle(
      "1985.2",
      verticalFloors,
      `Κατακόρυφη υποδομή × ${verticalFloors} όροφοι`
    );

    const first3 = Math.min(verticalFloors, 3);
    const above3 = Math.max(0, verticalFloors - 3);

    if (first3 > 0) {
      addArticle(
        "1986.3",
        first3,
        `Κόληση ίνας × ${first3} (3 πρώτοι όροφοι)`
      );
    }
    if (above3 > 0) {
      addArticle("1986.4", above3, `Κόληση ίνας × ${above3} (4ος+ όροφοι)`);
    }
  }

  // 8. AERIAL
  if (input.is_aerial && input.aerial_meters) {
    if (input.aerial_meters <= 16) {
      addArticle("1993.3", 1, `Εναέρια ≤16m (${input.aerial_meters}m)`);
    } else {
      addArticle("1993.2", 1, `Εναέρια 16-50m (${input.aerial_meters}m)`);
    }
    addArticle("1994Α", 1, "ADSS αυτοστήρικτο καλώδιο");
  }

  // 9. COMMERCIAL CENTER
  if (input.is_commercial_center && input.fb_count && input.fb_count > 0) {
    addArticle(
      "1966",
      input.fb_count,
      `Εμπορικό Κέντρο × ${input.fb_count} FB`
    );
  }

  // 10. DAMAGE
  if (input.has_damage) {
    if (input.damage_type === "bep_bcp") {
      addArticle("1971.1", 1, "Αντικατάσταση BEP/BCP/FB", false);
    } else if (input.damage_type === "polypipe") {
      addArticle("1995.1", 1, "Άρση βλάβης πολυσωληνίου", false);
    } else if (
      input.damage_type === "bcp_splice" &&
      input.fiber_count_for_splice
    ) {
      const n = input.fiber_count_for_splice;
      if (n <= 8) addArticle("1998.6", 1, `Συγκόλληση BCP ${n} ίνες`, false);
      else if (n <= 12)
        addArticle("1998.5", 1, `Συγκόλληση BCP ${n} ίνες`, false);
      else if (n <= 24)
        addArticle("1998.4", 1, `Συγκόλληση BCP ${n} ίνες`, false);
      else if (n <= 36)
        addArticle("1998.3", 1, `Συγκόλληση BCP ${n} ίνες`, false);
      else if (n <= 48)
        addArticle("1998.2", 1, `Συγκόλληση BCP ${n} ίνες`, false);
      else addArticle("1998.1", 1, `Συγκόλληση BCP ${n} ίνες`, false);
    }
  }

  // 11. HEIGHT WORK (only with OTE approval)
  if (input.height_work_approved && input.height_work_type) {
    addArticle(
      input.height_work_type,
      1,
      "Εργασίες σε ύψος (εγκεκριμένο ΟΤΕ)",
      false
    );
  }

  // 12. CUSTOMER ACTIVATION (Phase 3)
  if (input.has_customer_activation) {
    if (input.customer_during_construction) {
      addArticle(
        "1955.2",
        1,
        "Νέος πελάτης κατά κατασκευή με ενεργοποίηση"
      );
    } else {
      addArticle(
        "1955.4",
        1,
        "Νέος πελάτης μετά κατασκευή με ενεργοποίηση"
      );
    }
  }

  return items;
}

export function calculateTotal(items: CalculatedArticle[]): number {
  return items.reduce((sum, item) => sum + item.total, 0);
}

/**
 * Map building_type_enum from `constructions` table to billing input size.
 * 'mono' / 'mez' (small standalone) → small
 * 'poly' / 'complex' / 'biz' → medium_large
 */
export function mapBuildingTypeToSize(
  buildingType: string | null | undefined
): "small" | "medium_large" {
  if (buildingType === "mono" || buildingType === "mez") return "small";
  return "medium_large";
}
