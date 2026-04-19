import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, ArrowRight, Clock, MapPin, User } from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  assignment: any | null;
}

/**
 * Admin variant of NextUpHero — surfaces the next org-wide appointment
 * (regardless of technician) with countdown + 1-tap navigation to the SR.
 */
const AdminNextUpHero = ({ assignment }: Props) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!assignment) return null;

  const apptAt = assignment.appointment_at
    ? new Date(assignment.appointment_at).getTime()
    : null;
  const diffMs = apptAt ? apptAt - now : null;
  const diffMin = diffMs !== null ? Math.round(diffMs / 60000) : null;

  const countdown = (() => {
    if (diffMin === null) return null;
    if (diffMin > 60 * 24) {
      const d = Math.floor(diffMin / (60 * 24));
      return `σε ${d} ${d === 1 ? "μέρα" : "μέρες"}`;
    }
    if (diffMin > 60) return `σε ${Math.floor(diffMin / 60)}ω ${diffMin % 60}λ`;
    if (diffMin > 0) return `σε ${diffMin} λεπτά`;
    if (diffMin > -60) return `${Math.abs(diffMin)} λεπτά πίσω`;
    return "καθυστερημένο";
  })();

  const isUrgent = diffMin !== null && diffMin >= -30 && diffMin <= 60;
  const isOverdue = diffMin !== null && diffMin < -30;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-3xl border border-border/60 bg-card shadow-lg"
    >
      <motion.div
        className="absolute inset-0 opacity-60"
        animate={{
          background: [
            "radial-gradient(120% 80% at 0% 0%, hsl(var(--primary)/0.18), transparent 60%)",
            "radial-gradient(120% 80% at 100% 100%, hsl(var(--accent)/0.18), transparent 60%)",
            "radial-gradient(120% 80% at 0% 0%, hsl(var(--primary)/0.18), transparent 60%)",
          ],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      />
      <div
        className={`absolute top-0 left-0 right-0 h-[3px] ${
          isOverdue
            ? "bg-destructive"
            : isUrgent
            ? "bg-gradient-to-r from-primary via-accent to-primary"
            : "bg-border"
        }`}
      />

      <div className="relative p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                isOverdue
                  ? "bg-destructive animate-pulse"
                  : isUrgent
                  ? "bg-accent animate-pulse"
                  : "bg-primary"
              }`}
            />
            Επόμενο ραντεβού οργανισμού
          </div>
          {countdown && (
            <motion.span
              key={countdown}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-center gap-1 text-[11px] font-bold tabular-nums px-2 py-1 rounded-full ${
                isOverdue
                  ? "bg-destructive/15 text-destructive"
                  : isUrgent
                  ? "bg-accent/15 text-accent"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Clock className="h-3 w-3" />
              {countdown}
            </motion.span>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-base font-bold text-foreground">
              {assignment.sr_id}
            </span>
            {apptAt && (
              <span className="font-mono text-2xl font-bold tabular-nums text-foreground leading-none">
                {new Date(apptAt).toLocaleString("el-GR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </span>
            )}
          </div>
          {assignment.customer_name && (
            <p className="text-sm font-medium text-foreground/90 leading-tight truncate">
              {assignment.customer_name}
            </p>
          )}
          {assignment.address && (
            <p className="flex items-start gap-1 text-xs text-muted-foreground leading-snug">
              <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="truncate">{assignment.address}</span>
            </p>
          )}
          {assignment.technician_name && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">{assignment.technician_name}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Link
            to="/calendar"
            className="flex items-center justify-center gap-1.5 h-10 rounded-xl bg-muted text-foreground text-xs font-semibold hover:bg-muted/70 transition-colors"
          >
            <Calendar className="h-3.5 w-3.5" />
            Ημερολόγιο
          </Link>
          <Link
            to="/assignments"
            className="flex items-center justify-center gap-1.5 h-10 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground text-xs font-bold shadow-md hover:shadow-lg transition-all"
          >
            Αναθέσεις
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
};

export default AdminNextUpHero;
