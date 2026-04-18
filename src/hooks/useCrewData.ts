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

/**
 * Returns the active phase (1, 2, 3) for the current user on a specific assignment.
 * Priority:
 *   1. sr_crew_assignment phase (per-SR override)
 *   2. profiles.default_phase
 *   3. null → admin (sees everything)
 */
export const useMyPhase = (assignmentId: string | null) => {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile-phase", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("default_phase" as any)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: crewAssignment } = useQuery({
    queryKey: ["my-phase-assignment", assignmentId, user?.id],
    enabled: !!assignmentId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sr_crew_assignments" as any)
        .select(`*, sr_work_categories(phase)`)
        .eq("assignment_id", assignmentId!)
        .eq("technician_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const phase: number | null =
    crewAssignment?.sr_work_categories?.phase ??
    (profile?.default_phase ?? null);

  return {
    phase: phase as 1 | 2 | 3 | null,
    isAdmin: phase === null,
    loading: false,
  };
};

/** Phase status snapshot for an assignment */
export const usePhaseStatus = (assignmentId: string | null) => {
  return useQuery({
    queryKey: ["phase-status", assignmentId],
    enabled: !!assignmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("constructions")
        .select(
          "phase1_status, phase2_status, phase3_status, phase1_completed_at, phase2_completed_at, phase3_completed_at" as any
        )
        .eq("assignment_id", assignmentId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
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
