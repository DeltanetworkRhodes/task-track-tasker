import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Navigation, Phone, ArrowRight, Clock, MapPin } from "lucide-react";

interface Assignment {
  id: string;
  sr_id: string;
  address?: string | null;
  customer_name?: string | null;
  customer_mobile?: string | null;
  appointment_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status: string;
}

interface Props {
  assignments: Assignment[];
  onOpen?: (a: Assignment) => void;
}

const NextUpHero = ({ assignments, onOpen }: Props) => {
  // Find next upcoming appointment, or fallback to most recent active SR
  const next = (() => {
    const now = Date.now();
    const upcoming = assignments
      .filter((a) => a.appointment_at && new Date(a.appointment_at).getTime() > now - 30 * 60 * 1000)
      .sort(
        (a, b) =>
          new Date(a.appointment_at!).getTime() -
          new Date(b.appointment_at!).getTime()
      );
    return upcoming[0] || null;
  })();

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!next) return null;

  const apptTime = new Date(next.appointment_at!).getTime();
  const diffMin = Math.round((apptTime - now) / 60_000);
  const isPast = diffMin < 0;
  const isSoon = diffMin >= 0 && diffMin <= 60;

  let countdownLabel = "";
  if (isPast) {
    const overdue = Math.abs(diffMin);
    countdownLabel = overdue < 60 ? `${overdue}′ καθυστέρηση` : "Σε εξέλιξη";
  } else if (diffMin < 60) {
    countdownLabel = `σε ${diffMin}′`;
  } else if (diffMin < 60 * 24) {
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    countdownLabel = `σε ${h}ω ${m > 0 ? `${m}′` : ""}`.trim();
  } else {
    const d = Math.floor(diffMin / (60 * 24));
    countdownLabel = `σε ${d} ημ.`;
  }

  const apptDate = new Date(next.appointment_at!);
  const todayLabel = (() => {
    const t = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(t.getDate() + 1);
    if (apptDate.toDateString() === t.toDateString()) return "Σήμερα";
    if (apptDate.toDateString() === tomorrow.toDateString()) return "Αύριο";
    return apptDate.toLocaleDateString("el-GR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  })();

  const accentBar = isPast
    ? "from-destructive to-warning"
    : isSoon
    ? "from-accent to-primary"
    : "from-primary to-accent";

  const navUrl =
    next.latitude && next.longitude
      ? `https://www.google.com/maps/dir/?api=1&destination=${next.latitude},${next.longitude}`
      : next.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          next.address
        )}`
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-3xl glass-strong border border-border/50 shadow-[0_12px_40px_-12px_hsl(185_70%_42%/0.3)]"
    >
      {/* Glow accent */}
      <div className="absolute -top-16 -right-16 h-44 w-44 rounded-full bg-gradient-to-br from-accent/40 to-primary/30 blur-3xl pointer-events-none" />
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${accentBar} ${
          isSoon || isPast ? "shadow-[0_0_12px_hsl(var(--accent))]" : ""
        }`}
      />

      <div className="relative p-4 space-y-3">
        {/* Header row: label + countdown */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Επόμενο
            </span>
            <span className="text-[10px] font-semibold text-foreground/70 bg-muted/60 backdrop-blur-md px-2 py-0.5 rounded-full">
              {todayLabel}
            </span>
          </div>
          <motion.div
            key={countdownLabel}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
              isPast
                ? "bg-destructive/15 text-destructive border border-destructive/30"
                : isSoon
                ? "bg-accent/20 text-accent border border-accent/40"
                : "bg-primary/15 text-primary border border-primary/30"
            }`}
          >
            <Clock className="h-3 w-3" />
            <span className="tabular-nums">{countdownLabel}</span>
          </motion.div>
        </div>

        {/* Big time + SR ID */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-4xl font-bold tabular-nums leading-none text-gradient-primary">
              {apptDate.toLocaleTimeString("el-GR", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] font-mono font-bold text-foreground">
              <span className="bg-foreground/10 backdrop-blur-md px-1.5 py-0.5 rounded">
                {next.sr_id}
              </span>
              {next.customer_name && (
                <span className="text-muted-foreground font-sans font-medium truncate">
                  {next.customer_name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Address */}
        {next.address && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/70" />
            <span className="leading-tight">{next.address}</span>
          </div>
        )}

        {/* Quick actions */}
        <div className="flex items-center gap-2 pt-1">
          {navUrl && (
            <a
              href={navUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-2xl bg-gradient-to-r from-primary to-accent text-primary-foreground text-[12px] font-bold shadow-[0_4px_14px_-4px_hsl(185_70%_42%/0.5)] active:scale-95 transition-transform"
            >
              <Navigation className="h-3.5 w-3.5" />
              Πλοήγηση
            </a>
          )}
          {next.customer_mobile && (
            <a
              href={`tel:${next.customer_mobile}`}
              className="h-10 px-3 inline-flex items-center justify-center gap-1.5 rounded-2xl glass border border-border/60 text-foreground text-[12px] font-bold active:scale-95 transition-transform"
            >
              <Phone className="h-3.5 w-3.5" />
              Κλήση
            </a>
          )}
          {onOpen && (
            <button
              onClick={() => onOpen(next)}
              className="h-10 w-10 inline-flex items-center justify-center rounded-2xl glass border border-border/60 text-foreground/70 active:scale-95 transition-transform"
              aria-label="Άνοιγμα"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default NextUpHero;
