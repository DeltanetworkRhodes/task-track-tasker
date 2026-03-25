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
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all shadow-md ${
          isOnline
            ? "bg-green-500 text-white hover:bg-green-600 ring-2 ring-green-400/30"
            : "bg-muted text-muted-foreground hover:bg-muted-foreground/20 border border-border"
        }`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isOnline ? (
          <>
            <MapPin className="h-4 w-4" />
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            Online
          </>
        ) : (
          <>
            <MapPinOff className="h-4 w-4" />
            Offline — Πάτα για GPS
          </>
        )}
      </button>
      {gpsError && (
        <span className="text-[10px] text-destructive text-center max-w-[200px]">
          {gpsError}
        </span>
      )}
    </div>
  );
};

export default GpsOnlineToggle;
