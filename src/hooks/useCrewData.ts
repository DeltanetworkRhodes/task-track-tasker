import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";

export const useWorkCategories = () => {
  const { organizationId } = useOrganization();
  return useQuery({
    queryKey: ["sr_work_categories", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sr_work_categories" as any)
        .select("*")
        .eq("organization_id", organizationId!)
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    staleTime: 1000 * 60 * 5,
  });
};

export const useCrewAssignments = (assignmentId: string | null) => {
  return useQuery({
    queryKey: ["sr_crew_assignments", assignmentId],
    enabled: !!assignmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sr_crew_assignments" as any)
        .select("*")
        .eq("assignment_id", assignmentId!);
      if (error) throw error;
      return data as any[];
    },
  });
};

export const useMyCrewAssignments = (assignmentId: string | null) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sr_crew_assignments_mine", assignmentId, user?.id],
    enabled: !!assignmentId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sr_crew_assignments" as any)
        .select("*")
        .eq("assignment_id", assignmentId!)
        .eq("technician_id", user!.id);
      if (error) throw error;
      return data as any[];
    },
  });
};

export const useCrewPhotos = (crewAssignmentId: string | null) => {
  return useQuery({
    queryKey: ["sr_crew_photos", crewAssignmentId],
    enabled: !!crewAssignmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sr_crew_photos" as any)
        .select("*")
        .eq("crew_assignment_id", crewAssignmentId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });
};
