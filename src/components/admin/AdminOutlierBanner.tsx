import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronDown, ChevronUp, Clock, Wallet } from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  staleAssignments: any[]; // active >7d no update
  missedAppointments: any[]; // appointment_at in the past, still pending
  unpaidLong: any[]; // submitted >30d
}

/**
 * Admin outliers: stale active SRs, missed appointments, long-unpaid.
 * Collapsible amber banner — drives action, not noise.
 */
const AdminOutlierBanner = ({ staleAssignments, missedAppointments, unpaidLong }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const total = staleAssignments.length + missedAppointments.length + unpaidLong.length;
  if (total === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl border border-warning/40 bg-warning/5"
    >
      <button
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-warning/10 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-warning/15 flex items-center justify-center">
            <AlertTriangle className="h-4 w-4 text-warning" />
          </div>
          <div>
            <p className="text-xs font-bold text-warning uppercase tracking-wider leading-tight">
              {total} {total === 1 ? "Outlier" : "Outliers"} · Χρειάζονται προσοχή
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
              {missedAppointments.length > 0 && <span>{missedAppointments.length} χαμένα ραντεβού</span>}
              {staleAssignments.length > 0 && <span>· {staleAssignments.length} αδρανή &gt;7μ</span>}
              {unpaidLong.length > 0 && <span>· {unpaidLong.length} απλήρωτα &gt;30μ</span>}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-warning" />
        ) : (
          <ChevronDown className="h-4 w-4 text-warning" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-1.5">
              {missedAppointments.map((a) => {
                const apptAt = new Date(a.appointment_at).getTime();
                const hoursAgo = Math.round((Date.now() - apptAt) / 3600000);
                const label =
                  hoursAgo < 24 ? `${hoursAgo}ω πριν` : `${Math.floor(hoursAgo / 24)} μέρες πριν`;
                return (
                  <Link
                    key={`missed-${a.id}`}
                    to="/assignments"
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-card border border-destructive/20 hover:border-destructive/40 transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">{a.sr_id}</span>
                        <span className="text-[10px] font-bold text-destructive uppercase">Χαμένο</span>
                      </div>
                      {a.address && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {a.address.split(",")[0]}
                        </p>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-destructive tabular-nums shrink-0">
                      <Clock className="h-3 w-3" />
                      {label}
                    </span>
                  </Link>
                );
              })}
              {staleAssignments.map((a) => {
                const daysAgo = Math.round(
                  (Date.now() - new Date(a.updated_at).getTime()) / 86400000
                );
                return (
                  <Link
                    key={`stale-${a.id}`}
                    to="/assignments"
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-card border border-warning/20 hover:border-warning/40 transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">{a.sr_id}</span>
                        <span className="text-[10px] font-bold text-warning uppercase">Αδρανές</span>
                      </div>
                      {a.address && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {a.address.split(",")[0]}
                        </p>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-warning tabular-nums shrink-0">
                      <Clock className="h-3 w-3" />
                      {daysAgo}μ
                    </span>
                  </Link>
                );
              })}
              {unpaidLong.map((a) => {
                const daysAgo = Math.round(
                  (Date.now() - new Date(a.submitted_at || a.updated_at).getTime()) / 86400000
                );
                return (
                  <Link
                    key={`unpaid-${a.id}`}
                    to="/assignments"
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-card border border-warning/20 hover:border-warning/40 transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">{a.sr_id}</span>
                        <span className="text-[10px] font-bold text-warning uppercase">Απλήρωτο</span>
                      </div>
                      {a.payment_amount > 0 && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {Number(a.payment_amount).toLocaleString("el-GR")}€
                        </p>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-warning tabular-nums shrink-0">
                      <Wallet className="h-3 w-3" />
                      {daysAgo}μ
                    </span>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default AdminOutlierBanner;
