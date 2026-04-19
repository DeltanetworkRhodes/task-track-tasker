import { useLocationTracking } from "@/hooks/useLocationTracking";
import { MapPin, MapPinOff, Loader2 } from "lucide-react";
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
    <div className="flex flex-col items-center gap-1.5 w-full">
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`group relative flex items-center justify-center gap-2 w-full max-w-[260px] rounded-2xl px-5 py-3 text-[13px] font-semibold transition-all active:scale-[0.97] ${
          isOnline
            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 ring-1 ring-emerald-400/40"
            : "bg-card text-foreground border border-border/70 shadow-sm hover:border-primary/40 hover:bg-muted/40"
        }`}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Σύνδεση...</span>
          </>
        ) : isOnline ? (
          <>
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-white/70 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
            <MapPin className="h-4 w-4" />
            <span className="tracking-tight">Online — Ενεργό GPS</span>
          </>
        ) : (
          <>
            <MapPinOff className="h-4 w-4 text-muted-foreground" />
            <span className="tracking-tight">Πάτα για ενεργοποίηση GPS</span>
          </>
        )}
      </button>
      {gpsError && (
        <span className="text-[10px] text-destructive text-center max-w-[240px] leading-tight px-2">
          {gpsError}
        </span>
      )}
    </div>
  );
};

export default GpsOnlineToggle;
