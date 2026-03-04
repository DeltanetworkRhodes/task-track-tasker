import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const SyncButton = () => {
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSync = async () => {
    setSyncing(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-sync", {
        body: {},
      });

      if (error) throw error;

      if (data?.setup_required) {
        toast({
          title: "Ρύθμιση απαιτείται",
          description: "Πρέπει να ρυθμιστεί το Google Service Account Key. Επικοινωνήστε με τον διαχειριστή.",
          variant: "destructive",
        });
        return;
      }

      setLastResult(data?.synced);
      const total = (data?.synced?.assignments || 0) + (data?.synced?.constructions || 0) + (data?.synced?.materials || 0) + (data?.synced?.rodos || 0) + (data?.synced?.kos || 0) + (data?.synced?.work_pricing || 0);
      const errors = data?.synced?.errors?.length || 0;

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["constructions"] });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: ["work_pricing"] });

      toast({
        title: "Συγχρονισμός ολοκληρώθηκε",
        description: `${total} εγγραφές ενημερώθηκαν${errors > 0 ? ` (${errors} σφάλματα)` : ""}`,
        variant: errors > 0 ? "destructive" : "default",
      });
    } catch (err: any) {
      toast({
        title: "Σφάλμα συγχρονισμού",
        description: err.message || "Αποτυχία σύνδεσης",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleSync}
        disabled={syncing}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Συγχρονισμός..." : "Sync από Drive"}
      </Button>
      {lastResult && (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          {lastResult.errors?.length > 0 ? (
            <AlertCircle className="h-3 w-3 text-destructive" />
          ) : (
            <CheckCircle className="h-3 w-3 text-green-500" />
          )}
          {lastResult.rodos || 0}Ρ / {lastResult.kos || 0}Κ / {lastResult.constructions}C / {lastResult.materials}M / {lastResult.work_pricing || 0}P / {lastResult.drive_matched || 0}📁
        </span>
      )}
    </div>
  );
};

export default SyncButton;
