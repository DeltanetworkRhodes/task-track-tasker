import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useWorkCategories, useCrewAssignments } from "@/hooks/useCrewData";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Users, Save, UserCheck } from "lucide-react";

interface Props {
  assignment: any;
}

const CrewAssignmentPanel = ({ assignment }: Props) => {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const { data: categories, isLoading: catLoading } = useWorkCategories();
  const { data: crewAssignments, isLoading: crewLoading } = useCrewAssignments(assignment?.id);
  const [selections, setSelections] = useState<Record<string, string>>({});
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

  // Build current assignment map (category_id -> crew_assignment)
  const crewMap = useMemo(() => {
    const map: Record<string, any> = {};
    (crewAssignments || []).forEach((ca: any) => {
      map[ca.category_id] = ca;
    });
    return map;
  }, [crewAssignments]);

  // Get selected technician for a category
  const getSelectedTech = (categoryId: string) => {
    if (selections[categoryId] !== undefined) return selections[categoryId];
    return crewMap[categoryId]?.technician_id || "";
  };

  const savedCount = (crewAssignments || []).filter((ca: any) => ca.status === "saved").length;
  const totalCategories = (categories || []).length;
  const progressPercent = totalCategories > 0 ? (savedCount / totalCategories) * 100 : 0;

  const handleSave = async () => {
    if (!assignment?.id || !organizationId || !categories) return;
    setSaving(true);
    try {
      const notifiedTechIds = new Set<string>();
      
      for (const cat of categories) {
        const techId = getSelectedTech(cat.id);
        if (!techId) continue;

        const existing = crewMap[cat.id];
        const isNewAssignment = !existing || existing.technician_id !== techId;

        const { error } = await supabase
          .from("sr_crew_assignments" as any)
          .upsert({
            assignment_id: assignment.id,
            organization_id: organizationId,
            category_id: cat.id,
            technician_id: techId,
            status: existing?.status || "pending",
          }, { onConflict: "assignment_id,category_id" });
        if (error) throw error;

        // Send push notification for new assignments
        if (isNewAssignment && !notifiedTechIds.has(techId)) {
          notifiedTechIds.add(techId);
          supabase.functions.invoke("send-push-notification", {
            body: {
              userId: techId,
              title: "🔧 Νέα εργασία συνεργείου",
              body: `${cat.name} · SR ${assignment.sr_id || ""} — ${assignment.address || assignment.area || ""}`,
              data: { assignmentId: assignment.id, url: "/technician" },
            },
          }).catch(console.error);
        }
      }

      toast.success("Αναθέσεις αποθηκεύτηκαν!");
      queryClient.invalidateQueries({ queryKey: ["sr_crew_assignments", assignment.id] });
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα αποθήκευσης");
    } finally {
      setSaving(false);
    }
  };

  const handleAssignAll = async (techId: string) => {
    if (!categories) return;
    const newSelections: Record<string, string> = {};
    categories.forEach((cat: any) => { newSelections[cat.id] = techId; });
    setSelections(newSelections);
    const techName = technicians?.find((t) => t.user_id === techId)?.full_name || "";
    toast.info(`Όλες οι εργασίες → ${techName}`);
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
        <p className="text-xs text-muted-foreground">Δεν υπάρχουν κατηγορίες εργασίας. Προσθέστε τες από τις Ρυθμίσεις.</p>
      </Card>
    );
  }

  const statusIcon = (status: string | undefined) => {
    if (status === "saved") return "✅";
    if (status === "in_progress") return "🔵";
    return "⏳";
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold">Συνεργεία</h3>
      </div>

      {/* Assign all */}
      <div className="flex items-center gap-2">
        <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Ένας για όλα:</span>
        <Select onValueChange={handleAssignAll}>
          <SelectTrigger className="h-7 text-[11px] flex-1">
            <SelectValue placeholder="Επιλογή τεχνικού..." />
          </SelectTrigger>
          <SelectContent>
            {(technicians || []).map((t) => (
              <SelectItem key={t.user_id} value={t.user_id}>
                {t.full_name}{t.area ? ` (${t.area})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Categories list */}
      <div className="space-y-2">
        {categories.map((cat: any) => {
          const crew = crewMap[cat.id];
          const status = crew?.status;
          return (
            <div key={cat.id} className="flex items-center gap-2 border border-border rounded-lg p-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{cat.name}</span>
                  {status && (
                    <span className="text-xs">{statusIcon(status)}</span>
                  )}
                </div>
                {crew?.saved_at && (
                  <p className="text-[10px] text-muted-foreground">
                    Saved {new Date(crew.saved_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
              <Select
                value={getSelectedTech(cat.id) || "__none__"}
                onValueChange={(val) => setSelections(prev => ({ ...prev, [cat.id]: val === "__none__" ? "" : val }))}
              >
                <SelectTrigger className="h-7 text-[10px] w-[140px]">
                  <SelectValue placeholder="Χωρίς" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Χωρίς</SelectItem>
                  {(technicians || []).map((t) => (
                    <SelectItem key={t.user_id} value={t.user_id}>
                      {t.full_name}
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

      <Button onClick={handleSave} disabled={saving} className="w-full gap-2" size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Αποθήκευση Αναθέσεων
      </Button>
    </Card>
  );
};

export default CrewAssignmentPanel;
