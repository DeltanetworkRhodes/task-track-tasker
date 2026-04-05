import { useTimeTracking } from "@/hooks/useTimeTracking";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogIn, Timer } from "lucide-react";
import { toast } from "sonner";

interface Props {
  assignmentId: string;
  srId: string;
}


const TimeTracker = ({ assignmentId, srId }: Props) => {
  const { activeEntry, checkIn } =
    useTimeTracking(assignmentId);

  const handleCheckIn = async () => {
    try {
      await checkIn.mutateAsync();
      toast.success("✅ Check In επιτυχές!");
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα check-in");
    }
  };

  if (activeEntry) {
    return (
      <Card className="p-3 border-green-500/30 bg-green-500/5">
        <div className="flex items-center gap-2 justify-center">
          <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium text-green-600">Checked In — Σε εξέλιξη</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-3 space-y-3 border-amber-500/30 bg-amber-500/5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" />
          Check In / Out
        </p>
      </div>

      <Button
        size="sm"
        className="w-full gap-2 min-h-[44px] bg-amber-500 hover:bg-amber-600 text-white"
        onClick={handleCheckIn}
        disabled={checkIn.isPending}
      >
        <LogIn className="h-4 w-4" />
        Check In
      </Button>
    </Card>
  );
};

export default TimeTracker;
