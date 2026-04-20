import { motion, AnimatePresence } from "framer-motion";
import { Check, X, ShieldCheck, AlertTriangle } from "lucide-react";
import type { PhotoChecklistSummary } from "@/hooks/usePhotoChecklist";

interface Props {
  summary: PhotoChecklistSummary | null;
  phase: number;
  compact?: boolean;
}

export const PhotoChecklist = ({ summary, phase, compact = false }: Props) => {
  if (!summary || summary.items.length === 0) return null;

  const progress =
    summary.total_required > 0
      ? Math.round((summary.total_satisfied / summary.total_required) * 100)
      : 100;

  const isReady = summary.all_required_satisfied;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border overflow-hidden ${
        isReady
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5"
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
              isReady ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
            }`}
          >
            {isReady ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {isReady
                ? "Έτοιμο για ολοκλήρωση!"
                : `Λείπουν ${summary.missing_required.length} υποχρεωτικές κατηγορίες`}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Φάση {phase} · {summary.total_satisfied}/{summary.total_required} υποχρεωτικές
            </p>
          </div>
          <div
            className={`text-lg font-bold tabular-nums ${
              isReady ? "text-emerald-600" : "text-amber-600"
            }`}
          >
            {progress}%
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={`h-full rounded-full ${isReady ? "bg-emerald-500" : "bg-amber-500"}`}
          />
        </div>
      </div>

      {/* Items list */}
      {!compact && (
        <div className="divide-y divide-border/40">
          <AnimatePresence>
            {summary.items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <span className="text-lg">{item.category_icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {item.category_label}
                    </p>
                    {item.is_required ? (
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                        Υποχρ.
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        Προαιρ.
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {item.current_count}/{item.min_count} φωτογραφίες
                    {item.missing > 0 && (
                      <span className="text-amber-600 font-medium"> · λείπουν {item.missing}</span>
                    )}
                  </p>
                </div>
                {item.is_satisfied ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 shrink-0">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </div>
                ) : item.is_required ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/15 text-destructive shrink-0">
                    <X className="h-3.5 w-3.5" strokeWidth={3} />
                  </div>
                ) : (
                  <div className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/30 shrink-0" />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
};

export default PhotoChecklist;
