import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useWorkCategories } from "@/hooks/useCrewData";
import { useProfiles } from "@/hooks/useData";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, User, HardHat, MapPin, Camera, Timer, CalendarDays } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { el } from "date-fns/locale";

interface Assignment {
  id: string;
  srId: string;
  area: string;
  status: string;
  technicianId: string | null;
  customerName: string;
  address: string;
}

interface Props {
  assignments: Assignment[];
  isLoading: boolean;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}λ`;
  return `${h}ω ${m}λ`;
}

const ConstructionProgressTab = ({ assignments, isLoading }: Props) => {
  const { organizationId } = useOrganization();
  const { data: categories = [] } = useWorkCategories();
  const { data: profiles = [] } = useProfiles();

  const constructionAssignments = useMemo(
    () => assignments.filter((a) => a.status === "construction"),
    [assignments]
  );

  const assignmentIds = constructionAssignments.map((a) => a.id);

  // Fetch crew assignments
  const { data: crewAssignments = [] } = useQuery({
    queryKey: ["crew-progress-all", assignmentIds.join(",")],
    enabled: assignmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sr_crew_assignments" as any)
        .select("*")
        .in("assignment_id", assignmentIds);
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch crew photos counts
  const crewAssignmentIds = crewAssignments.map((c) => c.id);
  const { data: crewPhotos = [] } = useQuery({
    queryKey: ["crew-photos-counts", crewAssignmentIds.join(",")],
    enabled: crewAssignmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sr_crew_photos" as any)
        .select("crew_assignment_id")
        .in("crew_assignment_id", crewAssignmentIds);
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch time entries
  const { data: timeEntries = [] } = useQuery({
    queryKey: ["time-entries-construction", assignmentIds.join(",")],
    enabled: assignmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_time_entries" as any)
        .select("assignment_id, duration_minutes, check_out")
        .in("assignment_id", assignmentIds);
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch assignment history for timeline (when it became "construction")
  const { data: historyEntries = [] } = useQuery({
    queryKey: ["construction-history", assignmentIds.join(",")],
    enabled: assignmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_history" as any)
        .select("assignment_id, new_status, created_at")
        .in("assignment_id", assignmentIds)
        .eq("new_status", "construction")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  // Group data
  const crewByAssignment = useMemo(() => {
    const map: Record<string, any[]> = {};
    crewAssignments.forEach((ca) => {
      if (!map[ca.assignment_id]) map[ca.assignment_id] = [];
      map[ca.assignment_id].push(ca);
    });
    return map;
  }, [crewAssignments]);

  const photosPerCrew = useMemo(() => {
    const map: Record<string, number> = {};
    crewPhotos.forEach((p: any) => {
      map[p.crew_assignment_id] = (map[p.crew_assignment_id] || 0) + 1;
    });
    return map;
  }, [crewPhotos]);

  const timePerAssignment = useMemo(() => {
    const map: Record<string, { total: number; active: number }> = {};
    (timeEntries as any[]).forEach((e) => {
      if (!map[e.assignment_id]) map[e.assignment_id] = { total: 0, active: 0 };
      map[e.assignment_id].total += e.duration_minutes || 0;
      if (!e.check_out) map[e.assignment_id].active += 1;
    });
    return map;
  }, [timeEntries]);

  const constructionStartMap = useMemo(() => {
    const map: Record<string, string> = {};
    (historyEntries as any[]).forEach((h) => {
      if (!map[h.assignment_id]) map[h.assignment_id] = h.created_at;
    });
    return map;
  }, [historyEntries]);

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    (profiles || []).forEach((p: any) => {
      m[p.user_id] = p.full_name;
    });
    return m;
  }, [profiles]);

  const categoryMap = useMemo(() => {
    const m: Record<string, string> = {};
    (categories || []).forEach((c: any) => {
      m[c.id] = c.name;
    });
    return m;
  }, [categories]);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (constructionAssignments.length === 0) {
    return (
      <div className="p-12 text-center">
        <HardHat className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Δεν υπάρχουν αναθέσεις σε κατασκευή</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {constructionAssignments.map((a) => {
        const crews = crewByAssignment[a.id] || [];
        const totalCategories = crews.length;
        const savedCount = crews.filter((c) => c.status === "saved").length;
        const progress = totalCategories > 0 ? Math.round((savedCount / totalCategories) * 100) : 0;
        const timeData = timePerAssignment[a.id];
        const startedAt = constructionStartMap[a.id];

        return (
          <div key={a.id} className="p-4 sm:p-5 hover:bg-muted/30 transition-colors">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-foreground">{a.srId}</span>
                  {a.customerName && (
                    <span className="text-xs text-muted-foreground">· {a.customerName}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {a.area}
                  </span>
                  {a.address && (
                    <span className="truncate max-w-[200px]">{a.address}</span>
                  )}
                  {a.technicianId && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {profileMap[a.technicianId] || "—"}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <span className={`text-xs font-bold ${progress === 100 ? "text-green-600" : "text-amber-600"}`}>
                    {progress}%
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    {savedCount}/{totalCategories}
                  </p>
                </div>
                <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      progress === 100 ? "bg-green-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Timeline & Time tracking row */}
            <div className="flex items-center gap-4 mb-2.5 text-[11px] text-muted-foreground flex-wrap">
              {startedAt && (
                <span className="flex items-center gap-1" title={new Date(startedAt).toLocaleString("el-GR")}>
                  <CalendarDays className="h-3 w-3" />
                  Έναρξη{" "}
                  {formatDistanceToNow(new Date(startedAt), { addSuffix: true, locale: el })}
                </span>
              )}
              {timeData && timeData.total > 0 && (
                <span className="flex items-center gap-1">
                  <Timer className="h-3 w-3" />
                  {formatDuration(timeData.total)}
                  {timeData.active > 0 && (
                    <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                      {timeData.active} ενεργό
                    </span>
                  )}
                </span>
              )}
            </div>

            {/* Category progress chips */}
            {crews.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {crews.map((crew) => {
                  const isSaved = crew.status === "saved";
                  const catName = categoryMap[crew.category_id] || "—";
                  const techName = profileMap[crew.technician_id] || "";
                  const photoCount = photosPerCrew[crew.id] || 0;
                  return (
                    <div
                      key={crew.id}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                        isSaved
                          ? "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400"
                          : "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400"
                      }`}
                      title={techName ? `${catName} → ${techName}` : catName}
                    >
                      {isSaved ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      <span className="max-w-[120px] truncate">{catName}</span>
                      {photoCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 opacity-70">
                          <Camera className="h-2.5 w-2.5" />
                          {photoCount}
                        </span>
                      )}
                      {techName && (
                        <span className="text-[10px] opacity-60 max-w-[80px] truncate">
                          ({techName.split(" ")[0]})
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {crews.length === 0 && (
              <p className="text-xs text-muted-foreground/60 italic">
                Δεν υπάρχουν αναθέσεις συνεργείου
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ConstructionProgressTab;
