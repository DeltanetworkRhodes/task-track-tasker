import { useEffect, useState, useMemo } from "react";

/**
 * Ambient atmosphere layer for Technician Dashboard.
 * Combines:
 *  - Animated SVG film grain (Awwwards 2026 signature)
 *  - Linear.app horizontal grid lines (depth without noise)
 *  - 3-layer ambient glow: time-of-day × urgency × status
 *
 * Glow color temperature system:
 *  TIME-OF-DAY (base):
 *    05–10  amber (warm sunrise)        38 95% 60%
 *    10–15  cyan  (cool midday)        185 80% 55%
 *    15–19  violet (afternoon)         265 70% 60%
 *    19–05  deep blue (night)          220 70% 45%
 *
 *  URGENCY (overlay, only when < 1h to next):
 *    < 15min  red-amber pulse          15 90% 55%
 *    < 60min  amber                    38 95% 60%
 *
 *  STATUS (accent halo on right):
 *    pending      warning amber        45 93% 47%
 *    inspection   primary cyan        185 70% 50%
 *    pre_committed accent green       160 55% 45%
 *    construction success green       140 50% 42%
 *    completed    muted               210 14% 55%
 */

interface Props {
  /** ms until next appointment; null = unknown */
  minutesUntilNext: number | null;
  /** current SR status to drive accent halo */
  status?: string | null;
}

const STATUS_HUE: Record<string, string> = {
  pending: "45 93% 47%",
  inspection: "185 70% 50%",
  pre_committed: "160 55% 45%",
  construction: "140 50% 42%",
  completed: "210 14% 55%",
};

const AmbientCanvas = ({ minutesUntilNext, status }: Props) => {
  const [hour, setHour] = useState(() => new Date().getHours());

  // Re-evaluate hour every 5 min — glow shifts with the day
  useEffect(() => {
    const t = setInterval(() => setHour(new Date().getHours()), 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  // Time-of-day base color
  const baseHsl = useMemo(() => {
    if (hour >= 5 && hour < 10) return "38 95% 60%"; // sunrise amber
    if (hour >= 10 && hour < 15) return "185 80% 55%"; // midday cyan
    if (hour >= 15 && hour < 19) return "265 70% 60%"; // afternoon violet
    return "220 70% 45%"; // night deep blue
  }, [hour]);

  // Urgency overlay
  const urgencyHsl = useMemo(() => {
    if (minutesUntilNext === null) return null;
    if (minutesUntilNext < 0) return "0 75% 55%"; // overdue red
    if (minutesUntilNext < 15) return "15 90% 55%"; // critical
    if (minutesUntilNext < 60) return "38 95% 60%"; // soon
    return null;
  }, [minutesUntilNext]);

  const statusHsl = status ? STATUS_HUE[status] || null : null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* Layer 1 — Time-of-day base glow (top-left) */}
      <div
        className="absolute -top-1/4 -left-1/4 h-[80vh] w-[80vw] rounded-full blur-3xl opacity-[0.10] transition-all duration-[3000ms] ease-out"
        style={{
          background: `radial-gradient(circle, hsl(${baseHsl}) 0%, transparent 70%)`,
        }}
      />

      {/* Layer 2 — Urgency overlay (center, pulses) */}
      {urgencyHsl && (
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 h-[60vh] w-[70vw] rounded-full blur-3xl opacity-[0.10] animate-pulse-glow transition-all duration-[2000ms]"
          style={{
            background: `radial-gradient(circle, hsl(${urgencyHsl}) 0%, transparent 65%)`,
          }}
        />
      )}

      {/* Layer 3 — Status halo (bottom-right) */}
      {statusHsl && (
        <div
          className="absolute -bottom-1/4 -right-1/4 h-[70vh] w-[70vw] rounded-full blur-3xl opacity-[0.09] transition-all duration-[2000ms] ease-out"
          style={{
            background: `radial-gradient(circle, hsl(${statusHsl}) 0%, transparent 70%)`,
          }}
        />
      )}

      {/* Linear.app horizontal grid lines */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, hsl(var(--foreground) / 0.5) 0, hsl(var(--foreground) / 0.5) 1px, transparent 1px, transparent 96px)",
          maskImage:
            "linear-gradient(180deg, transparent 0%, black 8%, black 92%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(180deg, transparent 0%, black 8%, black 92%, transparent 100%)",
        }}
      />

      {/* Animated film grain — SVG noise that drifts */}
      <div className="absolute inset-0 opacity-[0.06] mix-blend-multiply film-grain-canvas" />
    </div>
  );
};

export default AmbientCanvas;
