import { useState, useEffect } from "react";
import { useTimeTracking } from "@/hooks/useTimeTracking";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Square, Clock, Timer } from "lucide-react";
import { toast } from "sonner";

interface Props {
  assignmentId: string;
  srId: string;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} λεπτά`;
  return `${h}ω ${m}λ`;
}

function LiveTimer({ checkIn }: { checkIn: string }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = Date.now() - new Date(checkIn).getTime();
      const totalSec = Math.floor(diff / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      setElapsed(
        h > 0
          ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
          : `${m}:${String(s).padStart(2, "0")}`
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [checkIn]);

  return (
    <span className="font-mono text-lg font-bold text-green-600 tabular-nums">
      {elapsed}
    </span>
  );
}

const TimeTracker = ({ assignmentId, srId }: Props) => {
  const { entries, activeEntry, totalMinutes, checkIn, checkOut } =
    useTimeTracking(assignmentId);

  const handleCheckIn = async () => {
    try {
      await checkIn.mutateAsync();
      toast.success("⏱️ Χρονομέτρηση ξεκίνησε!");
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα check-in");
    }
  };

  const handleCheckOut = async () => {
    try {
      await checkOut.mutateAsync();
      toast.success("⏹️ Χρονομέτρηση σταμάτησε!");
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα check-out");
    }
  };

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" />
          Χρονομέτρηση
        </p>
        {totalMinutes > 0 && (
          <Badge variant="outline" className="text-xs gap-1">
            <Clock className="h-3 w-3" />
            Σύνολο: {formatDuration(totalMinutes)}
          </Badge>
        )}
      </div>

      {activeEntry ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
            <LiveTimer checkIn={activeEntry.check_in} />
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5 min-h-[40px]"
            onClick={handleCheckOut}
            disabled={checkOut.isPending}
          >
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          className="w-full gap-2 min-h-[40px] bg-green-600 hover:bg-green-700 text-white"
          onClick={handleCheckIn}
          disabled={checkIn.isPending}
        >
          <Play className="h-4 w-4" />
          Έναρξη Χρονομέτρησης
        </Button>
      )}

      {/* Recent entries */}
      {entries.filter((e) => e.check_out).length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Ιστορικό
          </p>
          {entries
            .filter((e) => e.check_out)
            .slice(0, 5)
            .map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between text-xs text-muted-foreground"
              >
                <span>
                  {new Date(e.check_in).toLocaleDateString("el-GR", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  {new Date(e.check_in).toLocaleTimeString("el-GR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" → "}
                  {new Date(e.check_out!).toLocaleTimeString("el-GR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="font-medium text-foreground">
                  {formatDuration(e.duration_minutes || 0)}
                </span>
              </div>
            ))}
        </div>
      )}
    </Card>
  );
};

export default TimeTracker;
