import { useMemo } from "react";
import { useWorkCategories, useCrewAssignments } from "@/hooks/useCrewData";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Users } from "lucide-react";

interface Props {
  assignment: any;
}

const CrewAssignmentPanel = ({ assignment }: Props) => {
  const { data: categories, isLoading: catLoading } = useWorkCategories();
  const { data: crewAssignments, isLoading: crewLoading } = useCrewAssignments(assignment?.id);

  const crewMap = useMemo(() => {
    const map: Record<string, any> = {};
    (crewAssignments || []).forEach((ca: any) => {
      map[ca.category_id] = ca;
    });
    return map;
  }, [crewAssignments]);

  const savedCount = (crewAssignments || []).filter((ca: any) => ca.status === "saved").length;
  const totalCategories = (categories || []).length;
  const progressPercent = totalCategories > 0 ? (savedCount / totalCategories) * 100 : 0;

  if (catLoading || crewLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Loader2 className="h-4 w-4 animate-spin" />
          Φόρτωση κατηγοριών...
        </div>
      </Card>
    );
  }

  if (!categories || categories.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-xs text-muted-foreground">Δεν υπάρχουν κατηγορίες εργασίας.</p>
      </Card>
    );
  }

  const statusIcon = (status: string | undefined) => {
    if (status === "saved") return "✅";
    if (status === "in_progress") return "🔵";
    return "⏳";
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold">Πρόοδος Εργασιών</h3>
      </div>

      <div className="space-y-1.5">
        {categories.map((cat: any) => {
          const crew = crewMap[cat.id];
          const status = crew?.status;
          return (
            <div key={cat.id} className="flex items-center gap-2 border border-border rounded-lg px-3 py-2">
              <span className="text-xs">{statusIcon(status)}</span>
              <span className="text-xs font-medium flex-1">{cat.name}</span>
              {crew?.saved_at && (
                <span className="text-[10px] text-muted-foreground">
                  {new Date(crew.saved_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Πρόοδος</span>
          <span className="font-bold">{savedCount}/{totalCategories}</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>
    </Card>
  );
};

export default CrewAssignmentPanel;
