import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { CALL_STATUS, type CallStatusKey } from "@/lib/callStatus";
import CallStatusBadge from "@/components/CallStatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone, Save, Loader2 } from "lucide-react";

function getTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "τώρα";
  if (diffMins < 60) return `${diffMins}λ πριν`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}ω πριν`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}μ πριν`;
}

interface CallStatusPopoverProps {
  assignment: {
    id: string;
    srId?: string;
    sr_id?: string;
    customerName?: string;
    customer_name?: string;
    phone?: string;
    call_status?: string;
    callStatus?: string;
    call_notes?: string;
    callNotes?: string;
    last_called_at?: string;
    lastCalledAt?: string;
    call_count?: number;
    callCount?: number;
    appointment_at?: string;
    appointmentAt?: string;
  };
  children: React.ReactNode;
}

const CallStatusPopover = ({ assignment, children }: CallStatusPopoverProps) => {
  const { user } = useAuth();
  const srId = assignment.srId || assignment.sr_id || "";
  const customerName = assignment.customerName || assignment.customer_name || "";
  const phone = assignment.phone || "";
  const currentStatus = (assignment.callStatus || assignment.call_status || "not_called") as CallStatusKey;
  const currentNotes = assignment.callNotes || assignment.call_notes || "";
  const lastCalledAt = assignment.lastCalledAt || assignment.last_called_at || null;
  const callCount = assignment.callCount || assignment.call_count || 0;
  const currentAppointment = assignment.appointmentAt || assignment.appointment_at || "";

  const [open, setOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<CallStatusKey>(currentStatus);
  const [notes, setNotes] = useState(currentNotes);
  const [appointmentDate, setAppointmentDate] = useState(
    currentAppointment ? currentAppointment.slice(0, 16) : ""
  );
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setSelectedStatus(currentStatus);
      setNotes(currentNotes);
      setAppointmentDate(currentAppointment ? currentAppointment.slice(0, 16) : "");
    }
    setOpen(isOpen);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const statusChanged = selectedStatus !== currentStatus;
      const newCallCount = statusChanged && selectedStatus !== "not_called"
        ? callCount + 1
        : callCount;

      const updateData: any = {
        call_status: selectedStatus,
        call_notes: notes || null,
        call_count: newCallCount,
      };

      if (statusChanged && selectedStatus !== "not_called") {
        updateData.last_called_at = new Date().toISOString();
      }

      if (selectedStatus === "scheduled" && appointmentDate) {
        updateData.appointment_at = new Date(appointmentDate).toISOString();
      } else if (selectedStatus !== "scheduled") {
        updateData.appointment_at = null;
      }

      const { error } = await supabase
        .from("assignments")
        .update(updateData)
        .eq("id", assignment.id);

      if (error) throw error;

      // Auto-save call notes as SR comment
      if (notes && notes.trim() && user) {
        const statusLabel = CALL_STATUS[selectedStatus]?.label || selectedStatus;
        const commentMessage = `📞 ${statusLabel}: ${notes.trim()}`;
        await supabase.from("sr_comments").insert({
          assignment_id: assignment.id,
          user_id: user.id,
          message: commentMessage,
          organization_id: null, // will be set by context if needed
        }).then(({ error: commentErr }) => {
          if (commentErr) console.error("Failed to save call note as comment:", commentErr);
        });
      }

      toast.success("Η κατάσταση κλήσης ενημερώθηκε");
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["sr-comments"] });
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα αποθήκευσης");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div>
            <h4 className="font-bold text-sm flex items-center gap-1.5">
              📞 Κατάσταση Κλήσης
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {srId} · {customerName}
            </p>
            {phone && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">📱 {phone}</span>
                <button
                  onClick={() => window.open(`tel:${phone}`, "_self")}
                  className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                >
                  <Phone className="h-3 w-3" />
                  Κλήση
                </button>
              </div>
            )}
          </div>

          {/* Status options */}
          <div className="space-y-1.5">
            {(Object.entries(CALL_STATUS) as [CallStatusKey, typeof CALL_STATUS[CallStatusKey]][]).map(
              ([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setSelectedStatus(key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                    selectedStatus === key
                      ? `${cfg.color} ${cfg.border} ring-1 ring-current/20`
                      : "border-transparent hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <span>{cfg.icon}</span>
                  <span>{cfg.label}</span>
                  {selectedStatus === key && (
                    <span className="ml-auto text-[10px]">✓</span>
                  )}
                </button>
              )
            )}
          </div>

          {/* Appointment date (only for scheduled) */}
          {selectedStatus === "scheduled" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Ημ/νία ραντεβού
              </label>
              <Input
                type="datetime-local"
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Σημειώσεις
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Προσθέστε σημειώσεις..."
              className="text-xs min-h-[60px] resize-none"
            />
          </div>

          {/* Stats */}
          {(callCount > 0 || lastCalledAt) && (
            <div className="text-[10px] text-muted-foreground border-t border-border pt-2">
              Κλήσεις: {callCount}
              {lastCalledAt && <> · Τελευταία: {getTimeAgo(lastCalledAt)}</>}
            </div>
          )}

          {/* Save button */}
          <Button onClick={handleSave} disabled={saving} className="w-full gap-2" size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Αποθήκευση
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default CallStatusPopover;
