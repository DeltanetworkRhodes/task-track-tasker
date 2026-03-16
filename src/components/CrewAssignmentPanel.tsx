import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useWorkCategories, useCrewAssignments } from "@/hooks/useCrewData";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Users, Save } from "lucide-react";

interface Props {
  assignment: any;
}

const CrewAssignmentPanel = ({ assignment }: Props) => {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const { data: categories, isLoading: catLoading } = useWorkCategories();
  const { data: crewAssignments, isLoading: crewLoading } = useCrewAssignments(assignment?.id);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Fetch technicians
  const { data: technicians } = useQuery({
    queryKey: ["technicians"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "technician" as any);
      if (!roles?.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, area")
        .in("user_id", roles.map((r) => r.user_id));
      return profiles || [];
    },
  });

  const crewMap = useMemo(() => {
    const map: Record<string, any> = {};
    (crewAssignments || []).forEach((ca: any) => {
      map[ca.category_id] = ca;
    });
    return map;
  }, [crewAssignments]);

  // The responsible person (from the assignment)
  const responsibleId = assignment?.technicianId || assignment?.technician_id || null;

  // Get effective technician for a category: override > existing crew > responsible
  const getEffectiveTech = (categoryId: string) => {
    if (overrides[categoryId] !== undefined) return overrides[categoryId];
    return crewMap[categoryId]?.technician_id || responsibleId || "";
  };

  const techName = (id: string) => technicians?.find((t) => t.user_id === id)?.full_name || "";

  const savedCount = (crewAssignments || []).filter((ca: any) => ca.status === "saved").length;
  const totalCategories = (categories || []).length;
  const progressPercent = totalCategories > 0 ? (savedCount / totalCategories) * 100 : 0;

  // Check if there are unsaved overrides
  const hasChanges = Object.keys(overrides).length > 0;

  const handleSave = async () => {
    if (!assignment?.id || !organizationId || !categories) return;
    setSaving(true);
    try {
      for (const cat of categories) {
        const techId = getEffectiveTech(cat.id);
        if (!techId) continue;

        const existing = crewMap[cat.id];
        await supabase
          .from("sr_crew_assignments" as any)
          .upsert({
            assignment_id: assignment.id,
            organization_id: organizationId,
            category_id: cat.id,
            technician_id: techId,
            status: existing?.status || "pending",
          }, { onConflict: "assignment_id,category_id" });
      }

      toast.success("Αναθέσεις αποθηκεύτηκαν!");
      setOverrides({});
      queryClient.invalidateQueries({ queryKey: ["sr_crew_assignments", assignment.id] });
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα αποθήκευσης");
    } finally {
      setSaving(false);
    }
  };

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
        <h3 className="text-sm font-bold">Εργασίες Συνεργείων</h3>
      </div>

      <div className="space-y-1.5">
        {categories.map((cat: any) => {
          const crew = crewMap[cat.id];
          const status = crew?.status;
          const effectiveTech = getEffectiveTech(cat.id);
          const isOverridden = overrides[cat.id] !== undefined || 
            (crew?.technician_id && crew.technician_id !== responsibleId);

          return (
            <div key={cat.id} className="flex items-center gap-2 border border-border rounded-lg px-2.5 py-2">
              <span className="text-xs">{statusIcon(status)}</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium">{cat.name}</span>
                {crew?.saved_at && (
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(crew.saved_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
              <Select
                value={effectiveTech || "__responsible__"}
                onValueChange={(val) => {
                  if (val === "__responsible__" || val === responsibleId) {
                    // Reset to responsible
                    setOverrides(prev => {
                      const next = { ...prev };
                      delete next[cat.id];
                      // If crew already has responsible, no override needed
                      if (crewMap[cat.id]?.technician_id === responsibleId) {
                        return next;
                      }
                      next[cat.id] = responsibleId || "";
                      return next;
                    });
                  } else {
                    setOverrides(prev => ({ ...prev, [cat.id]: val }));
                  }
                }}
              >
                <SelectTrigger className={`h-7 text-[10px] w-[130px] ${isOverridden ? 'border-warning/50 bg-warning/5' : ''}`}>
                  <SelectValue placeholder="Υπεύθυνος" />
                </SelectTrigger>
                <SelectContent>
                  {responsibleId && (
                    <SelectItem value={responsibleId}>
                      👤 {techName(responsibleId)} (Υπεύθ.)
                    </SelectItem>
                  )}
                  {(technicians || [])
                    .filter((t) => t.user_id !== responsibleId)
                    .map((t) => (
                      <SelectItem key={t.user_id} value={t.user_id}>
                        {t.full_name}{t.area ? ` (${t.area})` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Πρόοδος</span>
          <span className="font-bold">{savedCount}/{totalCategories}</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {hasChanges && (
        <Button onClick={handleSave} disabled={saving} className="w-full gap-2" size="sm">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Αποθήκευση Αλλαγών
        </Button>
      )}
    </Card>
  );
};

export default CrewAssignmentPanel;
