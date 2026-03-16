export type CallStatusKey = "not_called" | "no_answer" | "sms_sent" | "scheduled" | "declined";

export const CALL_STATUS: Record<CallStatusKey, {
  label: string;
  icon: string;
  color: string;
  border: string;
}> = {
  not_called: {
    label: "Δεν κλήθηκε",
    icon: "📵",
    color: "bg-slate-500/15 text-slate-400",
    border: "border-slate-500/30",
  },
  no_answer: {
    label: "Δεν απάντησε",
    icon: "📞",
    color: "bg-orange-500/15 text-orange-400",
    border: "border-orange-500/30",
  },
  sms_sent: {
    label: "SMS εστάλη",
    icon: "💬",
    color: "bg-blue-500/15 text-blue-400",
    border: "border-blue-500/30",
  },
  scheduled: {
    label: "Ραντεβού ✓",
    icon: "✅",
    color: "bg-green-500/15 text-green-400",
    border: "border-green-500/30",
  },
  declined: {
    label: "Αρνήθηκε",
    icon: "❌",
    color: "bg-red-500/15 text-red-400",
    border: "border-red-500/30",
  },
};
