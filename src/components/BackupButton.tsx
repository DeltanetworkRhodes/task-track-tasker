import { useState } from "react";
import { Download, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TABLES_TO_BACKUP = [
  // OTE
  "assignments",
  "ote_articles",
  "sr_billing_items",
  "profit_per_sr",
  "materials",
  "construction_works",
  "construction_materials",
  "constructions",
  "gis_data",
  "inspection_reports",
  // Vodafone
  "vodafone_articles",
  "subcontractors",
  "subcontractor_pricing",
  "vodafone_tickets",
  "vodafone_ticket_services",
  "subcontractor_payments",
  // Common
  "profiles",
  "organizations",
  "org_settings",
  "user_roles",
  "appointments",
];

export function BackupButton() {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [progress, setProgress] = useState("");

  const handleBackup = async () => {
    setIsBackingUp(true);
    setProgress("Έναρξη...");

    try {
      const backup: Record<string, any> = {
        _metadata: {
          created_at: new Date().toISOString(),
          version: "1.0",
          app: "DeltaNetwork",
        },
        tables: {} as Record<string, any>,
      };

      let totalRows = 0;

      for (const table of TABLES_TO_BACKUP) {
        setProgress(`Backup: ${table}...`);
        const { data, error } = await supabase.from(table as any).select("*");

        if (error) {
          console.warn(`Skip ${table}:`, error.message);
          backup.tables[table] = { error: error.message, rows: [] };
          continue;
        }

        backup.tables[table] = {
          count: data?.length || 0,
          rows: data || [],
        };
        totalRows += data?.length || 0;
      }

      backup._metadata.total_rows = totalRows;
      backup._metadata.tables_count = TABLES_TO_BACKUP.length;

      // Create JSON file
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const date = new Date().toISOString().split("T")[0];
      const filename = `deltanetwork-backup-${date}.json`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Log backup (best-effort)
      try {
        await supabase.from("backup_log" as any).insert({
          filename,
          total_rows: totalRows,
          tables_count: TABLES_TO_BACKUP.length,
        } as any);
      } catch {
        // ignore
      }

      toast.success(
        `✅ Backup ολοκληρώθηκε! ${totalRows.toLocaleString("el-GR")} γραμμές`,
      );
      setProgress("");
    } catch (err: any) {
      toast.error(`Backup απέτυχε: ${err.message}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <Card className="border-success/30 bg-success/5 p-5">
      <div className="flex flex-col sm:flex-row items-start gap-4">
        <div className="rounded-xl bg-success/10 p-3 shrink-0">
          <ShieldCheck className="h-6 w-6 text-success" />
        </div>

        <div className="flex-1 space-y-3 w-full">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-foreground">
              💾 Backup Δεδομένων
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Κατέβασε όλα τα δεδομένα του app ως JSON αρχείο. Σύστασή μας:
              τρέχε το backup κάθε Δευτέρα και αποθήκευσέ το στο Google Drive.
            </p>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <p>📦 Περιλαμβάνει: assignments, OTE articles, billing, Vodafone tickets, subcontractors, profit data</p>
            <p>🔒 Read-only — δεν τροποποιεί τίποτα</p>
            <p>⏱️ Διάρκεια: ~10-30 δευτερόλεπτα</p>
          </div>

          {progress && (
            <div className="text-xs font-medium text-success bg-success/10 rounded-lg px-3 py-2">
              {progress}
            </div>
          )}

          <Button
            onClick={handleBackup}
            disabled={isBackingUp}
            className="w-full sm:w-auto"
          >
            {isBackingUp ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Backup σε εξέλιξη...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Backup Now
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
