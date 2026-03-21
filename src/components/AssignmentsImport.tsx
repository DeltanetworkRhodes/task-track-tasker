import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import XLSX from "xlsx-js-style";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ─── Address parser ─── */
function parseFullAddress(raw: string) {
  if (!raw) return {} as Record<string, string | undefined>;
  const parts = raw.split(",").map(s => s.trim());
  const result: Record<string, string | undefined> = {};

  if (parts.length > 0) result.street = parts[0];
  if (parts.length > 1 && /^\d+/.test(parts[1])) result.streetNumber = parts[1];

  const floorPart = parts.find(p => /ΟΡΟΦΟΣ|ΟΡΟΦ|FLOOR/i.test(p));
  if (floorPart) {
    const m = floorPart.match(/[+-]?\d+/);
    if (m) result.floor = m[0];
  }

  const munPart = parts.find(p => /^Δ\.\s*/i.test(p));
  if (munPart) result.municipality = munPart.replace(/^Δ\.\s*/i, "").trim();

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
  request_category?: string;
  floor?: string;
  municipality?: string;
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
  customer_mobile?: string;
  customer_landline?: string;
  customer_email?: string;
  manager_name?: string;
  manager_mobile?: string;
  manager_email?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ─── Field group definitions ─── */
const IMPORT_GROUPS = [
  { id: "basic", label: "Βασικά", fields: ["sr_id", "area"], locked: true },
  { id: "address", label: "Διεύθυνση", fields: ["address", "floor", "municipality"] },
  { id: "customer", label: "Πελάτης", fields: ["customer_name"] },
  { id: "technical", label: "Τεχνικά", fields: ["work_type", "request_category", "source_tab"] },
  { id: "coords", label: "Συντεταγμένες", fields: ["latitude", "longitude"] },
];

const ENRICH_GROUPS = [
  { id: "basic", label: "Βασικά", fields: ["sr_id"], locked: true },
  { id: "address", label: "Διεύθυνση", fields: ["address", "floor", "municipality"] },
  { id: "customer", label: "Πελάτης", fields: ["customer_name", "phone", "customer_mobile", "customer_landline", "customer_email"] },
  { id: "manager", label: "Διαχειριστής", fields: ["manager_name", "manager_mobile", "manager_email"] },
  { id: "technical", label: "Τεχνικά", fields: ["cab", "building_id_hemd"] },
];

const FIELD_LABELS: Record<string, string> = {
  sr_id: "SR ID", area: "Περιοχή", address: "Διεύθυνση", floor: "Όροφος",
  municipality: "Δήμος", customer_name: "Όνομα Πελάτη", phone: "Τηλέφωνο",
  customer_mobile: "Κινητό Πελάτη", customer_landline: "Σταθερό Πελάτη",
  customer_email: "Email Πελάτη", manager_name: "Διαχειριστής", manager_mobile: "Κινητό Διαχ.",
  manager_email: "Email Διαχ.", cab: "Καμπίνα (CAB)", building_id_hemd: "ID Κτιρίου (BID)",
  work_type: "Τύπος Εργασίας", request_category: "Κατηγορία", source_tab: "Τ.Τ.Λ.Π. / A/K",
  latitude: "Γ. Πλάτος", longitude: "Γ. Μήκος",
};

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
  const [importGroups, setImportGroups] = useState<string[]>(["basic", "address", "customer", "technical", "coords"]);

  // Enrichment state
  const [enrichRows, setEnrichRows] = useState<EnrichmentData[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(0);
  const [enrichDone, setEnrichDone] = useState(false);
  const [enrichResult, setEnrichResult] = useState<{ updated: number; notFound: number } | null>(null);
  const [enrichGroups, setEnrichGroups] = useState<string[]>(["basic", "address", "customer", "manager", "technical"]);

  const validRows = rows.filter(r => !r.error);
  const errorRows = rows.filter(r => !!r.error);

  const toggleGroup = (groupId: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(prev => prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId]);
  };

  const getActiveFields = (groups: typeof IMPORT_GROUPS, selected: string[]) => {
    return groups.filter(g => selected.includes(g.id)).flatMap(g => g.fields);
  };

  /* ─── Column detection for formatted file ─── */
  function detectFormattedColumns(headers: string[]) {
    const map: Record<string, string | null> = {
      sr_id: null, address: null, streetNumber: null, area: null,
      ak: null, firstName: null, lastName: null, latitude: null,
      longitude: null, sourceTab: null, workType: null, requestCategory: null,
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
      else if (lc.includes("κατηγορία αιτήματος") || lc.includes("κατηγορια αιτηματος")) map.requestCategory = h;
    }
    return map;
  }

  /* ─── Column detection for raw file ─── */
  function detectRawColumns(headers: string[]) {
    const map: Record<string, string | null> = {
      sr_id: null, customerName: null, phone: null, cab: null,
      buildingId: null, street: null, municipality: null, floor: null,
      customerMobile: null, customerLandline: null, customerEmail: null,
      managerName: null, managerMobile: null, managerEmail: null,
    };

    for (const h of headers) {
      const lc = h.toLowerCase().trim();
      if (lc === "sr id" || lc === "sr_id") map.sr_id = h;
      else if (lc.includes("ονοματεπώνυμο πελάτη") || lc.includes("ονοματεπωνυμο πελατη")) map.customerName = h;
      else if (lc === "κινητό πελάτη" || lc === "κινητο πελατη") map.customerMobile = h;
      else if (lc === "σταθερό πελάτη" || lc === "σταθερο πελατη") map.customerLandline = h;
      else if (lc.includes("e-mail πελάτη") || lc.includes("email πελάτη") || lc.includes("e-mail πελατη")) map.customerEmail = h;
      else if (lc === "καμπίνα" || lc === "καμπινα") map.cab = h;
      else if (lc.includes("id κτιρίου") || lc.includes("id κτηριου")) map.buildingId = h;
      else if (lc === "οδός" || lc === "οδος") map.street = h;
      else if (lc.includes("δήμος") || lc.includes("δημος")) map.municipality = h;
      else if (lc.includes("οροφος") || lc.includes("όροφος")) map.floor = h;
      else if (lc.includes("ονοματεπώνυμο διαχειριστή") || lc.includes("ονοματεπωνυμο διαχειριστη")) map.managerName = h;
      else if (lc === "κινητό διαχειριστή" || lc === "κινητο διαχειριστη") map.managerMobile = h;
      else if (lc.includes("e-mail διαχειριστή") || lc.includes("email διαχειριστή") || lc.includes("e-mail διαχειριστη")) map.managerEmail = h;
      // Fallback: "Τηλέφωνο Παραγγελίας" as phone
      else if (lc.includes("τηλέφωνο παραγγελίας") || lc.includes("τηλεφωνο παραγγελιας")) { if (!map.phone) map.phone = h; }
    }
    // If no specific mobile found, try generic phone columns
    if (!map.customerMobile && !map.phone) {
      for (const h of headers) {
        const lc = h.toLowerCase().trim();
        if (lc.includes("κινητό") || lc.includes("κινητο")) { map.customerMobile = h; break; }
      }
    }
    return map;
  }

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

        if (jsonData.length === 0) { toast.error("Το αρχείο είναι κενό"); return; }

        const headers = Object.keys(jsonData[0]);
        const colMap = detectFormattedColumns(headers);

        if (!colMap.sr_id) { toast.error("Δεν βρέθηκε στήλη SR ID"); return; }

        const parsed: ParsedRow[] = jsonData.map(row => {
          const srId = String(row[colMap.sr_id!] || "").trim();
          const rawAddress = String(row[colMap.address!] || "").trim();
          const streetNum = String(row[colMap.streetNumber!] || "").trim();
          const addrParts = parseFullAddress(rawAddress);

          let cleanAddress = addrParts.street || rawAddress;
          if (streetNum && !cleanAddress.includes(streetNum)) cleanAddress += " " + streetNum;
          if (addrParts.municipality) cleanAddress += ", " + addrParts.municipality;
          if (addrParts.postalCode) cleanAddress += " " + addrParts.postalCode;

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

          const item: ParsedRow = {
            sr_id: srId,
            area: area || ak || "ΑΤΤΙΚΗ",
            address: cleanAddress || undefined,
            customer_name: customerName || undefined,
            latitude: isNaN(lat!) ? undefined : lat,
            longitude: isNaN(lng!) ? undefined : lng,
            source_tab: colMap.sourceTab ? String(row[colMap.sourceTab] || "").trim() : ak || undefined,
            work_type: colMap.workType ? String(row[colMap.workType] || "").trim() : undefined,
            request_category: colMap.requestCategory ? String(row[colMap.requestCategory] || "").trim() : undefined,
            floor: addrParts.floor || undefined,
            municipality: addrParts.municipality || undefined,
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

        if (jsonData.length === 0) { toast.error("Το αρχείο είναι κενό"); return; }

        const headers = Object.keys(jsonData[0]);
        const colMap = detectRawColumns(headers);

        if (!colMap.sr_id) { toast.error("Δεν βρέθηκε στήλη SR ID"); return; }

        const cleanStr = (val: any) => {
          if (val == null) return undefined;
          const s = String(val).trim().replace(/\.0$/, "");
          return s && s !== "0" ? s : undefined;
        };

        const parsed: EnrichmentData[] = jsonData.map(row => ({
          sr_id: String(row[colMap.sr_id!] || "").trim(),
          customer_name: colMap.customerName ? cleanStr(row[colMap.customerName]) : undefined,
          phone: colMap.phone ? cleanStr(row[colMap.phone]) : undefined,
          customer_mobile: colMap.customerMobile ? cleanStr(row[colMap.customerMobile]) : undefined,
          customer_landline: colMap.customerLandline ? cleanStr(row[colMap.customerLandline]) : undefined,
          customer_email: colMap.customerEmail ? cleanStr(row[colMap.customerEmail]) : undefined,
          cab: colMap.cab ? cleanStr(row[colMap.cab]) : undefined,
          building_id_hemd: colMap.buildingId ? cleanStr(row[colMap.buildingId]) : undefined,
          address: colMap.street ? cleanStr(row[colMap.street]) : undefined,
          floor: colMap.floor ? cleanStr(row[colMap.floor]) : undefined,
          municipality: colMap.municipality ? cleanStr(row[colMap.municipality])?.replace(/^Δ\.\s*/i, "").trim() : undefined,
          manager_name: colMap.managerName ? cleanStr(row[colMap.managerName]) : undefined,
          manager_mobile: colMap.managerMobile ? cleanStr(row[colMap.managerMobile]) : undefined,
          manager_email: colMap.managerEmail ? cleanStr(row[colMap.managerEmail]) : undefined,
        })).filter(r => r.sr_id);

        setEnrichRows(parsed);
        setEnrichDone(false);
        setEnrichResult(null);
      } catch (err: any) {
        toast.error("Σφάλμα ανάγνωσης: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  /* ─── Import formatted assignments ─── */
  const handleImport = async () => {
    if (!organizationId || validRows.length === 0) return;
    setImporting(true);
    setProgress(0);

    const activeFields = getActiveFields(IMPORT_GROUPS, importGroups);
    const BATCH = 50;
    let created = 0, errors = 0;

    for (let i = 0; i < validRows.length; i += BATCH) {
      const batch = validRows.slice(i, i + BATCH).map(r => {
        const rec: Record<string, any> = {
          sr_id: r.sr_id,
          area: r.area,
          organization_id: organizationId,
          status: "pending",
        };
        if (activeFields.includes("address")) rec.address = r.address || null;
        if (activeFields.includes("floor")) rec.floor = r.floor || null;
        if (activeFields.includes("municipality")) rec.municipality = r.municipality || null;
        if (activeFields.includes("customer_name")) rec.customer_name = r.customer_name || null;
        if (activeFields.includes("work_type")) rec.work_type = r.work_type || null;
        if (activeFields.includes("request_category")) rec.request_category = r.request_category || null;
        if (activeFields.includes("source_tab")) rec.source_tab = r.source_tab || r.area;
        if (activeFields.includes("latitude")) rec.latitude = r.latitude ?? null;
        if (activeFields.includes("longitude")) rec.longitude = r.longitude ?? null;
        return rec;
      });

      const { error } = await supabase.from("assignments").insert(batch as any);
      if (error) { console.error("Batch error:", error.message); errors += batch.length; }
      else created += batch.length;

      setProgress(Math.round(((i + batch.length) / validRows.length) * 100));
    }

    setImporting(false);
    setDone(true);
    setImportResult({ created, errors });
    queryClient.invalidateQueries({ queryKey: ["assignments"] });
    if (errors === 0) toast.success(`✅ ${created} αναθέσεις εισήχθησαν!`);
    else toast.warning(`${created} εισήχθησαν, ${errors} απέτυχαν`);
  };

  /* ─── Enrich existing assignments with raw data ─── */
  const handleEnrich = async () => {
    if (!organizationId || enrichRows.length === 0) return;
    setEnriching(true);
    setEnrichProgress(0);

    const activeFields = getActiveFields(ENRICH_GROUPS, enrichGroups);
    let updated = 0, notFound = 0;

    for (let i = 0; i < enrichRows.length; i++) {
      const row = enrichRows[i];
      const updates: Record<string, any> = {};

      if (activeFields.includes("customer_name") && row.customer_name) updates.customer_name = row.customer_name;
      if (activeFields.includes("phone") && (row.phone || row.customer_mobile)) updates.phone = row.phone || row.customer_mobile;
      if (activeFields.includes("customer_mobile") && row.customer_mobile) updates.customer_mobile = row.customer_mobile;
      if (activeFields.includes("customer_landline") && row.customer_landline) updates.customer_landline = row.customer_landline;
      if (activeFields.includes("customer_email") && row.customer_email) updates.customer_email = row.customer_email;
      if (activeFields.includes("manager_name") && row.manager_name) updates.manager_name = row.manager_name;
      if (activeFields.includes("manager_mobile") && row.manager_mobile) updates.manager_mobile = row.manager_mobile;
      if (activeFields.includes("manager_email") && row.manager_email) updates.manager_email = row.manager_email;
      if (activeFields.includes("cab") && row.cab) updates.cab = row.cab;
      if (activeFields.includes("building_id_hemd") && row.building_id_hemd) updates.building_id_hemd = row.building_id_hemd;
      if (activeFields.includes("floor") && row.floor) updates.floor = row.floor;
      if (activeFields.includes("municipality") && row.municipality) updates.municipality = row.municipality;
      if (activeFields.includes("address") && row.address) {
        let addr = row.address;
        if (row.municipality) addr += ", " + row.municipality;
        updates.address = addr;
      }

      if (Object.keys(updates).length === 0) { notFound++; continue; }

      const { data, error } = await supabase
        .from("assignments")
        .update(updates)
        .eq("sr_id", row.sr_id)
        .eq("organization_id", organizationId)
        .select("id");

      if (error || !data || data.length === 0) notFound++;
      else updated++;

      if (i % 5 === 0 || i === enrichRows.length - 1) {
        setEnrichProgress(Math.round(((i + 1) / enrichRows.length) * 100));
      }
    }

    setEnriching(false);
    setEnrichDone(true);
    setEnrichResult({ updated, notFound });
    queryClient.invalidateQueries({ queryKey: ["assignments"] });
    if (notFound === 0) toast.success(`✅ ${updated} αναθέσεις ενημερώθηκαν!`);
    else toast.info(`${updated} ενημερώθηκαν, ${notFound} δεν βρέθηκαν`);
  };

  const reset = () => {
    setRows([]); setDone(false); setImportResult(null); setProgress(0);
    setEnrichRows([]); setEnrichDone(false); setEnrichResult(null); setEnrichProgress(0);
    if (fileRef.current) fileRef.current.value = "";
    if (enrichFileRef.current) enrichFileRef.current.value = "";
  };

  /* ─── Group checkboxes renderer ─── */
  const GroupSelector = ({ groups, selected, onChange }: {
    groups: typeof IMPORT_GROUPS; selected: string[];
    onChange: React.Dispatch<React.SetStateAction<string[]>>;
  }) => (
    <div className="flex flex-wrap gap-2 py-2">
      {groups.map(g => (
        <label
          key={g.id}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer transition-all ${
            selected.includes(g.id)
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-muted/30 border-border text-muted-foreground"
          } ${g.locked ? "opacity-70 cursor-default" : ""}`}
        >
          <Checkbox
            checked={selected.includes(g.id)}
            disabled={g.locked}
            onCheckedChange={() => !g.locked && toggleGroup(g.id, onChange)}
            className="h-3 w-3"
          />
          {g.label}
          <span className="text-[10px] text-muted-foreground/60">
            ({g.fields.length})
          </span>
        </label>
      ))}
    </div>
  );

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
                </p>
                <p className="text-xs text-muted-foreground">
                  Η σύνθετη διεύθυνση (οδός, αριθμός, όροφος, δήμος, Τ.Κ.) αναλύεται αυτόματα.
                </p>
                <div className="border border-border/50 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">Επίλεξε ποιες κατηγορίες πεδίων να εισαχθούν:</p>
                  <GroupSelector groups={IMPORT_GROUPS} selected={importGroups} onChange={setImportGroups} />
                </div>
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

                <div className="border border-border/50 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">Κατηγορίες πεδίων:</p>
                  <GroupSelector groups={IMPORT_GROUPS} selected={importGroups} onChange={setImportGroups} />
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
                </p>
                <p className="text-xs text-muted-foreground">
                  Ταιριάζει με βάση το SR ID. Ενημερώνει: Πελάτη, Διαχειριστή, Τηλέφωνα, CAB, BID.
                </p>
                <div className="border border-border/50 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">Επίλεξε ποιες κατηγορίες πεδίων να ενημερωθούν:</p>
                  <GroupSelector groups={ENRICH_GROUPS} selected={enrichGroups} onChange={setEnrichGroups} />
                </div>
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

                <div className="border border-border/50 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">Κατηγορίες πεδίων:</p>
                  <GroupSelector groups={ENRICH_GROUPS} selected={enrichGroups} onChange={setEnrichGroups} />
                </div>

                <div className="max-h-60 overflow-y-auto border rounded-md">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-left">SR ID</th>
                        <th className="p-2 text-left">Πελάτης</th>
                        <th className="p-2 text-left">Κιν. Πελάτη</th>
                        <th className="p-2 text-left">Διαχειριστής</th>
                        <th className="p-2 text-left">CAB</th>
                        <th className="p-2 text-left">BID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrichRows.slice(0, 80).map((r, i) => (
                        <tr key={i}>
                          <td className="p-2 font-mono text-[11px]">{r.sr_id}</td>
                          <td className="p-2">{r.customer_name || "—"}</td>
                          <td className="p-2">{r.customer_mobile || r.phone || "—"}</td>
                          <td className="p-2">{r.manager_name || "—"}</td>
                          <td className="p-2">{r.cab || "—"}</td>
                          <td className="p-2">{r.building_id_hemd || "—"}</td>
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
                  <p className="text-sm text-muted-foreground">{enrichResult.notFound} SR δεν βρέθηκαν</p>
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
