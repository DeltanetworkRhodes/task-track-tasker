import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useWorkCategories } from "@/hooks/useCrewData";
import { useProfiles } from "@/hooks/useData";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, User, HardHat, MapPin, Camera, Timer, CalendarDays, Circle, Wrench, Ruler, FolderOpen } from "lucide-react";
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

// Normalize Drive folder name for matching with category photo_categories
// e.g. "ΣΚΑΜΑ" (Drive) should match "ΣΚΑΜΜΑ" (category), "Γ_ΦΑΣΗ" -> "Γ ΦΑΣΗ"
function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/_/g, " ")
    .replace(/ΜΜ/g, "Μ") // ΣΚΑΜΜΑ -> ΣΚΑΜΑ
    .trim();
}

function driveKeyMatchesCategory(driveKey: string, categoryPhotoCat: string): boolean {
  const dk = normalizeName(driveKey);
  const cp = normalizeName(categoryPhotoCat);
  return dk === cp || dk.includes(cp) || cp.includes(dk);
}

// Check how many of a category's expected photo folders have actual photos in Drive
function getCategoryPhotoStatus(
  categoryPhotoCategories: string[],
  photoCounts: Record<string, number>
): { hasAny: boolean; matchedCount: number; totalExpected: number; photoCount: number } {
  if (!categoryPhotoCategories || categoryPhotoCategories.length === 0) {
    return { hasAny: false, matchedCount: 0, totalExpected: 0, photoCount: 0 };
  }
  let matchedCount = 0;
  let photoCount = 0;
  const driveKeys = Object.keys(photoCounts);

  for (const expectedCat of categoryPhotoCategories) {
    const match = driveKeys.find((dk) => driveKeyMatchesCategory(dk, expectedCat));
    if (match && photoCounts[match] > 0) {
      matchedCount++;
      photoCount += photoCounts[match];
    }
  }

  return {
    hasAny: matchedCount > 0,
    matchedCount,
    totalExpected: categoryPhotoCategories.length,
    photoCount,
  };
}

type CrewStatus = "not_started" | "partial" | "completed";

const statusConfig: Record<CrewStatus, { icon: typeof CheckCircle2; classes: string; label: string }> = {
  not_started: {
    icon: Circle,
    classes: "bg-muted/50 text-muted-foreground border-border",
    label: "Δεν ξεκίνησε",
  },
  partial: {
    icon: Clock,
    classes: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400",
    label: "Ελλιπές",
  },
  completed: {
    icon: CheckCircle2,
    classes: "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400",
    label: "Ολοκληρώθηκε",
  },
};

const ConstructionProgressTab = ({ assignments, isLoading }: Props) => {
  const { organizationId } = useOrganization();
  const { data: categories = [] } = useWorkCategories();
  const { data: profiles = [] } = useProfiles();

  const constructionAssignments = useMemo(
    () => assignments.filter((a) => a.status === "construction"),
    [assignments]
  );

  const assignmentIds = constructionAssignments.map((a) => a.id);

  // Fetch crew assignments (per category per SR)
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

  // Fetch constructions with photo_counts from DB
  const { data: constructions = [] } = useQuery({
    queryKey: ["constructions-progress", assignmentIds.join(",")],
    enabled: assignmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("constructions")
        .select("id, assignment_id, photo_counts, sr_id")
        .in("assignment_id", assignmentIds);
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch REAL Drive data for each SR
  const srIds = constructionAssignments.map((a) => a.srId);
  const { data: driveDataMap = {} } = useQuery({
    queryKey: ["drive-files-progress", srIds.join(",")],
    enabled: srIds.length > 0,
    staleTime: 5 * 60 * 1000, // cache 5 min to avoid too many calls
    queryFn: async () => {
      const result: Record<string, { subfolders: Record<string, { files: any[] }>; totalFiles: number }> = {};
      // Fetch in parallel batches of 5
      const batchSize = 5;
      for (let i = 0; i < srIds.length; i += batchSize) {
        const batch = srIds.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (srId) => {
            const { data, error } = await supabase.functions.invoke("google-drive-files", {
              body: { action: "sr_folder", sr_id: srId },
            });
            if (error) return { srId, found: false };
            return { srId, ...data };
          })
        );
        results.forEach((r) => {
          if (r.status === "fulfilled" && r.value?.found) {
            const d = r.value;
            const subfolders = d.subfolders || {};
            let totalFiles = (d.files || []).length;
            Object.values(subfolders).forEach((sf: any) => {
              totalFiles += (sf.files || []).length;
            });
            result[d.srId] = { subfolders, totalFiles };
          }
        });
      }
      return result;
    },
  });

  // Fetch construction works counts
  const constructionIds = constructions.map((c: any) => c.id);
  const { data: worksData = [] } = useQuery({
    queryKey: ["construction-works-counts", constructionIds.join(",")],
    enabled: constructionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construction_works")
        .select("construction_id")
        .in("construction_id", constructionIds);
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

  // Fetch assignment history for timeline
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

  const constructionByAssignment = useMemo(() => {
    const map: Record<string, any> = {};
    constructions.forEach((c: any) => { map[c.assignment_id] = c; });
    return map;
  }, [constructions]);

  const worksPerConstruction = useMemo(() => {
    const map: Record<string, number> = {};
    (worksData as any[]).forEach((w) => {
      map[w.construction_id] = (map[w.construction_id] || 0) + 1;
    });
    return map;
  }, [worksData]);

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
    (profiles || []).forEach((p: any) => { m[p.user_id] = p.full_name; });
    return m;
  }, [profiles]);

  const categoryMap = useMemo(() => {
    const m: Record<string, any> = {};
    (categories || []).forEach((c: any) => { m[c.id] = c; });
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
        const construction = constructionByAssignment[a.id];
        const dbPhotoCounts: Record<string, number> = construction?.photo_counts || {};
        const driveData = driveDataMap[a.srId];
        
        // Merge: use Drive real data if available, fallback to DB photo_counts
        const photoCounts: Record<string, number> = { ...dbPhotoCounts };
        if (driveData) {
          // Override/supplement with real Drive subfolder file counts
          Object.entries(driveData.subfolders).forEach(([folderName, sf]: [string, any]) => {
            const fileCount = (sf.files || []).length;
            if (fileCount > 0) {
              photoCounts[folderName] = fileCount;
            }
          });
        }
        
        const worksCount = construction ? (worksPerConstruction[construction.id] || 0) : 0;
        const hasWorks = worksCount > 0;
        const driveFileCount = driveData?.totalFiles || 0;

        // Evaluate each crew category
        const categoryStatuses = crews.map((crew) => {
          const cat = categoryMap[crew.category_id];
          if (!cat) return { crew, status: "not_started" as CrewStatus, photoStatus: null, hasMeasurements: false };
          
          const photoStatus = getCategoryPhotoStatus(cat.photo_categories || [], photoCounts);
          const hasMeasurements = !cat.requires_measurements || (crew.measurements && Object.keys(crew.measurements).length > 0);
          const hasRequiredWorks = !cat.requires_works || hasWorks;

          let status: CrewStatus = "not_started";
          if (photoStatus.hasAny && hasMeasurements && hasRequiredWorks) {
            status = "completed";
          } else if (photoStatus.hasAny || (crew.status === "saved")) {
            status = "partial";
          }

          return { crew, status, photoStatus, hasMeasurements, cat };
        });

        const completedCount = categoryStatuses.filter((s) => s.status === "completed").length;
        const partialCount = categoryStatuses.filter((s) => s.status === "partial").length;
        const totalCategories = categoryStatuses.length;

        const progressRaw = totalCategories > 0
          ? ((completedCount * 100) + (partialCount * 50)) / totalCategories
          : 0;
        const progress = Math.round(progressRaw);

        const timeData = timePerAssignment[a.id];
        const startedAt = constructionStartMap[a.id];
        const totalPhotos = Object.values(photoCounts).reduce((sum, c) => sum + (c || 0), 0);

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
                  {a.address && <span className="truncate max-w-[200px]">{a.address}</span>}
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
                  <span className={`text-xs font-bold ${
                    progress === 100 ? "text-green-600" : progress > 0 ? "text-amber-600" : "text-muted-foreground"
                  }`}>
                    {progress}%
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    {completedCount}/{totalCategories}
                  </p>
                </div>
                <div className="w-20 h-2.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full flex">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{ width: totalCategories > 0 ? `${(completedCount / totalCategories) * 100}%` : "0%" }}
                    />
                    <div
                      className="h-full bg-amber-400 transition-all"
                      style={{ width: totalCategories > 0 ? `${(partialCount / totalCategories) * 100}%` : "0%" }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 mb-2.5 text-[11px] text-muted-foreground flex-wrap">
              {startedAt && (
                <span className="flex items-center gap-1" title={new Date(startedAt).toLocaleString("el-GR")}>
                  <CalendarDays className="h-3 w-3" />
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
              <span className="flex items-center gap-1">
                <Camera className="h-3 w-3" />
                {totalPhotos} φωτο
              </span>
              {driveFileCount > 0 && (
                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400" title="Πραγματικά αρχεία στο Google Drive">
                  <FolderOpen className="h-3 w-3" />
                  {driveFileCount} Drive
                </span>
              )}
              <span className="flex items-center gap-1">
                <Wrench className="h-3 w-3" />
                {worksCount} εργασίες
              </span>
            </div>

            {/* Category progress chips */}
            {categoryStatuses.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {categoryStatuses.map(({ crew, status, photoStatus, hasMeasurements, cat }) => {
                  const config = statusConfig[status];
                  const StatusIcon = config.icon;
                  const catName = cat?.name || "—";
                  const techName = profileMap[crew.technician_id] || "";
                  const photoCount = photoStatus?.photoCount || 0;
                  const needsMeasurements = cat?.requires_measurements;
                  const needsWorks = cat?.requires_works;

                  // Build tooltip
                  const tooltipParts = [`${catName}: ${config.label}`];
                  if (photoStatus) {
                    tooltipParts.push(`Φωτο: ${photoCount} (${photoStatus.matchedCount}/${photoStatus.totalExpected} κατηγορίες)`);
                  }
                  if (needsMeasurements) {
                    tooltipParts.push(`Μετρήσεις: ${hasMeasurements ? "✅" : "❌"}`);
                  }
                  if (needsWorks) {
                    tooltipParts.push(`Εργασίες: ${hasWorks ? "✅" : "❌"}`);
                  }
                  if (techName) tooltipParts.push(`→ ${techName}`);

                  return (
                    <div
                      key={crew.id}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${config.classes}`}
                      title={tooltipParts.join("\n")}
                    >
                      <StatusIcon className="h-3 w-3" />
                      <span className="max-w-[120px] truncate">{catName}</span>
                      {photoCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 opacity-70">
                          <Camera className="h-2.5 w-2.5" />
                          {photoCount}
                        </span>
                      )}
                      {needsMeasurements && (
                        <Ruler className={`h-2.5 w-2.5 ${hasMeasurements ? "text-green-600" : "text-destructive opacity-60"}`} />
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

            {categoryStatuses.length === 0 && (
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
