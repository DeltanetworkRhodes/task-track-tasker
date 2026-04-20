import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

export interface PhotoRequirement {
  id: string;
  category_key: string;
  category_label: string;
  category_icon: string;
  min_count: number;
  is_required: boolean;
  sort_order: number | null;
}

export interface PhotoChecklistItem extends PhotoRequirement {
  current_count: number;
  is_satisfied: boolean;
  missing: number;
}

export interface PhotoChecklistSummary {
  items: PhotoChecklistItem[];
  total_required: number;
  total_satisfied: number;
  all_required_satisfied: boolean;
  missing_required: PhotoChecklistItem[];
  missing_optional: PhotoChecklistItem[];
}

/**
 * Maps requirement category_key (DB) → photo bucket key (form state).
 * The form state uses Greek keys for some categories.
 */
const KEY_ALIASES: Record<string, string[]> = {
  SKAMA: ["SKAMA", "ΣΚΑΜΑ"],
  ODEFSI: ["ODEFSI", "ΟΔΕΥΣΗ"],
  KAMPINA: ["KAMPINA", "ΚΑΜΠΙΝΑ"],
  G_FASI: ["G_FASI", "Γ_ΦΑΣΗ"],
  BEP: ["BEP"],
  BMO: ["BMO"],
  FB: ["FB"],
  BCP: ["BCP"],
};

function resolveCount(
  categoryKey: string,
  counts: Record<string, number>
): number {
  const aliases = KEY_ALIASES[categoryKey] || [categoryKey];
  let total = 0;
  for (const alias of aliases) {
    total += counts[alias] || 0;
  }
  return total;
}

/**
 * Returns photo checklist for a given phase.
 * @param phase 1, 2, or 3
 * @param buildingType Optional — falls back to org-wide requirements
 * @param photoCounts Map of category_key → uploaded photo count
 */
export function usePhotoChecklist(
  phase: number | null | undefined,
  buildingType: string | null | undefined,
  photoCounts: Record<string, number>
) {
  const { organizationId } = useOrganization();

  const { data: requirements, isLoading } = useQuery({
    queryKey: ["photo-requirements", organizationId, phase, buildingType ?? "_none_"],
    enabled: !!organizationId && !!phase,
    queryFn: async () => {
      // Try building-type-specific requirements first
      if (buildingType) {
        const { data: btSpecific } = await supabase
          .from("photo_requirements")
          .select("*")
          .eq("organization_id", organizationId!)
          .eq("phase", phase!)
          .eq("building_type", buildingType as any)
          .order("sort_order");
        if (btSpecific && btSpecific.length > 0) return btSpecific;
      }
      // Fallback to generic (building_type IS NULL)
      const { data, error } = await supabase
        .from("photo_requirements")
        .select("*")
        .eq("organization_id", organizationId!)
        .eq("phase", phase!)
        .is("building_type", null)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 2,
  });

  const summary: PhotoChecklistSummary | null = useMemo(() => {
    if (!requirements) return null;

    const items: PhotoChecklistItem[] = requirements.map((r: any) => {
      const current_count = resolveCount(r.category_key, photoCounts);
      const missing = Math.max(0, r.min_count - current_count);
      return {
        id: r.id,
        category_key: r.category_key,
        category_label: r.category_label,
        category_icon: r.category_icon || "📷",
        min_count: r.min_count,
        is_required: r.is_required,
        sort_order: r.sort_order,
        current_count,
        is_satisfied: current_count >= r.min_count,
        missing,
      };
    });

    const requiredItems = items.filter((i) => i.is_required);
    const optionalItems = items.filter((i) => !i.is_required);
    const missing_required = requiredItems.filter((i) => !i.is_satisfied);
    const missing_optional = optionalItems.filter((i) => !i.is_satisfied);

    return {
      items,
      total_required: requiredItems.length,
      total_satisfied: requiredItems.filter((i) => i.is_satisfied).length,
      all_required_satisfied: missing_required.length === 0,
      missing_required,
      missing_optional,
    };
  }, [requirements, photoCounts]);

  return { summary, isLoading };
}
