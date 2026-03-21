import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useProfiles } from "@/hooks/useData";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import XLSX from "xlsx-js-style";

interface ParsedRow {
  sr_id: string;
  area: string;
  address?: string;
  customer_name?: string;
  phone?: string;
  cab?: string;
  technician_email?: string;
  error?: string;
}

const COLUMN_MAP: Record<string, keyof ParsedRow> = {
  sr_id: "sr_id", "sr id": "sr_id", sr: "sr_id",
  area: "area", "περιοχή": "area", "περιοχη": "area",
  address: "address", "διεύθυνση": "address", "διευθυνση": "address",
  customer_name: "customer_name", customer: "customer_name", "πελάτης": "customer_name", "πελατης": "customer_name",
  phone: "phone", "τηλέφωνο": "phone", "τηλεφωνο": "phone",
  cab: "cab",
  technician_email: "technician_email",
};

function mapHeaders(headers: string[]): Record<number, keyof ParsedRow> {
  const mapped: Record<number, keyof ParsedRow> = {};
  headers.forEach((h, i) => {
    const key = h.trim().toLowerCase().replace(/\s+/g, " ");
    if (COLUMN_MAP[key]) mapped[i] = COLUMN_MAP[key];
  });
  return mapped;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AssignmentsImport = ({ open, onOpenChange }: Props) => {
  const { organizationId } = useOrganization();
  const { data: profiles } = useProfiles();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: number } | null>(null);

  const validRows = rows.filter(r => !r.error);
  const errorRows = rows.filter(r => !!r.error);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

        if (jsonData.length < 2) {
          toast.error("Το αρχείο είναι κενό ή δεν έχει δεδομένα");
          return;
        }

        const headerMap = mapHeaders(jsonData[0] as string[]);
        if (!Object.values(headerMap).includes("sr_id")) {
          toast.error("Δεν βρέθηκε στήλη SR ID");
          return;
        }
        if (!Object.values(headerMap).includes("area")) {
          toast.error("Δεν βρέθηκε στήλη Περιοχή / AREA");
          return;
        }

        const parsed: ParsedRow[] = [];
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as string[];
          if (!row || row.every(c => !c)) continue;

          const item: ParsedRow = { sr_id: "", area: "" };
          for (const [colIdx, field] of Object.entries(headerMap)) {
            const val = String(row[Number(colIdx)] || "").trim();
            if (val) (item as any)[field] = val;
          }

          if (!item.sr_id) item.error = "SR ID λείπει";
          else if (!item.area) item.error = "Περιοχή λείπει";

          parsed.push(item);
        }

        setRows(parsed);
        setDone(false);
        setImportResult(null);
      } catch (err: any) {
        toast.error("Σφάλμα ανάγνωσης: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!organizationId || validRows.length === 0) return;
    setImporting(true);
    setProgress(0);

    const emailToId = new Map<string, string>();
    (profiles || []).forEach(p => {
      if (p.email) emailToId.set(p.email.toLowerCase(), p.user_id);
    });

    const BATCH = 50;
    let created = 0;
    let errors = 0;

    for (let i = 0; i < validRows.length; i += BATCH) {
      const batch = validRows.slice(i, i + BATCH).map(r => ({
        sr_id: r.sr_id,
        area: r.area,
        address: r.address || null,
        customer_name: r.customer_name || null,
        phone: r.phone || null,
        cab: r.cab || null,
        organization_id: organizationId,
        status: "pending",
        source_tab: r.area,
        technician_id: r.technician_email
          ? emailToId.get(r.technician_email.toLowerCase()) || null
          : null,
      }));

      const { error } = await supabase.from("assignments").insert(batch);
      if (error) {
        console.error("Batch error:", error.message);
        errors += batch.length;
      } else {
        created += batch.length;
      }

      setProgress(Math.round(((i + batch.length) / validRows.length) * 100));
    }

    setImporting(false);
    setDone(true);
    setImportResult({ created, errors });
    queryClient.invalidateQueries({ queryKey: ["assignments"] });

    if (errors === 0) {
      toast.success(`✅ ${created} αναθέσεις εισήχθησαν επιτυχώς!`);
    } else {
      toast.warning(`${created} εισήχθησαν, ${errors} απέτυχαν`);
    }
  };

  const reset = () => {
    setRows([]);
    setDone(false);
    setImportResult(null);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Εισαγωγή Αναθέσεων από Excel
          </DialogTitle>
        </DialogHeader>

        {rows.length === 0 && !done && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ανέβασε αρχείο Excel (.xlsx) ή CSV με στήλες:
              <strong> SR ID</strong>, <strong>Περιοχή</strong>, Διεύθυνση, Πελάτης, Τηλέφωνο, CAB
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,.xls"
              onChange={handleFile}
              className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground file:cursor-pointer"
            />
          </div>
        )}

        {rows.length > 0 && !done && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-4 w-4" /> {validRows.length} έτοιμες
              </span>
              {errorRows.length > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-4 w-4" /> {errorRows.length} με λάθη
                </span>
              )}
            </div>

            <div className="max-h-60 overflow-y-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left">SR ID</th>
                    <th className="p-2 text-left">Περιοχή</th>
                    <th className="p-2 text-left">Διεύθυνση</th>
                    <th className="p-2 text-left">Πελάτης</th>
                    <th className="p-2 text-left">Κατάσταση</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i} className={r.error ? "bg-destructive/10" : ""}>
                      <td className="p-2 font-mono">{r.sr_id || "—"}</td>
                      <td className="p-2">{r.area || "—"}</td>
                      <td className="p-2">{r.address || "—"}</td>
                      <td className="p-2">{r.customer_name || "—"}</td>
                      <td className="p-2">
                        {r.error ? (
                          <span className="text-destructive">{r.error}</span>
                        ) : (
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length > 100 && (
                    <tr><td colSpan={5} className="p-2 text-center text-muted-foreground">...και {rows.length - 100} ακόμα</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {importing && (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground text-center">{progress}%</p>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { reset(); }} disabled={importing}>
                <X className="h-4 w-4 mr-1" /> Ακύρωση
              </Button>
              <Button onClick={handleImport} disabled={importing || validRows.length === 0}>
                <Upload className="h-4 w-4 mr-1" />
                {importing ? "Εισαγωγή..." : `Εισαγωγή ${validRows.length} SR →`}
              </Button>
            </div>
          </div>
        )}

        {done && importResult && (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <p className="text-lg font-medium">{importResult.created} αναθέσεις εισήχθησαν</p>
            {importResult.errors > 0 && (
              <p className="text-sm text-destructive">{importResult.errors} απέτυχαν (πιθανόν διπλότυπα SR ID)</p>
            )}
            <Button onClick={() => { reset(); onOpenChange(false); }}>Κλείσιμο</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AssignmentsImport;
