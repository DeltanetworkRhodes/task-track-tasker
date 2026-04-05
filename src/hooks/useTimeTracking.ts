import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";

export interface TimeEntry {
  id: string;
  assignment_id: string;
  technician_id: string;
  organization_id: string | null;
  check_in: string;
  check_out: string | null;
  duration_minutes: number | null;
  notes: string | null;
  created_at: string;
}

export function useTimeTracking(assignmentId?: string) {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  // Fetch all time entries for this assignment
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["time-entries", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_time_entries" as any)
        .select("*")
        .eq("assignment_id", assignmentId!)
        .order("check_in", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as TimeEntry[];
    },
    enabled: !!assignmentId && !!user,
  });

  // Current active (open) entry = no check_out
  const activeEntry = entries.find(
    (e) => e.technician_id === user?.id && !e.check_out
  );

  // Total minutes for this assignment
  const totalMinutes = entries.reduce(
    (sum, e) => sum + (e.duration_minutes || 0),
    0
  );

  // Check in
  const checkIn = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("work_time_entries" as any).insert({
        assignment_id: assignmentId,
        technician_id: user!.id,
        organization_id: organization?.id || null,
        check_in: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries", assignmentId] });
      queryClient.invalidateQueries({ queryKey: ["active-time-entry"] });
    },
  });

  // Check out
  const checkOut = useMutation({
    mutationFn: async (notes?: string) => {
      if (!activeEntry) throw new Error("No active entry");
      const now = new Date();
      const checkInTime = new Date(activeEntry.check_in);
      const durationMin = Math.round(
        (now.getTime() - checkInTime.getTime()) / 60000
      );
      const { error } = await supabase
        .from("work_time_entries" as any)
        .update({
          check_out: now.toISOString(),
          duration_minutes: durationMin,
          notes: notes || null,
        })
        .eq("id", activeEntry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries", assignmentId] });
      queryClient.invalidateQueries({ queryKey: ["active-time-entry"] });
    },
  });

  return {
    entries,
    activeEntry,
    totalMinutes,
    isLoading,
    checkIn,
    checkOut,
  };
}

/** Check if user has any active timer across all assignments */
export function useActiveTimer() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["active-time-entry", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_time_entries" as any)
        .select("*, assignments!inner(sr_id, area)")
        .eq("technician_id", user!.id)
        .is("check_out", null)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!user,
    refetchInterval: 30000, // refresh every 30s for live timer
  });
}
