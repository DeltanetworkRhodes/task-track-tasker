import { WifiOff, CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  online: boolean;
  pendingCount: number;
  pendingSurveyCount?: number;
  pendingConstructionCount?: number;
  onSync: () => void;
}

const OfflineBanner = ({ online, pendingCount, pendingSurveyCount = 0, pendingConstructionCount = 0, onSync }: Props) => {
  if (online && pendingCount === 0) return null;

  const buildPendingText = () => {
    const parts: string[] = [];
    if (pendingSurveyCount > 0) {
      parts.push(`${pendingSurveyCount} αυτοψ${pendingSurveyCount === 1 ? "ία" : "ίες"}`);
    }
    if (pendingConstructionCount > 0) {
      parts.push(`${pendingConstructionCount} κατασκευ${pendingConstructionCount === 1 ? "ή" : "ές"}`);
    }
    if (parts.length === 0 && pendingCount > 0) {
      return `${pendingCount} εγγραφές αναμένουν συγχρονισμό`;
    }
    return `${parts.join(" + ")} αναμέν${pendingCount === 1 ? "ει" : "ουν"} συγχρονισμό`;
  };

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
            <span>{buildPendingText()}</span>
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
