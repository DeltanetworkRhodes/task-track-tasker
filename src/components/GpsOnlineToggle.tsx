import { useLocationTracking } from "@/hooks/useLocationTracking";
import { Loader2 } from "lucide-react";
import { useState } from "react";

const GpsOnlineToggle = () => {
  const { isOnline, gpsError, goOnline, goOffline } = useLocationTracking();
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        await goOffline();
      } else {
        await goOnline();
      }
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 w-full">
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`group relative inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition-all active:scale-[0.96] backdrop-blur-xl ${
          isOnline
            ? "bg-emerald-500/90 text-white shadow-[0_2px_8px_rgba(16,185,129,0.35)] ring-1 ring-emerald-400/50"
            : "bg-card/80 text-foreground/80 border border-border/60 shadow-sm hover:bg-muted/60"
        }`}
      >
        {loading ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>...</span>
          </>
        ) : isOnline ? (
          <>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-white/80 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            <span className="tracking-tight">GPS Online</span>
          </>
        ) : (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
            <span className="tracking-tight">Ενεργοποίηση GPS</span>
          </>
        )}
      </button>
      {gpsError && (
        <span className="text-[9px] text-destructive text-center max-w-[220px] leading-tight px-2">
          {gpsError}
        </span>
      )}
    </div>
  );
};

export default GpsOnlineToggle;
