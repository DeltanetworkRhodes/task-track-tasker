import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx-js-style";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Eye,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SYSTEM_FIELDS = [
  { key: "ticket_id", label: "Ticket ID", required: true, hint: "Π.χ. TKT-VF-..." },
  { key: "customer_type", label: "Customer Type (CBU/EBU/SoHo)", required: true, hint: "CBU, EBU, SoHo" },
  { key: "service_codes", label: "Service Codes", required: true, hint: "CI1, CI2, BI3..." },
  { key: "region", label: "Region (Περιοχή)", required: true, hint: "Π.χ. Ρόδος, Κως" },
  { key: "customer_name", label: "Customer Name", required: false, hint: "" },
  { key: "customer_address", label: "Address", required: false, hint: "" },
  { key: "customer_phone", label: "Phone", required: false, hint: "" },
  { key: "completed_at", label: "Completion Date", required: false, hint: "" },
  { key: "notes", label: "Notes", required: false, hint: "" },
] as const;

const COLUMN_HINTS: Record<string, string[]> = {
  ticket_id: ["ticket", "tkt", "order", "sr", "id", "αριθμός", "κωδικός"],
  customer_type: ["type", "τύπος", "category", "κατηγορία", "cbu", "ebu", "soho"],
  service_codes: ["service", "υπηρεσία", "code", "κωδικός υπηρεσίας"],
  region: ["region", "περιοχή", "area", "περιφέρεια", "πόλη"],
  customer_name: ["customer", "name", "πελάτης", "όνομα"],
  customer_address: ["address", "διεύθυνση", "οδός"],
  customer_phone: ["phone", "τηλέφωνο", "tel", "κινητό"],
  completed_at: ["date", "ημερομηνία", "completed", "completion"],
  notes: ["notes", "σχόλια", "παρατηρήσεις", "comment"],
};

function autoDetectColumn(systemField: string, excelHeaders: string[]): string | null {
  const hints = COLUMN_HINTS[systemField] || [];
  for (const header of excelHeaders) {
    const lower = header.toLowerCase();
    for (const hint of hints) {
      if (lower.includes(hint.toLowerCase())) return header;
    }
  }
  return null;
}

interface ParsedRow {
  ticket_id: string;
  customer_type: string;
  service_codes: string[];
  region: string;
  customer_name?: string;
  customer_address?: string;
  customer_phone?: string;
  completed_at?: string;
  notes?: string;
  raw: Record<string, unknown>;
}

export default function VodafoneImport() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelRows, setExcelRows] = useState<Record<string, unknown>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [saveMapping, setSaveMapping] = useState(true);
  const [importing, setImporting] = useState(false);

  const { data: subs = [] } = useQuery({
    queryKey: ["subs_for_import"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subcontractors")
        .select("id, full_name, primary_region, secondary_regions")
        .eq("active", true);
      return data || [];
    },
  });

  const { data: articles = [] } = useQuery({
    queryKey: ["articles_for_import"],
    queryFn: async () => {
      const { data } = await supabase
        .from("vodafone_articles")
        .select("*")
        .eq("active", true);
      return data || [];
    },
  });

  const handleFile = (uploaded: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws);

        if (json.length === 0) {
          toast.error("Κενό αρχείο");
          return;
        }

        const headers = Object.keys(json[0]);
        setExcelHeaders(headers);
        setExcelRows(json);
        setFile(uploaded);

        const saved = localStorage.getItem("vf_import_mapping");
        const savedMapping: Record<string, string> = saved ? JSON.parse(saved) : {};
        const newMapping: Record<string, string> = {};

        SYSTEM_FIELDS.forEach((f) => {
          if (savedMapping[f.key] && headers.includes(savedMapping[f.key])) {
            newMapping[f.key] = savedMapping[f.key];
          } else {
            const detected = autoDetectColumn(f.key, headers);
            if (detected) newMapping[f.key] = detected;
          }
        });
        setColumnMapping(newMapping);

        toast.success(`Βρέθηκαν ${json.length} γραμμές`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Άγνωστο σφάλμα";
        toast.error("Σφάλμα ανάγνωσης: " + msg);
      }
    };
    reader.readAsArrayBuffer(uploaded);
  };

  const parsed: ParsedRow[] = useMemo(() => {
    if (!excelRows.length) return [];
    return excelRows
      .map((row) => {
        const get = (key: string) => {
          const col = columnMapping[key];
          return col ? String(row[col] ?? "").trim() : "";
        };
        const serviceRaw = get("service_codes");
        const codes = serviceRaw
          .split(/[,;|+&/\s]+/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);

        return {
          ticket_id: get("ticket_id"),
          customer_type: get("customer_type").toUpperCase(),
          service_codes: codes,
          region: get("region"),
          customer_name: get("customer_name") || undefined,
          customer_address: get("customer_address") || undefined,
          customer_phone: get("customer_phone") || undefined,
          completed_at: get("completed_at") || undefined,
          notes: get("notes") || undefined,
          raw: row,
        };
      })
      .filter((r) => r.ticket_id);
  }, [excelRows, columnMapping]);

  const validation = useMemo(() => {
    const allCodes = new Set<string>();
    parsed.forEach((r) => r.service_codes.forEach((c) => allCodes.add(c)));

    const knownCodes = new Set(articles.map((a: { code: string }) => a.code));
    const unknownCodes = Array.from(allCodes).filter((c) => !knownCodes.has(c));

    const validRows = parsed.filter(
      (r) =>
        r.ticket_id &&
        ["CBU", "EBU", "SOHO"].includes(r.customer_type.toUpperCase()) &&
        r.service_codes.length > 0 &&
        r.region
    );

    return {
      total: parsed.length,
      valid: validRows.length,
      invalid: parsed.length - validRows.length,
      unknownCodes,
      unknownCodesCount: unknownCodes.length,
    };
  }, [parsed, articles]);

  const assignSub = (region: string): string | null => {
    if (!region) return null;
    const lc = region.toLowerCase();

    let match = subs.find(
      (s: { primary_region?: string }) => s.primary_region?.toLowerCase() === lc
    );
    if (match) return match.id;

    match = subs.find((s: { secondary_regions?: string[] }) =>
      (s.secondary_regions || []).some((r: string) => r.toLowerCase() === lc)
    );
    if (match) return match.id;

    match = subs.find((s: { primary_region?: string }) => {
      const pr = s.primary_region?.toLowerCase() || "";
      return pr && (lc.includes(pr) || pr.includes(lc));
    });
    return match?.id || null;
  };

  const subAssignmentSummary = useMemo(() => {
    const summary: Record<string, { name: string; count: number }> = {};
    let unassigned = 0;

    parsed.forEach((r) => {
      const subId = assignSub(r.region);
      if (subId) {
        const sub = subs.find((s: { id: string }) => s.id === subId);
        if (sub) {
          if (!summary[subId]) summary[subId] = { name: sub.full_name, count: 0 };
          summary[subId].count++;
        }
      } else {
        unassigned++;
      }
    });

    return { byId: summary, unassigned };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, subs]);

  const importMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Δεν είσαι συνδεδεμένος");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile?.organization_id) throw new Error("Δεν βρέθηκε organization");

      if (saveMapping) {
        localStorage.setItem("vf_import_mapping", JSON.stringify(columnMapping));
      }

      let imported = 0;
      let skipped = 0;

      for (const row of parsed) {
        if (!row.ticket_id || !row.region) {
          skipped++;
          continue;
        }

        const upperType = row.customer_type.toUpperCase();
        const customerType =
          upperType === "CBU"
            ? "CBU"
            : upperType === "EBU"
              ? "EBU"
              : upperType === "SOHO"
                ? "SoHo"
                : null;

        if (!customerType) {
          skipped++;
          continue;
        }

        const subId = assignSub(row.region);
        const zone = customerType === "CBU" ? "ISLANDS" : "REST_OF_GREECE";

        const { data: existing } = await supabase
          .from("vodafone_tickets")
          .select("id")
          .eq("ticket_id", row.ticket_id)
          .eq("organization_id", profile.organization_id)
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        const { data: ticket, error: tError } = await supabase
          .from("vodafone_tickets")
          .insert({
            organization_id: profile.organization_id,
            ticket_id: row.ticket_id,
            customer_type: customerType,
            zone,
            customer_name: row.customer_name,
            customer_phone: row.customer_phone,
            customer_address: row.customer_address,
            region: row.region,
            subcontractor_id: subId,
            status: row.completed_at ? "completed" : "pending",
            completed_at: row.completed_at
              ? new Date(row.completed_at).toISOString()
              : null,
            notes: row.notes,
          })
          .select("id")
          .single();

        if (tError || !ticket) {
          console.error("Ticket insert error:", tError);
          skipped++;
          continue;
        }

        for (const code of row.service_codes) {
          const article = articles.find(
            (a: { code: string; customer_type: string }) =>
              a.code === code && a.customer_type === customerType
          );
          if (!article) continue;

          await supabase.from("vodafone_ticket_services").insert({
            ticket_id: ticket.id,
            article_id: article.id,
            service_code: code,
            description: article.description_el,
            quantity: 1,
            unit_price_vodafone: article.unit_price_eur,
          });
        }

        imported++;
      }

      return { imported, skipped };
    },
    onSuccess: (result) => {
      toast.success(
        `✅ Εισήχθησαν ${result.imported} tickets, ${result.skipped} skipped`
      );
      qc.invalidateQueries({ queryKey: ["vodafone_tickets"] });
      navigate("/vodafone/tickets");
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setImporting(false),
  });

  const handleImport = () => {
    if (validation.valid === 0) {
      toast.error("Δεν υπάρχουν έγκυρες γραμμές");
      return;
    }
    if (!confirm(`Εισαγωγή ${validation.valid} tickets;`)) return;
    setImporting(true);
    importMutation.mutate();
  };

  const reset = () => {
    setFile(null);
    setExcelHeaders([]);
    setExcelRows([]);
    setColumnMapping({});
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/vodafone/dashboard")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Πίσω
          </Button>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Vodafone Excel Import
              </h1>
              <p className="text-xs text-muted-foreground">
                Μαζική εισαγωγή tickets τέλους μήνα
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-5xl">
        {/* Step 1: Upload */}
        {!file && (
          <Card
            className="p-12 border-2 border-dashed border-border hover:border-foreground/40 transition-colors cursor-pointer text-center"
            onClick={() => document.getElementById("file-input")?.click()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-1">
              Σύρε αρχείο Excel ή κλικ
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              .xlsx, .xls, .csv
            </p>
            <input
              id="file-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </Card>
        )}

        {file && excelHeaders.length > 0 && (
          <>
            {/* File info */}
            <Card className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
                <div>
                  <p className="font-semibold">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {excelRows.length} γραμμές • {excelHeaders.length} στήλες
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={reset}>
                <X className="h-4 w-4" />
              </Button>
            </Card>

            {/* Mapping */}
            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <ChevronIcon />
                <h3 className="text-base font-semibold">
                  Αντιστοίχιση Στηλών
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Επίλεξε ποια στήλη του Excel αντιστοιχεί σε κάθε πεδίο.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {SYSTEM_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label className="text-sm">
                      {f.label}
                      {f.required && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </Label>
                    <Select
                      value={columnMapping[f.key] || "__none__"}
                      onValueChange={(v) =>
                        setColumnMapping((prev) => ({
                          ...prev,
                          [f.key]: v === "__none__" ? "" : v,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Επίλεξε στήλη..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- Καμία --</SelectItem>
                        {excelHeaders.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {f.hint && (
                      <p className="text-xs text-muted-foreground">{f.hint}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Checkbox
                  id="save-mapping"
                  checked={saveMapping}
                  onCheckedChange={(c) => setSaveMapping(c === true)}
                />
                <Label htmlFor="save-mapping" className="text-sm cursor-pointer">
                  💾 Αποθήκευση mapping για επόμενες φορές
                </Label>
              </div>
            </Card>

            {/* Validation */}
            {parsed.length > 0 && (
              <Card className="p-6 space-y-4">
                <h3 className="text-base font-semibold">📊 Ανάλυση</h3>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-xs text-muted-foreground">
                      Έγκυρα tickets
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {validation.valid}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-muted-foreground">Με λάθη</p>
                    <p className="text-2xl font-bold text-red-600">
                      {validation.invalid}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs text-muted-foreground">
                      Άγνωστα codes
                    </p>
                    <p className="text-2xl font-bold text-amber-600">
                      {validation.unknownCodesCount}
                    </p>
                  </div>
                </div>

                {validation.unknownCodes.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                      <AlertTriangle className="h-4 w-4" />
                      Άγνωστα Service Codes:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {validation.unknownCodes.map((c) => (
                        <Badge key={c} variant="outline" className="text-xs">
                          {c}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Αυτά τα codes δεν θα προστεθούν. Πρόσθεσέ τα στο Vodafone
                      Pricing για να αναγνωριστούν.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-semibold">
                    Αυτόματη ανάθεση υπεργολάβων:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(subAssignmentSummary.byId).map(
                      ([id, info]) => (
                        <Badge
                          key={id}
                          variant="secondary"
                          className="text-xs gap-1"
                        >
                          👨 {info.name}
                          <span className="font-bold">{info.count}</span>
                        </Badge>
                      )
                    )}
                    {subAssignmentSummary.unassigned > 0 && (
                      <Badge
                        variant="outline"
                        className="text-xs gap-1 border-amber-500/40 text-amber-700"
                      >
                        ⚠️ Χωρίς ανάθεση
                        <span className="font-bold">
                          {subAssignmentSummary.unassigned}
                        </span>
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Preview */}
            {parsed.length > 0 && (
              <Card className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  <h3 className="text-base font-semibold">
                    Προεπισκόπηση (πρώτες 5 γραμμές)
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ticket</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Region</TableHead>
                        <TableHead>Codes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.slice(0, 5).map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">
                            {r.ticket_id}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.customer_type}</Badge>
                          </TableCell>
                          <TableCell>{r.region}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {r.service_codes.map((c) => (
                                <Badge
                                  key={c}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {c}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={reset}>
                Ακύρωση
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Εισαγωγή...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Εισαγωγή {validation.valid} tickets
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
