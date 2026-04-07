import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useWorkCategories } from "@/hooks/useCrewData";
import { useProfiles } from "@/hooks/useData";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, User, HardHat, MapPin } from "lucide-react";

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

const ConstructionProgressTab = ({ assignments, isLoading }: Props) => {
  const { organizationId } = useOrganization();
  const { data: categories = [] } = useWorkCategories();
  const { data: profiles = [] } = useProfiles();

  const constructionAssignments = useMemo(
    () => assignments.filter((a) => a.status === "construction"),
    [assignments]
  );

  const assignmentIds = constructionAssignments.map((a) => a.id);

  // Fetch all crew assignments for these assignments
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

  // Group crew assignments by assignment_id
  const crewByAssignment = useMemo(() => {
    const map: Record<string, any[]> = {};
    crewAssignments.forEach((ca) => {
      if (!map[ca.assignment_id]) map[ca.assignment_id] = [];
      map[ca.assignment_id].push(ca);
    });
    return map;
  }, [crewAssignments]);

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

        return (
          <div key={a.id} className="p-4 sm:p-5 hover:bg-muted/30 transition-colors">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-foreground">{a.srId}</span>
                  {a.customerName && (
                    <span className="text-xs text-muted-foreground">· {a.customerName}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
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
                {/* Progress bar */}
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

            {/* Category progress chips */}
            {crews.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {crews.map((crew) => {
                  const isSaved = crew.status === "saved";
                  const catName = categoryMap[crew.category_id] || "—";
                  const techName = profileMap[crew.technician_id] || "";
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
