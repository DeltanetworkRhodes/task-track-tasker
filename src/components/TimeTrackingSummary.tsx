import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Clock, Timer, User } from "lucide-react";

interface Props {
  assignmentId: string;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} λεπτά`;
  return `${h}ω ${m}λ`;
}

const TimeTrackingSummary = ({ assignmentId }: Props) => {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["time-entries-admin", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_time_entries" as any)
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("check_in", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!assignmentId,
  });

  // Fetch technician names
  const techIds = [...new Set((entries as any[]).map((e: any) => e.technician_id))];
  const { data: profiles } = useQuery({
    queryKey: ["profiles-for-time", techIds.join(",")],
    queryFn: async () => {
      if (techIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", techIds);
      return data || [];
    },
    enabled: techIds.length > 0,
  });

  const nameMap: Record<string, string> = {};
  (profiles || []).forEach((p: any) => {
    nameMap[p.user_id] = p.full_name;
  });

  if (isLoading || entries.length === 0) return null;

  const totalMinutes = (entries as any[]).reduce(
    (sum: number, e: any) => sum + (e.duration_minutes || 0),
    0
  );

  const activeEntries = (entries as any[]).filter((e: any) => !e.check_out);

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Timer className="h-3.5 w-3.5" /> Χρονομέτρηση Εργασίας
      </h3>
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{formatDuration(totalMinutes)}</span>
          <span className="text-muted-foreground text-xs">σύνολο</span>
        </div>
        {activeEntries.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-green-600 font-medium">
              {activeEntries.length} ενεργό
            </span>
          </div>
        )}
      </div>
      <div className="space-y-1">
        {(entries as any[]).map((e: any) => (
          <div
            key={e.id}
            className="flex items-center justify-between text-xs text-muted-foreground py-1 border-b border-border/20 last:border-0"
          >
            <div className="flex items-center gap-2">
              <User className="h-3 w-3" />
              <span>{nameMap[e.technician_id] || "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span>
                {new Date(e.check_in).toLocaleDateString("el-GR", {
                  day: "numeric",
                  month: "short",
                })}{" "}
                {new Date(e.check_in).toLocaleTimeString("el-GR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {e.check_out
                  ? ` → ${new Date(e.check_out).toLocaleTimeString("el-GR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : ""}
              </span>
              {e.duration_minutes ? (
                <span className="font-medium text-foreground">
                  {formatDuration(e.duration_minutes)}
                </span>
              ) : (
                <span className="text-green-600 font-medium">⏱ σε εξέλιξη</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TimeTrackingSummary;
