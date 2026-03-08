import { WifiOff, CloudUpload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  online: boolean;
  pendingCount: number;
  onSync: () => void;
}

const OfflineBanner = ({ online, pendingCount, onSync }: Props) => {
  if (online && pendingCount === 0) return null;

  return (
    <div
      className={`px-4 py-2 flex items-center justify-between gap-3 text-sm font-medium ${
        !online
          ? "bg-destructive/10 text-destructive border-b border-destructive/20"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-b border-amber-500/20"
      }`}
    >
      <div className="flex items-center gap-2">
        {!online ? (
          <>
            <WifiOff className="h-4 w-4" />
            <span>Εκτός σύνδεσης — Οι αλλαγές αποθηκεύονται τοπικά</span>
          </>
        ) : (
          <>
            <CloudUpload className="h-4 w-4" />
            <span>{pendingCount} αυτοψ{pendingCount === 1 ? "ία" : "ίες"} αναμένουν συγχρονισμό</span>
          </>
        )}
      </div>
      {online && pendingCount > 0 && (
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onSync}>
          <CloudUpload className="h-3 w-3" />
          Sync τώρα
        </Button>
      )}
    </div>
  );
};

export default OfflineBanner;
