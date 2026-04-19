import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronDown, ChevronUp, Clock } from "lucide-react";

interface Props {
  staleAssignments: any[]; // updated_at > 7 days ago, still active
  missedAppointments: any[]; // appointment_at in the past, no recent update
  onOpen: (a: any) => void;
}

/**
 * Fuselab principle: "Surface outliers, don't hide them."
 * Amber banner with stale SRs + missed appointments. Collapsible.
 */
const OutlierBanner = ({ staleAssignments, missedAppointments, onOpen }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const total = staleAssignments.length + missedAppointments.length;
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
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {missedAppointments.length > 0 &&
                `${missedAppointments.length} χαμένα ραντεβού`}
              {missedAppointments.length > 0 && staleAssignments.length > 0 && " · "}
              {staleAssignments.length > 0 &&
                `${staleAssignments.length} αδρανή >7 μέρες`}
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
                  hoursAgo < 24
                    ? `${hoursAgo}ω πριν`
                    : `${Math.floor(hoursAgo / 24)} μέρες πριν`;
                return (
                  <button
                    key={`missed-${a.id}`}
                    onClick={() => onOpen(a)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-card border border-destructive/20 hover:border-destructive/40 transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">
                          {a.sr_id}
                        </span>
                        <span className="text-[10px] font-bold text-destructive uppercase">
                          Χαμένο
                        </span>
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
                  </button>
                );
              })}
              {staleAssignments.map((a) => {
                const daysAgo = Math.round(
                  (Date.now() - new Date(a.updated_at).getTime()) / 86400000
                );
                return (
                  <button
                    key={`stale-${a.id}`}
                    onClick={() => onOpen(a)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-card border border-warning/20 hover:border-warning/40 transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">
                          {a.sr_id}
                        </span>
                        <span className="text-[10px] font-bold text-warning uppercase">
                          Αδρανές
                        </span>
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
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default OutlierBanner;
