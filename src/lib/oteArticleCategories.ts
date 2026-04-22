/**
 * Mapping prefixes κωδικών (που χρησιμοποιεί η φόρμα κατασκευής)
 * προς τα 12 categories της εφαρμογής για OTE άρθρα.
 *
 * Αυτό επιτρέπει στη Φόρμα Εργασιών να ομαδοποιεί τα ote_articles
 * ανά prefix κωδικού (1956, 1991, 1993, ...) χωρίς να αλλάξει το enum.
 */

export interface OteArticleRow {
  id: string;
  code: string;
  short_label: string;
  full_title: string;
  when_to_use: string | null;
  user_annotation: string | null;
  price_eur: number;
  unit: string;
  category: string;
  frequency: string;
  is_default_suggestion: boolean;
  requires_quantity: boolean;
  is_active: boolean;
  is_excluded: boolean;
  sort_order: number;
}

/**
 * Επιστρέφει το prefix από έναν κωδικό άρθρου.
 *  "1956.1" → "1956"
 *  "1991.1.1" → "1991"
 *  "1994Α" → "1994"
 */
export function getCodePrefix(code: string): string {
  const m = code.match(/^(\d+)/);
  return m ? m[1] : code;
}

/**
 * Suggest the most relevant ote article for a given category prefix
 * based on construction form data.
 */
export interface SuggestionInput {
  building_type?: string | null;
  building_size?: "small" | "medium_large" | null;
  floors?: number;
  fb_same_level_as_bep?: boolean;
  distribution_type?: string | null;
  distribution_meters?: number;
  distribution_surface?: string | null;
  cab_to_bep_damaged?: boolean;
  horizontal_meters?: number;
  is_aerial?: boolean;
  aerial_meters?: number;
}

export function suggestArticleForPrefix(
  prefix: string,
  input: SuggestionInput,
  articles: OteArticleRow[],
): OteArticleRow | null {
  const find = (code: string) => articles.find((a) => a.code === code) || null;
  const isSmall =
    input.building_size === "small" ||
    input.building_type === "mono" ||
    input.building_type === "mez";

  switch (prefix) {
    case "1956":
      return find(isSmall ? "1956.2" : "1956.1");

    case "1991": {
      const m = input.distribution_meters ?? 0;
      if (input.distribution_type === "bcp_public") {
        if (m <= 3) return find("1991.1.1");
        if (m <= 10) return find("1991.1.2");
        return find("1991.1.3");
      }
      if (input.distribution_type === "bcp_private") {
        if (m <= 5) return find("1991.2.1");
        if (m <= 15) return find("1991.2.2");
        return find("1991.2.3");
      }
      return null;
    }

    case "1963": {
      if (input.distribution_type !== "eskalit") return null;
      const m = input.distribution_meters ?? 0;
      return find(m <= 5 ? "1963.1" : "1963.2");
    }

    case "1965": {
      if (input.distribution_type !== "new_pipe") return null;
      const m = input.distribution_meters ?? 0;
      // Default σε ΚΥΑ 2023 (1965.5–8)
      if (m <= 5) return find("1965.5");
      if (m <= 15) return find("1965.6");
      if (m <= 30) return find("1965.7");
      return find("1965.8");
    }

    case "1970":
      return find(isSmall ? "1970.4" : "1970.5");

    case "1984": {
      if (!input.fb_same_level_as_bep) return null;
      const h = input.horizontal_meters ?? 0;
      return find(h <= 5 ? "1984.i" : "1984.ii");
    }

    case "1985":
      return find("1985.2");

    case "1986":
      return find("1986.3");

    case "1980":
      return find(input.cab_to_bep_damaged ? "1980.2" : "1980.1");

    case "1993": {
      if (input.is_aerial && input.aerial_meters) {
        return find(input.aerial_meters <= 16 ? "1993.3" : "1993.2");
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Calculates default quantity for a suggested article based on form data.
 */
export function calculateDefaultQuantity(
  code: string,
  input: SuggestionInput,
): number {
  const floors = input.floors ?? 1;
  const effective = input.fb_same_level_as_bep ? Math.max(0, floors - 1) : floors;

  if (code === "1985.1" || code === "1985.2") return effective;
  if (code === "1986.3") return Math.min(3, effective);
  if (code === "1986.4") return Math.max(0, effective - 3);
  return 1;
}
