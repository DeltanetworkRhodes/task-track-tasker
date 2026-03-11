import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

export const useAssignments = () => {
  const { organizationId } = useOrganization();
  return useQuery({
    queryKey: ["assignments", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export const useConstructions = () => {
  const { organizationId } = useOrganization();
  return useQuery({
    queryKey: ["constructions", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("constructions")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export const useMaterials = () => {
  const { organizationId } = useOrganization();
  return useQuery({
    queryKey: ["materials", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("code", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
};

export const useWorkPricing = () => {
  const { organizationId } = useOrganization();
  return useQuery({
    queryKey: ["work_pricing", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_pricing")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("code", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
};

export const useProfiles = () => {
  const { organizationId } = useOrganization();
  return useQuery({
    queryKey: ["profiles", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, area, email")
        .eq("organization_id", organizationId!);
      if (error) throw error;
      return data || [];
    },
  });
};

export const useAssignmentHistory = (assignmentId: string | null) => {
  return useQuery({
    queryKey: ["assignment_history", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await supabase
        .from("assignment_history" as any)
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!assignmentId,
  });
};
