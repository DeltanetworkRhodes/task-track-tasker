import { useState } from "react";
import { MapPin, Phone, Calendar, MessageSquare, ChevronDown, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const statusFlow: { value: string; label: string }[] = [
  { value: "pending", label: "Αναμονή" },
  { value: "inspection", label: "Αυτοψία" },
  { value: "pre_committed", label: "Προδέσμευση" },
  { value: "construction", label: "Κατασκευή" },
  { value: "completed", label: "Ολοκληρώθηκε" },
];

const statusLabels: Record<string, string> = Object.fromEntries(
  statusFlow.map((s) => [s.value, s.label])
);

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  inspection: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  pre_committed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  construction: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  completed: "bg-green-500/10 text-green-600 border-green-500/20",
};

interface Props {
  assignments: any[];
  loading: boolean;
}

const TechnicianAssignments = ({ assignments, loading }: Props) => {
  const [updating, setUpdating] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleStatusChange = async (assignmentId: string, newStatus: string, oldStatus: string) => {
    setUpdating(assignmentId);
    try {
      const { error } = await supabase
        .from("assignments")
        .update({ status: newStatus })
        .eq("id", assignmentId);
      if (error) throw error;

      toast.success(`Κατάσταση → ${statusLabels[newStatus]}`);
      queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });

      // If changed to inspection, trigger automated email
      if (newStatus === "inspection" && oldStatus !== "inspection") {
        try {
          const assignment = assignments.find((a) => a.id === assignmentId);
          await supabase.functions.invoke("send-inspection-email", {
            body: {
              assignment_id: assignmentId,
              sr_id: assignment?.sr_id,
              area: assignment?.area,
              customer_name: assignment?.customer_name,
              address: assignment?.address,
              cab: assignment?.cab,
              comments: assignment?.comments,
            },
          });
          toast.success("Αυτόματο email αυτοψίας εστάλη");
        } catch (emailErr) {
          console.error("Email error:", emailErr);
          // Don't block status change if email fails
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα ενημέρωσης");
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Δεν υπάρχουν αναθέσεις</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {assignments.map((a) => (
        <Card key={a.id} className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-sm text-foreground">SR {a.sr_id}</p>
              <p className="text-xs text-muted-foreground">{a.area}</p>
            </div>
            <div className="flex-shrink-0">
              {updating === a.id ? (
                <Badge variant="outline" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                </Badge>
              ) : (
                <Select
                  value={a.status}
                  onValueChange={(val) => handleStatusChange(a.id, val, a.status)}
                >
                  <SelectTrigger className="h-7 w-[130px] text-[11px] border-border/50 px-2">
                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium ${statusColors[a.status] || ""}`}>
                      {statusLabels[a.status] || a.status}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {statusFlow.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-xs">
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium ${statusColors[s.value]}`}>
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {a.address && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {a.address}
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {a.customer_name && <span>{a.customer_name}</span>}
            {a.phone && (
              <a href={`tel:${a.phone}`} className="flex items-center gap-1 text-primary">
                <Phone className="h-3 w-3" />
                {a.phone}
              </a>
            )}
          </div>

          {a.comments && (
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{a.comments}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {new Date(a.created_at).toLocaleDateString("el-GR")}
          </div>
        </Card>
      ))}
    </div>
  );
};

export default TechnicianAssignments;
