import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import XLSX from "xlsx-js-style";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ─── Address parser ─── */
function parseFullAddress(raw: string): {
  street?: string; streetNumber?: string; floor?: string;
  municipality?: string; postalCode?: string;
} {
  if (!raw) return {};
  // Format: "STREET,NUMBER,ΟΡΟΦΟΣ: +01,Δ. MUNICIPALITY,CITY,POSTAL"
  const parts = raw.split(",").map(s => s.trim());
  const result: ReturnType<typeof parseFullAddress> = {};

  // Find street (first part)
  if (parts.length > 0) result.street = parts[0];

  // Find number (second part, if numeric)
  if (parts.length > 1 && /^\d+/.test(parts[1])) result.streetNumber = parts[1];

  // Find floor
  const floorPart = parts.find(p => /ΟΡΟΦΟΣ|ΟΡΟΦ|FLOOR/i.test(p));
  if (floorPart) {
    const m = floorPart.match(/[+-]?\d+/);
    if (m) result.floor = m[0];
  }

  // Find municipality (part starting with Δ.)
  const munPart = parts.find(p => /^Δ\.\s*/i.test(p));
  if (munPart) result.municipality = munPart.replace(/^Δ\.\s*/i, "").trim();

  // Find postal code (5 digit number)
  const postalPart = parts.find(p => /^\d{5}$/.test(p.trim()));
  if (postalPart) result.postalCode = postalPart.trim();

  return result;
}

/* ─── Types ─── */
interface ParsedRow {
  sr_id: string;
  area: string;
  address?: string;
  customer_name?: string;
  phone?: string;
  cab?: string;
  building_id_hemd?: string;
  latitude?: number;
  longitude?: number;
  source_tab?: string;
  work_type?: string;
  error?: string;
}

interface EnrichmentData {
  sr_id: string;
  customer_name?: string;
  phone?: string;
  cab?: string;
  building_id_hemd?: string;
  address?: string;
  floor?: string;
  municipality?: string;
  matched?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AssignmentsImport = ({ open, onOpenChange }: Props) => {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const enrichFileRef = useRef<HTMLInputElement>(null);

  // Import state
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: number } | null>(null);

  // Enrichment state
  const [enrichRows, setEnrichRows] = useState<EnrichmentData[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(0);
  const [enrichDone, setEnrichDone] = useState(false);
  const [enrichResult, setEnrichResult] = useState<{ updated: number; notFound: number } | null>(null);

  const validRows = rows.filter(r => !r.error);
  const errorRows = rows.filter(r => !!r.error);

  /* ─── Parse Formatted (IFS-FSM) file ─── */
  const handleFormattedFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

        if (jsonData.length === 0) {
          toast.error("Το αρχείο είναι κενό");
          return;
        }

        // Detect columns by checking headers
        const headers = Object.keys(jsonData[0]);
        const colMap = detectFormattedColumns(headers);

        if (!colMap.sr_id) {
          toast.error("Δεν βρέθηκε στήλη SR ID");
          return;
        }

        const parsed: ParsedRow[] = jsonData.map(row => {
          const srId = String(row[colMap.sr_id!] || "").trim();
          const rawAddress = String(row[colMap.address!] || "").trim();
          const streetNum = String(row[colMap.streetNumber!] || "").trim();
          const parsed = parseFullAddress(rawAddress);

          // Build clean address
          let cleanAddress = parsed.street || rawAddress;
          if (streetNum && !cleanAddress.includes(streetNum)) {
            cleanAddress += " " + streetNum;
          }
          if (parsed.municipality) {
            cleanAddress += ", " + parsed.municipality;
          }
          if (parsed.postalCode) {
            cleanAddress += " " + parsed.postalCode;
          }

          // Customer name from Όνομα + Επώνυμο
          let customerName = "";
          if (colMap.firstName && colMap.lastName) {
            const fn = String(row[colMap.firstName] || "").trim();
            const ln = String(row[colMap.lastName] || "").trim();
            customerName = [fn, ln].filter(Boolean).join(" ");
          }

          const lat = colMap.latitude ? parseFloat(row[colMap.latitude]) : undefined;
          const lng = colMap.longitude ? parseFloat(row[colMap.longitude]) : undefined;
          const area = colMap.area ? String(row[colMap.area] || "").trim() : "";
          const ak = colMap.ak ? String(row[colMap.ak] || "").trim() : "";
          const sourceTab = colMap.sourceTab ? String(row[colMap.sourceTab] || "").trim() : "";
          const workType = colMap.workType ? String(row[colMap.workType] || "").trim() : "";

          const item: ParsedRow = {
            sr_id: srId,
            area: area || ak || "ΑΤΤΙΚΗ",
            address: cleanAddress || undefined,
            customer_name: customerName || undefined,
            latitude: isNaN(lat!) ? undefined : lat,
            longitude: isNaN(lng!) ? undefined : lng,
            source_tab: sourceTab || ak || undefined,
            work_type: workType || undefined,
          };

          if (!item.sr_id) item.error = "SR ID λείπει";

          return item;
        });

        setRows(parsed);
        setDone(false);
        setImportResult(null);
      } catch (err: any) {
        toast.error("Σφάλμα ανάγνωσης: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  /* ─── Parse Raw (CRM OTE) file for enrichment ─── */
  const handleRawFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

        if (jsonData.length === 0) {
          toast.error("Το αρχείο είναι κενό");
          return;
        }

        const headers = Object.keys(jsonData[0]);
        const colMap = detectRawColumns(headers);

        if (!colMap.sr_id) {
          toast.error("Δεν βρέθηκε στήλη SR ID");
          return;
        }

        const parsed: EnrichmentData[] = jsonData.map(row => {
          const srId = String(row[colMap.sr_id!] || "").trim();
          const customerName = colMap.customerName ? String(row[colMap.customerName] || "").trim() : undefined;
          const phone = colMap.phone ? String(row[colMap.phone] || "").trim().replace(/\.0$/, "") : undefined;
          const cab = colMap.cab ? String(row[colMap.cab] || "").trim() : undefined;
          const bid = colMap.buildingId ? String(row[colMap.buildingId] || "").trim().replace(/\.0$/, "") : undefined;
          const street = colMap.street ? String(row[colMap.street] || "").trim() : undefined;
          const municipality = colMap.municipality ? String(row[colMap.municipality] || "").trim() : undefined;
          const floor = colMap.floor ? String(row[colMap.floor] || "").trim() : undefined;

          return {
            sr_id: srId,
            customer_name: customerName || undefined,
            phone: phone && phone !== "0" ? phone : undefined,
            cab: cab || undefined,
            building_id_hemd: bid && bid !== "0" ? bid : undefined,
            address: street || undefined,
            floor: floor || undefined,
            municipality: municipality?.replace(/^Δ\.\s*/i, "").trim() || undefined,
          };
        }).filter(r => r.sr_id);

        setEnrichRows(parsed);
        setEnrichDone(false);
        setEnrichResult(null);
      } catch (err: any) {
        toast.error("Σφάλμα ανάγνωσης: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  /* ─── Column detection for formatted file ─── */
  function detectFormattedColumns(headers: string[]) {
    const map: Record<string, string | null> = {
      sr_id: null, address: null, streetNumber: null, area: null,
      ak: null, firstName: null, lastName: null, latitude: null,
      longitude: null, sourceTab: null, workType: null,
    };

    for (const h of headers) {
      const lc = h.toLowerCase().trim();
      if (lc === "sr id" || lc === "sr_id") map.sr_id = h;
      else if (lc.includes("διεύθυνση πελάτη") || lc.includes("διευθυνση πελατη")) map.address = h;
      else if (lc.includes("αριθμός οδού") || lc.includes("αριθμος οδου")) map.streetNumber = h;
      else if (lc === "περιοχή" || lc === "περιοχη") map.area = h;
      else if (lc === "a/k" || lc === "α/κ" || lc === "αστικό κέντρο") map.ak = h;
      else if (lc === "όνομα" || lc === "ονομα") map.firstName = h;
      else if (lc === "επώνυμο" || lc === "επωνυμο") map.lastName = h;
      else if (lc.includes("γεωγραφικό πλάτος") || lc.includes("γεωγραφικο πλατος")) map.latitude = h;
      else if (lc.includes("γεωγραφικό μήκος") || lc.includes("γεωγραφικο μηκος")) map.longitude = h;
      else if (lc.includes("τ.τ.λ.π")) map.sourceTab = h;
      else if (lc.includes("τύπος εργασίας") || lc.includes("τυπος εργασιας")) map.workType = h;
    }
    return map;
  }

  /* ─── Column detection for raw file ─── */
  function detectRawColumns(headers: string[]) {
    const map: Record<string, string | null> = {
      sr_id: null, customerName: null, phone: null, cab: null,
      buildingId: null, street: null, municipality: null, floor: null,
    };

    for (const h of headers) {
      const lc = h.toLowerCase().trim();
      if (lc === "sr id" || lc === "sr_id") map.sr_id = h;
      else if (lc.includes("ονοματεπώνυμο πελάτη") || lc.includes("ονοματεπωνυμο πελατη")) map.customerName = h;
      else if (lc === "κινητό πελάτη" || lc === "κινητο πελατη") map.phone = h;
      else if (lc === "καμπίνα" || lc === "καμπινα") map.cab = h;
      else if (lc.includes("id κτιρίου") || lc.includes("id κτηριου")) map.buildingId = h;
      else if (lc === "οδός" || lc === "οδος") map.street = h;
      else if (lc.includes("δήμος") || lc.includes("δημος")) map.municipality = h;
      else if (lc.includes("οροφος") || lc.includes("όροφος")) map.floor = h;
    }
    return map;
  }

  /* ─── Import formatted assignments ─── */
  const handleImport = async () => {
    if (!organizationId || validRows.length === 0) return;
    setImporting(true);
    setProgress(0);

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
        building_id_hemd: r.building_id_hemd || null,
        latitude: r.latitude ?? null,
        longitude: r.longitude ?? null,
        organization_id: organizationId,
        status: "pending",
        source_tab: r.source_tab || r.area,
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
      toast.success(`✅ ${created} αναθέσεις εισήχθησαν!`);
    } else {
      toast.warning(`${created} εισήχθησαν, ${errors} απέτυχαν`);
    }
  };

  /* ─── Enrich existing assignments with raw data ─── */
  const handleEnrich = async () => {
    if (!organizationId || enrichRows.length === 0) return;
    setEnriching(true);
    setEnrichProgress(0);

    let updated = 0;
    let notFound = 0;

    for (let i = 0; i < enrichRows.length; i++) {
      const row = enrichRows[i];

      // Build update object only with non-empty fields
      const updates: Record<string, any> = {};
      if (row.customer_name) updates.customer_name = row.customer_name;
      if (row.phone) updates.phone = row.phone;
      if (row.cab) updates.cab = row.cab;
      if (row.building_id_hemd) updates.building_id_hemd = row.building_id_hemd;
      if (row.address) {
        let addr = row.address;
        if (row.municipality) addr += ", " + row.municipality;
        updates.address = addr;
      }

      if (Object.keys(updates).length === 0) {
        notFound++;
        setEnrichProgress(Math.round(((i + 1) / enrichRows.length) * 100));
        continue;
      }

      const { data, error } = await supabase
        .from("assignments")
        .update(updates)
        .eq("sr_id", row.sr_id)
        .eq("organization_id", organizationId)
        .select("id");

      if (error || !data || data.length === 0) {
        notFound++;
      } else {
        updated++;
      }

      // Throttle progress updates
      if (i % 5 === 0 || i === enrichRows.length - 1) {
        setEnrichProgress(Math.round(((i + 1) / enrichRows.length) * 100));
      }
    }

    setEnriching(false);
    setEnrichDone(true);
    setEnrichResult({ updated, notFound });
    queryClient.invalidateQueries({ queryKey: ["assignments"] });

    if (notFound === 0) {
      toast.success(`✅ ${updated} αναθέσεις ενημερώθηκαν!`);
    } else {
      toast.info(`${updated} ενημερώθηκαν, ${notFound} δεν βρέθηκαν`);
    }
  };

  const reset = () => {
    setRows([]);
    setDone(false);
    setImportResult(null);
    setProgress(0);
    setEnrichRows([]);
    setEnrichDone(false);
    setEnrichResult(null);
    setEnrichProgress(0);
    if (fileRef.current) fileRef.current.value = "";
    if (enrichFileRef.current) enrichFileRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Εισαγωγή Αναθέσεων από Excel
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="import">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="import">📥 Εισαγωγή (IFS-FSM)</TabsTrigger>
            <TabsTrigger value="enrich">🔄 Εμπλουτισμός (CRM OTE)</TabsTrigger>
          </TabsList>

          {/* ─── TAB 1: Import Formatted ─── */}
          <TabsContent value="import" className="space-y-4">
            {rows.length === 0 && !done && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ανέβασε το αρχείο <strong>IFS-FSM formatted</strong> (.xlsx).
                  Θα αναγνωριστούν αυτόματα: SR ID, Διεύθυνση, Περιοχή, A/K, Συντεταγμένες κ.ά.
                </p>
                <p className="text-xs text-muted-foreground">
                  Η σύνθετη διεύθυνση (οδός, αριθμός, όροφος, δήμος, Τ.Κ.) αναλύεται αυτόματα.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.csv,.xls"
                  onChange={handleFormattedFile}
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
                        <th className="p-2 text-left">Τύπος</th>
                        <th className="p-2 text-left">✓</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 100).map((r, i) => (
                        <tr key={i} className={r.error ? "bg-destructive/10" : ""}>
                          <td className="p-2 font-mono text-[11px]">{r.sr_id || "—"}</td>
                          <td className="p-2">{r.area || "—"}</td>
                          <td className="p-2 max-w-[200px] truncate">{r.address || "—"}</td>
                          <td className="p-2">{r.customer_name || "—"}</td>
                          <td className="p-2 text-[10px]">{r.work_type || "—"}</td>
                          <td className="p-2">
                            {r.error ? (
                              <span className="text-destructive text-[10px]">{r.error}</span>
                            ) : (
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                            )}
                          </td>
                        </tr>
                      ))}
                      {rows.length > 100 && (
                        <tr><td colSpan={6} className="p-2 text-center text-muted-foreground">...και {rows.length - 100} ακόμα</td></tr>
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
                  <Button variant="outline" onClick={reset} disabled={importing}>
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
                  <p className="text-sm text-destructive">{importResult.errors} απέτυχαν</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Τώρα μπορείς να ανεβάσεις το αρχείο CRM OTE για εμπλουτισμό (tab "Εμπλουτισμός").
                </p>
                <Button onClick={reset}>Νέα Εισαγωγή</Button>
              </div>
            )}
          </TabsContent>

          {/* ─── TAB 2: Enrich with Raw ─── */}
          <TabsContent value="enrich" className="space-y-4">
            {enrichRows.length === 0 && !enrichDone && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ανέβασε το αρχείο <strong>CRM OTE (raw)</strong> για εμπλουτισμό υπαρχουσών αναθέσεων.
                  Ενημερώνει: Ονοματεπώνυμο, Τηλέφωνο, Καμπίνα, BID κ.ά.
                </p>
                <p className="text-xs text-muted-foreground">
                  Ταιριάζει με βάση το SR ID στις ήδη εισηγμένες αναθέσεις.
                </p>
                <input
                  ref={enrichFileRef}
                  type="file"
                  accept=".xlsx,.csv,.xls"
                  onChange={handleRawFile}
                  className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground file:cursor-pointer"
                />
              </div>
            )}

            {enrichRows.length > 0 && !enrichDone && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4" />
                  {enrichRows.length} εγγραφές βρέθηκαν για εμπλουτισμό
                </div>

                <div className="max-h-60 overflow-y-auto border rounded-md">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-left">SR ID</th>
                        <th className="p-2 text-left">Πελάτης</th>
                        <th className="p-2 text-left">Τηλέφωνο</th>
                        <th className="p-2 text-left">CAB</th>
                        <th className="p-2 text-left">BID</th>
                        <th className="p-2 text-left">Διεύθυνση</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrichRows.slice(0, 80).map((r, i) => (
                        <tr key={i}>
                          <td className="p-2 font-mono text-[11px]">{r.sr_id}</td>
                          <td className="p-2">{r.customer_name || "—"}</td>
                          <td className="p-2">{r.phone || "—"}</td>
                          <td className="p-2">{r.cab || "—"}</td>
                          <td className="p-2">{r.building_id_hemd || "—"}</td>
                          <td className="p-2 max-w-[150px] truncate">{r.address || "—"}</td>
                        </tr>
                      ))}
                      {enrichRows.length > 80 && (
                        <tr><td colSpan={6} className="p-2 text-center text-muted-foreground">...και {enrichRows.length - 80} ακόμα</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {enriching && (
                  <div className="space-y-2">
                    <Progress value={enrichProgress} />
                    <p className="text-xs text-muted-foreground text-center">{enrichProgress}%</p>
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => { setEnrichRows([]); if (enrichFileRef.current) enrichFileRef.current.value = ""; }} disabled={enriching}>
                    <X className="h-4 w-4 mr-1" /> Ακύρωση
                  </Button>
                  <Button onClick={handleEnrich} disabled={enriching}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    {enriching ? "Ενημέρωση..." : `Εμπλουτισμός ${enrichRows.length} SR →`}
                  </Button>
                </div>
              </div>
            )}

            {enrichDone && enrichResult && (
              <div className="space-y-4 text-center py-4">
                <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
                <p className="text-lg font-medium">{enrichResult.updated} αναθέσεις ενημερώθηκαν</p>
                {enrichResult.notFound > 0 && (
                  <p className="text-sm text-muted-foreground">{enrichResult.notFound} SR δεν βρέθηκαν (δεν υπήρχαν στο σύστημα)</p>
                )}
                <Button onClick={() => { setEnrichRows([]); setEnrichDone(false); setEnrichResult(null); if (enrichFileRef.current) enrichFileRef.current.value = ""; }}>
                  Νέος Εμπλουτισμός
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AssignmentsImport;
