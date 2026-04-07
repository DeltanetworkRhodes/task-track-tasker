import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useProfiles } from "@/hooks/useData";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, User, HardHat, MapPin, Camera, Timer, CalendarDays, Circle, Wrench, FolderOpen } from "lucide-react";
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

// Known Drive photo categories and their display names
const PHOTO_CATEGORY_LABELS: Record<string, string> = {
  "ΣΚΑΜΑ": "Σκάμμα",
  "ΟΔΕΥΣΗ": "Οδεύσεις",
  "ΚΑΜΠΙΝΑ": "Καμπίνα",
  "BEP": "BEP",
  "BMO": "BMO",
  "BCP": "BCP",
  "FB": "FB",
  "Γ_ΦΑΣΗ": "Γ' Φάση",
  "ΕΜΦΥΣΗΣΗ": "Εμφύσηση",
};

type ProgressLevel = "none" | "photos_only" | "works_only" | "complete";

const progressConfig: Record<ProgressLevel, { icon: typeof CheckCircle2; classes: string; label: string }> = {
  none: {
    icon: Circle,
    classes: "bg-muted/50 text-muted-foreground border-border",
    label: "Κενό",
  },
  photos_only: {
    icon: Camera,
    classes: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400",
    label: "Μόνο φωτό",
  },
  works_only: {
    icon: Wrench,
    classes: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400",
    label: "Μόνο εργασίες",
  },
  complete: {
    icon: CheckCircle2,
    classes: "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400",
    label: "Πλήρες",
  },
};

const ConstructionProgressTab = ({ assignments, isLoading }: Props) => {
  const { organizationId } = useOrganization();
  const { data: profiles = [] } = useProfiles();

  const constructionAssignments = useMemo(
    () => assignments.filter((a) => a.status === "construction"),
    [assignments]
  );

  const assignmentIds = constructionAssignments.map((a) => a.id);

  // Fetch constructions with photo_counts and works
  const { data: constructions = [] } = useQuery({
    queryKey: ["constructions-progress", assignmentIds.join(",")],
    enabled: assignmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("constructions")
        .select("id, assignment_id, sr_id, photo_counts, status")
        .in("assignment_id", assignmentIds);
      if (error) throw error;
      return data as any[];
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
  const constructionByAssignment = useMemo(() => {
    const map: Record<string, any> = {};
    constructions.forEach((c: any) => {
      map[c.assignment_id] = c;
    });
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
    (profiles || []).forEach((p: any) => {
      m[p.user_id] = p.full_name;
    });
    return m;
  }, [profiles]);

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
        const construction = constructionByAssignment[a.id];
        const photoCounts: Record<string, number> = construction?.photo_counts || {};
        const photoCategories = Object.entries(photoCounts).filter(([, count]) => (count as number) > 0);
        const totalPhotos = photoCategories.reduce((sum, [, count]) => sum + (count as number), 0);
        const worksCount = construction ? (worksPerConstruction[construction.id] || 0) : 0;

        const hasPhotos = totalPhotos > 0;
        const hasWorks = worksCount > 0;

        let progressLevel: ProgressLevel = "none";
        if (hasPhotos && hasWorks) progressLevel = "complete";
        else if (hasPhotos) progressLevel = "photos_only";
        else if (hasWorks) progressLevel = "works_only";

        // Progress: photos = 50%, works = 50%
        const progress = (hasPhotos ? 50 : 0) + (hasWorks ? 50 : 0);

        const timeData = timePerAssignment[a.id];
        const startedAt = constructionStartMap[a.id];
        const pConfig = progressConfig[progressLevel];

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
                  <span className={`text-xs font-bold ${
                    progress === 100 ? "text-green-600" : progress > 0 ? "text-amber-600" : "text-muted-foreground"
                  }`}>
                    {progress}%
                  </span>
                </div>
                <div className="w-20 h-2.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full flex">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${progress}%` }}
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
              <span className={`flex items-center gap-1 ${hasPhotos ? "text-foreground font-medium" : ""}`}>
                <Camera className="h-3 w-3" />
                {totalPhotos} φωτο
              </span>
              <span className={`flex items-center gap-1 ${hasWorks ? "text-foreground font-medium" : ""}`}>
                <Wrench className="h-3 w-3" />
                {worksCount} εργασίες
              </span>
            </div>

            {/* Photo categories from Drive */}
            {photoCategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {photoCategories.map(([cat, count]) => (
                  <div
                    key={cat}
                    className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-400"
                  >
                    <FolderOpen className="h-3 w-3" />
                    <span>{PHOTO_CATEGORY_LABELS[cat] || cat}</span>
                    <span className="opacity-70">{count as number}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Overall status chip */}
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${pConfig.classes}`}>
                <pConfig.icon className="h-3 w-3" />
                <span>{pConfig.label}</span>
              </div>
              {!hasPhotos && !hasWorks && (
                <span className="text-[11px] text-muted-foreground/60 italic">
                  Δεν υπάρχουν δεδομένα ακόμα
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ConstructionProgressTab;
