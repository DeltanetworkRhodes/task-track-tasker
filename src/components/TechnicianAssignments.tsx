import { useState } from "react";
import { MapPin, Phone, Calendar, MessageSquare, Loader2, Eye, FileEdit, CheckCircle, Clock, HardHat, XCircle, Ban } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import SurveyForm from "@/components/SurveyForm";
import IncompleteSurveys from "@/components/IncompleteSurveys";
import ConstructionForm from "@/components/ConstructionForm";

const statusFlow: { value: string; label: string }[] = [
  { value: "pending", label: "Αναμονή" },
  { value: "inspection", label: "Αυτοψία" },
  { value: "pre_committed", label: "Προδέσμευση" },
  { value: "waiting_ote", label: "Αναμονή ΟΤΕ" },
  { value: "construction", label: "Κατασκευή" },
  { value: "completed", label: "Ολοκληρώθηκε" },
  { value: "cancelled", label: "Ακυρωμένο" },
];

const statusLabels: Record<string, string> = Object.fromEntries(
  statusFlow.map((s) => [s.value, s.label])
);

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  inspection: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  pre_committed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  waiting_ote: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  construction: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  completed: "bg-green-500/10 text-green-600 border-green-500/20",
  cancelled: "bg-red-500/10 text-red-600 border-red-500/20",
};

interface Props {
  assignments: any[];
  loading: boolean;
}

const TechnicianAssignments = ({ assignments, loading }: Props) => {
  const { user } = useAuth();
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [showConstructionForm, setShowConstructionForm] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const queryClient = useQueryClient();

  // Fetch existing survey for selected assignment
  const { data: existingSurvey } = useQuery({
    queryKey: ["assignment-survey", selectedAssignment?.sr_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("surveys")
        .select("*")
        .eq("sr_id", selectedAssignment!.sr_id)
        .eq("technician_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!selectedAssignment && !!user,
  });

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
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα ενημέρωσης");
    } finally {
      setUpdating(null);
    }
  };

  const handleStartSurvey = async (assignment: any) => {
    if (assignment.status === "pending") {
      await handleStatusChange(assignment.id, "inspection", assignment.status);
    }
    setShowSurveyForm(true);
  };

  const handleSurveyComplete = () => {
    setShowSurveyForm(false);
    setSelectedAssignment(null);
    queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
  };

  const handleCancelAssignment = async () => {
    if (!cancelReason.trim()) {
      toast.error("Παρακαλώ εισάγετε λόγο ακύρωσης");
      return;
    }
    if (!selectedAssignment) return;

    setCancelling(true);
    try {
      // 1. Update assignment status to cancelled with comment
      const { error } = await supabase
        .from("assignments")
        .update({
          status: "cancelled",
          comments: selectedAssignment.comments
            ? `${selectedAssignment.comments}\n\n[ΑΚΥΡΩΣΗ]: ${cancelReason}`
            : `[ΑΚΥΡΩΣΗ]: ${cancelReason}`,
        })
        .eq("id", selectedAssignment.id);
      if (error) throw error;

      // 2. Send cancellation email
      try {
        await supabase.functions.invoke("send-cancellation-email", {
          body: {
            assignment_id: selectedAssignment.id,
            sr_id: selectedAssignment.sr_id,
            area: selectedAssignment.area,
            customer_name: selectedAssignment.customer_name,
            address: selectedAssignment.address,
            cancellation_reason: cancelReason,
          },
        });
        toast.success("Email ακύρωσης εστάλη");
      } catch (emailErr) {
        console.error("Cancellation email error:", emailErr);
      }

      // 3. Move SR folder to ΑΚΥΡΩΜΕΝΕΣ ΚΑΤΑΣΚΕΥΕΣ in Drive
      try {
        await supabase.functions.invoke("move-cancelled-folder", {
          body: {
            sr_id: selectedAssignment.sr_id,
            area: selectedAssignment.area,
            assignment_id: selectedAssignment.id,
          },
        });
        toast.success("Ο φάκελος μεταφέρθηκε στις ΑΚΥΡΩΜΕΝΕΣ ΚΑΤΑΣΚΕΥΕΣ");
      } catch (moveErr) {
        console.error("Move folder error:", moveErr);
      }

      toast.success("Η ανάθεση ακυρώθηκε");
      queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
      setShowCancelDialog(false);
      setCancelReason("");
      setSelectedAssignment(null);
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα ακύρωσης");
    } finally {
      setCancelling(false);
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

  const renderStatusAction = (assignment: any) => {
    const status = assignment.status;

    if (status === "cancelled") {
      return (
        <div className="flex items-center gap-2 text-red-600 justify-center py-2">
          <Ban className="h-5 w-5" />
          <span className="text-sm font-medium">Ακυρωμένο</span>
        </div>
      );
    }

    if (status === "pending" || status === "inspection") {
      return (
        <div className="space-y-2">
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={() => handleStartSurvey(assignment)}
          >
            <FileEdit className="h-4 w-4" />
            {existingSurvey ? "Συνέχεια Αυτοψίας" : "Έναρξη Αυτοψίας"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => { setShowCancelDialog(true); }}
          >
            <XCircle className="h-4 w-4" />
            Ακύρωση
          </Button>
        </div>
      );
    }

    if (status === "pre_committed") {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-cyan-600 justify-center py-2">
            <Clock className="h-5 w-5" />
            <span className="text-sm font-medium">Αναμονή απάντησης ΟΤΕ</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => { setShowCancelDialog(true); }}
          >
            <XCircle className="h-4 w-4" />
            Ακύρωση
          </Button>
        </div>
      );
    }

    if (status === "waiting_ote" || status === "construction") {
      return (
        <div className="space-y-2">
          <Button size="sm" className="w-full gap-2" onClick={() => setShowConstructionForm(true)}>
            <HardHat className="h-4 w-4" />
            Φόρμα Κατασκευής
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => { setShowCancelDialog(true); }}
          >
            <XCircle className="h-4 w-4" />
            Ακύρωση
          </Button>
        </div>
      );
    }

    if (status === "completed") {
      return (
        <div className="flex items-center gap-2 text-green-600 justify-center py-2">
          <CheckCircle className="h-5 w-5" />
          <span className="text-sm font-medium">Ολοκληρωμένο</span>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <div className="space-y-3">
        {assignments.map((a) => (
          <Card
            key={a.id}
            className="p-4 space-y-2 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => { setSelectedAssignment(a); setShowSurveyForm(false); setShowConstructionForm(false); }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-foreground">SR {a.sr_id}</p>
                <p className="text-xs text-muted-foreground">{a.area}</p>
              </div>
              <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                {updating === a.id ? (
                  <Badge variant="outline" className="gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                  </Badge>
                ) : (
                  <Badge variant="outline" className={statusColors[a.status] || ""}>
                    {statusLabels[a.status] || a.status}
                  </Badge>
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
                <a href={`tel:${a.phone}`} className="flex items-center gap-1 text-primary" onClick={(e) => e.stopPropagation()}>
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

      {/* SR Detail Sheet */}
      <Sheet open={!!selectedAssignment} onOpenChange={(open) => { if (!open) { setSelectedAssignment(null); setShowSurveyForm(false); setShowConstructionForm(false); } }}>
        <SheetContent side="bottom" className="h-[90vh] p-0">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="text-left">
              SR {selectedAssignment?.sr_id}
            </SheetTitle>
            <SheetDescription className="text-left">
              {selectedAssignment?.area} · {selectedAssignment?.customer_name || "—"}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(90vh-80px)] px-4 pb-6">
            {selectedAssignment && !showSurveyForm && !showConstructionForm && (
              <div className="space-y-4">
                {/* Status badge */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Κατάσταση:</span>
                  <Badge variant="outline" className={statusColors[selectedAssignment.status] || ""}>
                    {statusLabels[selectedAssignment.status] || selectedAssignment.status}
                  </Badge>
                </div>

                {/* SR Info */}
                <Card className="p-3 space-y-2 text-sm">
                  {selectedAssignment.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>{selectedAssignment.address}</span>
                    </div>
                  )}
                  {selectedAssignment.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <a href={`tel:${selectedAssignment.phone}`} className="text-primary">{selectedAssignment.phone}</a>
                    </div>
                  )}
                  {selectedAssignment.cab && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs font-medium">CAB:</span>
                      <span>{selectedAssignment.cab}</span>
                    </div>
                  )}
                  {selectedAssignment.comments && (
                    <div className="flex items-start gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{selectedAssignment.comments}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>{new Date(selectedAssignment.created_at).toLocaleDateString("el-GR")}</span>
                  </div>
                </Card>

                {/* Existing survey info */}
                {existingSurvey && (
                  <Card className="p-3 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {existingSurvey.status === "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ"
                        ? "Αυτοψία"
                        : selectedAssignment.status === "completed"
                          ? "Ολοκλήρωση Κατασκευής"
                          : "Εντολή Κατασκευής"}
                    </p>
                    <Badge variant="outline" className={
                      existingSurvey.status === "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ"
                        ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                        : "bg-green-500/10 text-green-600 border-green-500/20"
                    }>
                      {existingSurvey.status === "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ"
                        ? existingSurvey.status
                        : selectedAssignment.status === "completed"
                          ? "Ολοκληρωμένη Κατασκευή"
                          : "Προδέσμευση Υλικών"}
                    </Badge>
                    {existingSurvey.comments && (
                      <p className="text-xs text-muted-foreground mt-1">{existingSurvey.comments}</p>
                    )}
                  </Card>
                )}

                {/* Incomplete survey file uploads */}
                {existingSurvey?.status === "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ" && (
                  <IncompleteSurveys filterSrId={selectedAssignment.sr_id} />
                )}

                {/* Status-based action */}
                <div className="pt-2">
                  {renderStatusAction(selectedAssignment)}
                </div>
              </div>
            )}

            {/* Survey Form (inline in sheet) */}
            {selectedAssignment && showSurveyForm && (
              <SurveyForm
                prefillSrId={selectedAssignment.sr_id}
                prefillArea={selectedAssignment.area}
                onComplete={handleSurveyComplete}
              />
            )}

            {/* Construction Form (inline in sheet) */}
            {selectedAssignment && showConstructionForm && (
              <ConstructionForm
                assignment={selectedAssignment}
                onComplete={() => {
                  setShowConstructionForm(false);
                  setSelectedAssignment(null);
                  queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
                }}
              />
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Cancel Assignment Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={(open) => { if (!open) { setShowCancelDialog(false); setCancelReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Ακύρωση Ανάθεσης
            </DialogTitle>
            <DialogDescription>
              SR {selectedAssignment?.sr_id} — {selectedAssignment?.area}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">
              Λόγος Ακύρωσης <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="π.χ. Ο πελάτης δεν ήταν διαθέσιμος, ακύρωσε το ραντεβού..."
              rows={4}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowCancelDialog(false); setCancelReason(""); }}>
              Πίσω
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelAssignment}
              disabled={cancelling || !cancelReason.trim()}
              className="gap-2"
            >
              {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
              Ακύρωση Ανάθεσης
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TechnicianAssignments;
