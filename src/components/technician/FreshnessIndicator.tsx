import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

interface Props {
  lastUpdatedAt: number | null;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

/**
 * Fuselab principle: data freshness indicators.
 * Shows last sync time + online status with manual refresh button.
 */
const FreshnessIndicator = ({ lastUpdatedAt, onRefresh, isRefreshing }: Props) => {
  const [tick, setTick] = useState(0);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const label = (() => {
    if (!lastUpdatedAt) return "—";
    const sec = Math.floor((Date.now() - lastUpdatedAt) / 1000);
    if (sec < 30) return "τώρα";
    if (sec < 60) return `${sec}δ πριν`;
    if (sec < 3600) return `${Math.floor(sec / 60)}λ πριν`;
    return `${Math.floor(sec / 3600)}ω πριν`;
  })();

  // tick is read here just to make the formatted label re-evaluate on interval
  void tick;

  return (
    <div className="flex items-center justify-between text-[10px] uppercase tracking-wider px-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {isOnline ? (
          <>
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-success"
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="font-bold tabular-nums">Live</span>
          </>
        ) : (
          <>
            <WifiOff className="h-3 w-3 text-destructive" />
            <span className="font-bold text-destructive">Offline</span>
          </>
        )}
        <span className="text-border">·</span>
        <span className="tabular-nums">Sync {label}</span>
      </div>
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        <motion.span
          animate={isRefreshing ? { rotate: 360 } : { rotate: 0 }}
          transition={
            isRefreshing
              ? { duration: 1, repeat: Infinity, ease: "linear" }
              : { duration: 0.3 }
          }
        >
          <RefreshCw className="h-3 w-3" />
        </motion.span>
        <span className="font-bold">Refresh</span>
      </button>
    </div>
  );
};

export default FreshnessIndicator;
