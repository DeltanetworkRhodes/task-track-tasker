import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navigation, Phone, ArrowRight, MapPin } from "lucide-react";
import { hapticFeedback } from "@/lib/haptics";

interface Props {
  /** Sorted list of upcoming/active SRs to cycle through */
  assignments: any[];
  onOpen: (a: any) => void;
}

/**
 * Linear.app × Apple iOS hero.
 *  • 72px JetBrains Mono live clock — the time IS the design
 *  • Tap anywhere on the card → cycle to next mission with smooth fade
 *  • Crisp dark aesthetic, all colors via design tokens
 *  • Status accent bar driven by countdown urgency
 */
const NextUpHero = ({ assignments, onOpen }: Props) => {
  const [now, setNow] = useState(() => new Date());
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);

  // Live clock — tick every second
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Reset cycle index when list size changes
  useEffect(() => {
    if (idxRef.current >= assignments.length) {
      idxRef.current = 0;
      setIdx(0);
    }
  }, [assignments.length]);

  if (!assignments.length) return null;

  const assignment = assignments[idx % assignments.length];
  const total = assignments.length;

  const apptAt = assignment.appointment_at
    ? new Date(assignment.appointment_at).getTime()
    : null;
  const diffMs = apptAt ? apptAt - now.getTime() : null;
  const diffMin = diffMs !== null ? Math.round(diffMs / 60000) : null;

  const countdown = (() => {
    if (diffMin === null) return null;
    if (diffMin > 60 * 24) {
      const d = Math.floor(diffMin / (60 * 24));
      return `+${d}d`;
    }
    if (diffMin > 60) return `+${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
    if (diffMin > 0) return `+${diffMin}m`;
    if (diffMin > -60) return `−${Math.abs(diffMin)}m`;
    return "OVERDUE";
  })();

  const isUrgent = diffMin !== null && diffMin >= -30 && diffMin <= 60;
  const isOverdue = diffMin !== null && diffMin < -30;

  const navUrl = assignment.address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(assignment.address)}`
    : null;
  const callUrl = assignment.customer_mobile || assignment.phone;

  const handleCardTap = (e: React.MouseEvent) => {
    // Don't cycle if user clicked an interactive element
    const target = e.target as HTMLElement;
    if (target.closest("a, button")) return;
    if (total <= 1) return;
    hapticFeedback.light();
    const next = (idx + 1) % total;
    idxRef.current = next;
    setIdx(next);
  };

  // Live clock string — HH:MM (no seconds for legibility)
  const clockStr = now.toLocaleTimeString("el-GR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const secondsStr = now
    .toLocaleTimeString("el-GR", { second: "2-digit", hour12: false })
    .padStart(2, "0");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, filter: "blur(12px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      onClick={handleCardTap}
      className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card/70 backdrop-blur-xl cursor-pointer select-none group"
      style={{
        boxShadow:
          "0 0 0 1px hsl(var(--primary) / 0.08), 0 12px 40px -16px hsl(var(--primary) / 0.18), inset 0 1px 0 hsl(var(--foreground) / 0.04)",
      }}
    >
      {/* Status accent bar — top edge */}
      <div
        className={`absolute top-0 left-0 right-0 h-px transition-colors duration-700 ${
          isOverdue
            ? "bg-destructive"
            : isUrgent
            ? "bg-gradient-to-r from-transparent via-warning to-transparent"
            : "bg-gradient-to-r from-transparent via-primary/60 to-transparent"
        }`}
      />

      {/* Subtle inner grid — Linear-style */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, hsl(var(--foreground)) 0, hsl(var(--foreground)) 1px, transparent 1px, transparent 24px)",
        }}
      />

      <div className="relative p-6 space-y-5">
        {/* Header: eyebrow + cycle indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <span
              className={`inline-block h-1 w-1 rounded-full ${
                isOverdue
                  ? "bg-destructive animate-pulse"
                  : isUrgent
                  ? "bg-warning animate-pulse"
                  : "bg-primary"
              }`}
            />
            {apptAt ? "NEXT MISSION" : "ACTIVE"}
          </div>

          {total > 1 && (
            <div className="flex items-center gap-1.5">
              {assignments.slice(0, Math.min(total, 6)).map((_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full transition-all duration-400 ${
                    i === idx % Math.min(total, 6)
                      ? "w-4 bg-foreground/80"
                      : "w-1 bg-foreground/20"
                  }`}
                />
              ))}
              {total > 6 && (
                <span className="text-[9px] font-mono text-muted-foreground tabular-nums ml-1">
                  +{total - 6}
                </span>
              )}
            </div>
          )}
        </div>

        {/* THE CLOCK — 72px JetBrains Mono. Time IS the design. */}
        <div className="flex items-baseline gap-2 -my-1">
          <h1
            className="font-mono text-[72px] font-light leading-none tracking-tight text-foreground tabular-nums"
            style={{
              fontFeatureSettings: '"tnum" 1, "ss01" 1',
              textShadow: "0 0 40px hsl(var(--primary) / 0.15)",
            }}
          >
            {apptAt
              ? new Date(apptAt).toLocaleTimeString("el-GR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })
              : clockStr}
          </h1>
          <div className="font-mono text-xs text-muted-foreground tabular-nums pb-2">
            {apptAt ? null : `:${secondsStr}`}
          </div>
        </div>

        {/* Countdown + SR ID */}
        <div className="flex items-center justify-between -mt-2">
          <div className="font-mono text-xs text-muted-foreground tracking-wider">
            {assignment.sr_id}
          </div>
          {countdown && (
            <div
              className={`font-mono text-xs font-semibold tabular-nums tracking-wider ${
                isOverdue
                  ? "text-destructive"
                  : isUrgent
                  ? "text-warning"
                  : "text-muted-foreground"
              }`}
            >
              {countdown}
            </div>
          )}
        </div>

        {/* Mission details — fade-cycled */}
        <AnimatePresence mode="wait">
          <motion.div
            key={assignment.id}
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-1.5 min-h-[3rem]"
          >
            {assignment.customer_name && (
              <p className="text-base font-medium text-foreground/95 leading-tight truncate">
                {assignment.customer_name}
              </p>
            )}
            {assignment.address && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground leading-snug">
                <MapPin className="h-3 w-3 mt-0.5 shrink-0 opacity-60" />
                <span className="truncate">{assignment.address}</span>
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Actions — Linear-style ghost buttons */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          {navUrl ? (
            <a
              href={navUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => hapticFeedback.light()}
              className="flex items-center justify-center gap-1.5 h-10 rounded-xl border border-border/60 bg-background/40 text-foreground text-xs font-medium hover:bg-background/80 hover:border-border transition-all backdrop-blur-sm"
            >
              <Navigation className="h-3.5 w-3.5" />
              Nav
            </a>
          ) : (
            <div className="h-10" />
          )}
          {callUrl ? (
            <a
              href={`tel:${callUrl}`}
              onClick={() => hapticFeedback.light()}
              className="flex items-center justify-center gap-1.5 h-10 rounded-xl border border-border/60 bg-background/40 text-foreground text-xs font-medium hover:bg-background/80 hover:border-border transition-all backdrop-blur-sm"
            >
              <Phone className="h-3.5 w-3.5" />
              Call
            </a>
          ) : (
            <div className="h-10" />
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              hapticFeedback.medium();
              onOpen(assignment);
            }}
            className="flex items-center justify-center gap-1.5 h-10 rounded-xl bg-foreground text-background text-xs font-semibold hover:bg-foreground/90 transition-all"
          >
            Open
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Tap hint — only when there's more to cycle */}
        {total > 1 && (
          <p className="text-center text-[10px] font-mono text-muted-foreground/50 tracking-widest uppercase pt-1">
            Tap card to cycle · {idx + 1} / {total}
          </p>
        )}
      </div>
    </motion.div>
  );
};

export default NextUpHero;
