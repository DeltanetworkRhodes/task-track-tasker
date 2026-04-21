import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Tag,
  Copy,
  Check,
  Printer,
  RefreshCw,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  History,
  Loader2,
  Power,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { el } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  printLabelQueue,
  connectToPrinter,
  disconnectPrinter,
  subscribePrinterState,
  setDemoMode,
  getPrinterState,
  type PrintableLabel,
  type ConnectionStatus,
} from "@/lib/bluetoothLabelPrinter";
import { PrintProgressDialog } from "@/components/PrintProgressDialog";

// ─── Helpers ───
function floorLabel(floor: string): string {
  const f = (floor || "").trim();
  if (f === "+00" || f === "00") return "ΙΣ";
  if (f === "-01") return "Υπόγ";
  const n = parseInt(f);
  if (isNaN(n)) return f;
  if (n === 1) return "1ος";
  if (n === 2) return "2ος";
  if (n === 3) return "3ος";
  if (n === 4) return "4ος";
  if (n === 5) return "5ος";
  return `${n}ος`;
}

// ─── Bluetooth print metadata ───
const DEFAULT_TAPE_WIDTH = 12;

type LabelLocation = "kampina" | "bep" | "bmo" | "fb";
type LabelType = "flag" | "flat";

interface LabelMeta {
  location: LabelLocation;
  label_type: LabelType;
  section_code: string;
  section_title: string;
  tape_width_mm: number;
}

const LABEL_METADATA: Record<string, LabelMeta> = {
  KAMPINA_A: { location: "kampina", label_type: "flat", section_code: "KAMPINA_A", section_title: "ΜΕΣΑ ΣΤΗΝ ΚΑΣΕΤΑ", tape_width_mm: DEFAULT_TAPE_WIDTH },
  KAMPINA_B: { location: "kampina", label_type: "flag", section_code: "KAMPINA_B", section_title: "ΠΑΝΩ ΣΤΙΣ ΕΞΟΔΟΥΣ SPLITTER", tape_width_mm: DEFAULT_TAPE_WIDTH },
  KAMPINA_C: { location: "kampina", label_type: "flag", section_code: "KAMPINA_C", section_title: "ΠΑΝΩ ΣΤΟΝ ΣΩΛΗΝΙΣΚΟ", tape_width_mm: DEFAULT_TAPE_WIDTH },
  BEP_A: { location: "bep", label_type: "flag", section_code: "BEP_A", section_title: "LABEL ΜΑΥΡΗΣ ΙΝΑΣ (ΑΠΟ ΚΑΜΠΙΝΑΣ)", tape_width_mm: DEFAULT_TAPE_WIDTH },
  BEP_B: { location: "bep", label_type: "flat", section_code: "BEP_B", section_title: "ΣΤΗΝ ΠΟΡΤΑ ΤΟΥ BEP", tape_width_mm: DEFAULT_TAPE_WIDTH },
  BEP_PORT: { location: "bep", label_type: "flag", section_code: "BEP_PORT", section_title: "PER-PORT FIBER LABELS", tape_width_mm: DEFAULT_TAPE_WIDTH },
  BMO_B: { location: "bmo", label_type: "flag", section_code: "BMO_B", section_title: "ΕΣΩΤΕΡΙΚΑ BMO", tape_width_mm: DEFAULT_TAPE_WIDTH },
  FB_DOOR: { location: "fb", label_type: "flat", section_code: "FB_DOOR", section_title: "ΣΤΗΝ ΠΟΡΤΑ", tape_width_mm: DEFAULT_TAPE_WIDTH },
};

const LOCATION_ORDER: Record<LabelLocation, number> = {
  kampina: 1,
  bep: 2,
  bmo: 3,
  fb: 4,
};

const LOCATION_EMOJI: Record<LabelLocation, string> = {
  kampina: "🏗️",
  bep: "🔌",
  bmo: "📡",
  fb: "📋",
};

// ─── Label Chip (click to copy) ───
function LabelChip({ text, dim = false }: { text: string; dim?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Αντιγράφηκε!");
    setTimeout(() => setCopied(false), 1200);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 cursor-pointer px-2 py-1 rounded border font-mono text-xs font-bold select-none transition-colors ${
        dim
          ? "opacity-40 border-border"
          : "border-primary/30 bg-primary/5 hover:bg-primary/10 text-foreground"
      }`}
    >
      <span>{text || "—"}</span>
      {copied ? (
        <Check className="h-3 w-3 text-primary" />
      ) : (
        <Copy className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}

function LabelTypeBadge({ type }: { type: LabelType }) {
  return (
    <Badge
      variant="outline"
      className={
        type === "flag"
          ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[10px]"
          : "bg-violet-500/10 text-violet-400 border-violet-500/30 text-[10px]"
      }
    >
      {type === "flag" ? "🏳️ FLAG" : "🟦 FLAT"}
    </Badge>
  );
}

// ─── Main Page ───
export default function FtthLabelGenerator() {
  const params = useParams<{ srId?: string }>();
  const { user } = useAuth();
  const { organizationId } = useOrganization();

  const [srId, setSrId] = useState(params.srId || "");
  const [loading, setLoading] = useState(false);
  const [srData, setSrData] = useState<{
    sr_id: string;
    address: string | null;
    cab: string | null;
    building_id_hemd: string | null;
    organization_id: string | null;
    id: string;
  } | null>(null);
  const [gisData, setGisData] = useState<Record<string, unknown> | null>(null);

  const [printQueue, setPrintQueue] = useState<PrintableLabel[]>([]);
  const [currentPrintingIdx, setCurrentPrintingIdx] = useState<number | null>(null);
  const [printingOpen, setPrintingOpen] = useState(false);

  const loadSr = useCallback(async () => {
    if (!srId.trim()) return;
    setLoading(true);
    try {
      const { data: asgn, error: aerr } = await supabase
        .from("assignments")
        .select("sr_id, address, cab, building_id_hemd, organization_id, id")
        .eq("sr_id", srId.trim())
        .maybeSingle();

      if (aerr || !asgn) {
        toast.error("SR δεν βρέθηκε");
        setSrData(null);
        setGisData(null);
        return;
      }
      setSrData(asgn);

      const { data: gis } = await supabase
        .from("gis_data")
        .select("*")
        .eq("assignment_id", asgn.id)
        .maybeSingle();

      setGisData(gis as Record<string, unknown> | null);
      if (!gis) {
        toast.warning("Δεν βρέθηκαν GIS δεδομένα για αυτό το SR");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Σφάλμα φόρτωσης";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [srId]);

  // ─── Print history (after SR loaded) ───
  const { data: printHistory, refetch: refetchHistory } = useQuery({
    queryKey: ["label-print-history", srData?.sr_id],
    enabled: !!srData?.sr_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("label_print_jobs")
        .select("*")
        .eq("sr_id", srData!.sr_id)
        .order("printed_at", { ascending: false });
      return data || [];
    },
  });

  // ─── Construction lookup (to attach print jobs) ───
  const { data: construction } = useQuery({
    queryKey: ["construction-for-sr", srData?.id],
    enabled: !!srData?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("constructions")
        .select("id")
        .eq("assignment_id", srData!.id)
        .maybeSingle();
      return data;
    },
  });

  // ─── Parse GIS data ───
  const parsed = useMemo(() => {
    if (!gisData) return null;

    const optPaths = (gisData.optical_paths as Array<Record<string, unknown>>) || [];

    const getType = (p: Record<string, unknown>) =>
      String(p.type || p["OPTICAL PATH TYPE"] || "").toUpperCase();
    const getPath = (p: Record<string, unknown>) =>
      String(p.path || p["OPTICAL PATH"] || "");

    const cabBepPaths = optPaths.filter((p) => getType(p) === "CAB-BEP");
    const bepBmoPaths = optPaths.filter((p) => getType(p) === "BEP-BMO");
    const bmoFbPaths = optPaths.filter((p) => getType(p) === "BMO-FB");

    interface GridCell {
      row: string;
      col: number;
      text: string;
      kind?: "lim" | "floor" | "black";
    }
    const bepCells: GridCell[] = [];

    const getBepIdx = (path: string): number => {
      const m = path.match(/BEP(\d+)/);
      return m ? parseInt(m[1]) : 1;
    };
    const bepIdxToRow = (idx: number) => String.fromCharCode(64 + idx);

    cabBepPaths.forEach((p) => {
      const path = getPath(p);
      const fiberMatch = path.match(/_(\d{2})(?:_SB|$)/);
      const limMatch = path.match(/B(\d+)\.(\d+)/);
      const bepIdx = getBepIdx(path);
      const row = bepIdxToRow(bepIdx);
      if (!fiberMatch) return;
      const col = parseInt(fiberMatch[1]);
      bepCells.push({
        row,
        col,
        text: limMatch ? limMatch[0] : "",
        kind: "lim",
      });
    });

    bepBmoPaths.forEach((p) => {
      const path = getPath(p);
      const m = path.match(/_SB(\d+)\([^)]+\)\.(\d+)_(\d+)_BMO\d+_(\d+)/);
      if (!m) return;
      const fiber = parseInt(m[3]);
      const bmoPort = parseInt(m[4]);
      const bepIdx = getBepIdx(path);
      const row = bepIdxToRow(bepIdx);

      let floor = "";
      const fbPath = bmoFbPaths.find((fb) => {
        const s = getPath(fb);
        return s.match(new RegExp(`BMO\\d+_${bmoPort}_FB`));
      });
      if (fbPath) {
        const s = getPath(fbPath);
        const fm = s.match(/FB\(([^)]+)\)/);
        if (fm) floor = fm[1];
      }

      if (!bepCells.find((c) => c.row === row && c.col === fiber)) {
        bepCells.push({
          row,
          col: fiber,
          text: floor ? floorLabel(floor) : "",
          kind: "floor",
        });
      }
    });

    interface BmoPort {
      port: number;
      floor: string;
    }
    const bmoPorts: BmoPort[] = [];
    bmoFbPaths.forEach((p) => {
      const path = getPath(p);
      const m = path.match(/BMO\d+_(\d+)_FB\(([^)]+)\)/);
      if (!m) return;
      bmoPorts.push({ port: parseInt(m[1]), floor: m[2] });
    });
    bmoPorts.sort((a, b) => a.port - b.port);

    interface FbGroup {
      floor: string;
      portFrom: number;
      portTo: number;
    }
    const floorPortMap: Record<string, number[]> = {};
    bmoPorts.forEach((bp) => {
      if (!floorPortMap[bp.floor]) floorPortMap[bp.floor] = [];
      floorPortMap[bp.floor].push(bp.port);
    });

    const fbGroups: FbGroup[] = Object.keys(floorPortMap)
      .sort()
      .map((floor) => ({
        floor,
        portFrom: Math.min(...floorPortMap[floor]),
        portTo: Math.max(...floorPortMap[floor]),
      }));

    const cabLimits = cabBepPaths
      .map((p) => {
        const path = getPath(p);
        const m = path.match(/B(\d+)\.(\d+)/);
        return m ? m[0] : "";
      })
      .filter(Boolean)
      .sort()
      .join(", ");

    const bepRowsCount = Math.max(
      1,
      ...cabBepPaths.map((p) => getBepIdx(getPath(p))),
      ...bepBmoPaths.map((p) => getBepIdx(getPath(p)))
    );
    const bepRows = Array.from(
      { length: Math.max(bepRowsCount, 1) },
      (_, i) => String.fromCharCode(65 + i)
    );

    return {
      bepCells,
      bmoPorts,
      fbGroups,
      cabLimits,
      cabBepPaths,
      bepRows,
    };
  }, [gisData]);

  // ─── Build the print queue (auto-mapped από όλα τα sections) ───
  const buildPrintQueue = useCallback((): PrintableLabel[] => {
    if (!parsed || !srData) return [];
    const queue: PrintableLabel[] = [];
    let order = 0;

    const push = (
      code: keyof typeof LABEL_METADATA,
      content: string,
      lines?: string[]
    ) => {
      if (!content && (!lines || lines.length === 0)) return;
      const meta = LABEL_METADATA[code];
      queue.push({
        section_code: meta.section_code,
        location: meta.location,
        label_type: meta.label_type,
        section_title: meta.section_title,
        content,
        content_lines: lines,
        tape_width_mm: meta.tape_width_mm,
        print_order: ++order,
      });
    };

    // ── ΚΑΜΠΙΝΑ ──
    push("KAMPINA_A", `ΔΙΕΥΘΥΝΣΗ: ${srData.address || ""}`);
    parsed.cabBepPaths.forEach((p, i) => {
      const path = String(
        (p as Record<string, unknown>).path ||
          (p as Record<string, unknown>)["OPTICAL PATH"] ||
          ""
      );
      const m = path.match(/SGA?\d*\([^)]+\)\.\d+/);
      const text = `${m ? m[0] : `Splitter ${i + 1}`} - ${srData.address || ""}`;
      push("KAMPINA_B", text);
    });
    push("KAMPINA_C", srData.address || "");

    // ── BEP ──
    push("BEP_A", `${srData.cab || ""}\n${parsed.cabLimits}`, [
      srData.cab || "",
      parsed.cabLimits,
    ]);
    push(
      "BEP_B",
      `ΚΑΜΠΙΝΑ: ${srData.cab || ""}\nΟΡΙΑ: ${parsed.cabLimits}`,
      [`ΚΑΜΠΙΝΑ: ${srData.cab || ""}`, `ΟΡΙΑ: ${parsed.cabLimits}`]
    );
    parsed.bepCells.forEach((cell) => {
      if (!cell.text) return;
      push("BEP_PORT", `${cell.row}${String(cell.col).padStart(2, "0")} · ${cell.text}`);
    });

    // ── BMO ──
    parsed.bmoPorts.forEach((bp) => {
      push("BMO_B", `Port ${bp.port} · ${floorLabel(bp.floor)}`);
    });

    // ── FB ──
    parsed.fbGroups.forEach((fb) => {
      push(
        "FB_DOOR",
        `${floorLabel(fb.floor)} · Port ${fb.portFrom}-${fb.portTo}`
      );
    });

    return queue.sort(
      (a, b) => LOCATION_ORDER[a.location] - LOCATION_ORDER[b.location]
    );
  }, [parsed, srData]);

  // ─── Save print jobs to DB ───
  const savePrintJobs = useCallback(
    async (printed: PrintableLabel[]) => {
      if (!user || !organizationId || !srData?.sr_id) return;
      const records = printed.map((p) => ({
        organization_id: organizationId,
        sr_id: srData.sr_id,
        construction_id: construction?.id || null,
        technician_id: user.id,
        location: p.location,
        label_type: p.label_type,
        section_code: p.section_code,
        section_title: p.section_title,
        content: p.content,
        content_lines: p.content_lines || null,
        tape_width_mm: p.tape_width_mm,
        quantity: 1,
        print_order: p.print_order,
        status: "printed" as const,
        printed_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("label_print_jobs").insert(records);
      if (error) toast.error("Αποτυχία αποθήκευσης: " + error.message);
      else refetchHistory();
    },
    [user, organizationId, srData, construction, refetchHistory]
  );

  // ─── Bluetooth print handler ───
  const handleBluetoothPrint = useCallback(async () => {
    const queue = buildPrintQueue();
    if (queue.length === 0) {
      toast.error("Δεν υπάρχουν labels για εκτύπωση");
      return;
    }
    setPrintQueue(queue);
    setCurrentPrintingIdx(0);
    setPrintingOpen(true);

    try {
      await printLabelQueue(queue, {
        onItemStart: (idx) => setCurrentPrintingIdx(idx),
        onComplete: async (printed) => {
          toast.success(`🖨️ ${printed.length} labels εκτυπώθηκαν!`);
          await savePrintJobs(printed);
          setTimeout(() => setPrintingOpen(false), 1500);
        },
        onError: (err) => {
          toast.error(err.message);
          setPrintingOpen(false);
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Σφάλμα εκτύπωσης";
      toast.error(msg);
      setPrintingOpen(false);
    }
  }, [buildPrintQueue, savePrintJobs]);

  // ─── Reprint single ───
  const reprintLabel = useCallback(
    async (job: {
      id: string;
      section_code: string;
      location: LabelLocation;
      label_type: LabelType;
      section_title: string;
      content: string;
      content_lines: unknown;
      tape_width_mm: number;
      reprint_count: number | null;
    }) => {
      const single: PrintableLabel = {
        section_code: job.section_code,
        location: job.location,
        label_type: job.label_type,
        section_title: job.section_title,
        content: job.content,
        content_lines: Array.isArray(job.content_lines)
          ? (job.content_lines as string[])
          : undefined,
        tape_width_mm: job.tape_width_mm,
        print_order: 1,
      };

      try {
        await printLabelQueue([single], {
          onComplete: async () => {
            await supabase
              .from("label_print_jobs")
              .update({
                reprint_count: (job.reprint_count || 0) + 1,
                printed_at: new Date().toISOString(),
              })
              .eq("id", job.id);
            toast.success("🔄 Label εκτυπώθηκε ξανά!");
            refetchHistory();
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Άγνωστο σφάλμα";
        toast.error("Αποτυχία: " + msg);
      }
    },
    [refetchHistory]
  );

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-12 print:max-w-none">
        {/* 1. HEADER */}
        <div className="flex items-center gap-3 flex-wrap">
          <Tag className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">
            FTTH Label Generator
          </h1>
          <Badge variant="outline" className="text-[10px]">
            COSMOTE Β' Φάση
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            12mm tape
          </Badge>
        </div>

        {/* 2. SR SELECTION */}
        <Card className="p-4 space-y-3 print:hidden">
          <Label className="text-[11px]">Επιλογή SR</Label>
          <div className="flex gap-2">
            <Input
              value={srId}
              onChange={(e) => setSrId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadSr()}
              placeholder="π.χ. SR123456"
              className="font-mono text-sm"
            />
            <Button onClick={loadSr} disabled={loading || !srId.trim()}>
              {loading ? "..." : "Φόρτωση"}
            </Button>
          </div>
          {srData && (
            <div className="text-xs text-muted-foreground">
              ✅ {srData.address} · Καμπίνα: {srData.cab || "—"}
            </div>
          )}
        </Card>

        {/* Bluetooth print bar */}
        {parsed && srData && (
          <Card className="p-4 flex flex-wrap items-center gap-3 print:hidden bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
            <Bluetooth className="h-5 w-5 text-primary" />
            <div className="flex-1 min-w-[180px]">
              <div className="text-sm font-bold">Bluetooth Printer</div>
              <div className="text-[11px] text-muted-foreground">
                Brother PT-E550W · Σειρά: ΚΑΜΠΙΝΑ → BEP → BMO → FB
              </div>
            </div>
            <Button
              onClick={handleBluetoothPrint}
              size="lg"
              className="gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30"
            >
              <Printer className="h-4 w-4" />
              Εκτύπωση όλων ({buildPrintQueue().length})
            </Button>
          </Card>
        )}

        {/* Placeholder */}
        {!parsed && (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            Εισάγετε SR ID για να φορτώσετε τα δεδομένα GIS και να
            δημιουργηθούν αυτόματα τα labels.
          </Card>
        )}

        {/* 3. ΚΑΜΠΙΝΑ */}
        {parsed && srData && (
          <Card className="p-4 space-y-4 print:break-inside-avoid">
            <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2 flex-wrap">
              {LOCATION_EMOJI.kampina} <span>Καμπίνα</span>
              <Badge variant="outline" className="text-[9px] ml-auto">
                #{LOCATION_ORDER.kampina}
              </Badge>
            </h2>

            <div className="space-y-1">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                Μέσα στην κασέτα
                <LabelTypeBadge type={LABEL_METADATA.KAMPINA_A.label_type} />
              </div>
              <LabelChip text={`ΔΙΕΥΘΥΝΣΗ: ${srData.address || ""}`} />
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                Εξόδους Splitter
                <LabelTypeBadge type={LABEL_METADATA.KAMPINA_B.label_type} />
              </div>
              <div className="flex flex-wrap gap-2">
                {parsed.cabBepPaths.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">
                    Καμία CAB-BEP διαδρομή
                  </span>
                )}
                {parsed.cabBepPaths.map((p, i) => {
                  const path = String(
                    (p as Record<string, unknown>).path ||
                      (p as Record<string, unknown>)["OPTICAL PATH"] ||
                      ""
                  );
                  const m = path.match(/SGA?\d*\([^)]+\)\.\d+/);
                  return (
                    <LabelChip
                      key={i}
                      text={`${m ? m[0] : `Splitter ${i + 1}`} - ${
                        srData.address || ""
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                Σωληνίσκο
                <LabelTypeBadge type={LABEL_METADATA.KAMPINA_C.label_type} />
              </div>
              <LabelChip text={srData.address || ""} />
            </div>
          </Card>
        )}

        {/* 4. BEP */}
        {parsed && srData && (
          <Card className="p-4 space-y-4 print:break-inside-avoid">
            <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2 flex-wrap">
              {LOCATION_EMOJI.bep} <span>BEP — Labels</span>
              <Badge variant="outline" className="text-[9px] ml-auto">
                #{LOCATION_ORDER.bep}
              </Badge>
            </h2>

            <div className="space-y-1">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                Πόρτα BEP
                <LabelTypeBadge type={LABEL_METADATA.BEP_B.label_type} />
              </div>
              <LabelChip
                text={`ΚΑΜΠΙΝΑ: ${srData.cab || ""}\nΟΡΙΑ: ${parsed.cabLimits}`}
              />
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                Μαύρη Ίνα
                <LabelTypeBadge type={LABEL_METADATA.BEP_A.label_type} />
              </div>
              <LabelChip text={`${srData.cab || ""}\n${parsed.cabLimits}`} />
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                Εσωτερικό Grid
                <LabelTypeBadge type={LABEL_METADATA.BEP_PORT.label_type} />
                <span className="opacity-60 normal-case font-normal">
                  (κλικ για αντιγραφή)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border border-border bg-muted/50 w-10 h-8 text-[10px] font-mono">
                        BEP
                      </th>
                      {Array.from({ length: 12 }, (_, i) => (
                        <th
                          key={i}
                          className="border border-border bg-muted/50 w-14 h-8 font-mono text-[10px]"
                        >
                          {String(i + 1).padStart(2, "0")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.bepRows.map((row) => (
                      <tr key={row}>
                        <td className="border border-border bg-muted/50 text-center font-bold font-mono">
                          {row}
                        </td>
                        {Array.from({ length: 12 }, (_, i) => {
                          const col = i + 1;
                          const cell = parsed.bepCells.find(
                            (c) => c.row === row && c.col === col
                          );
                          const isLim = cell?.kind === "lim";
                          return (
                            <td
                              key={col}
                              className={`border border-border p-1 text-center align-middle ${
                                isLim ? "bg-amber-500/5" : ""
                              }`}
                            >
                              {cell?.text ? (
                                <LabelChip text={cell.text} />
                              ) : (
                                <span className="text-muted-foreground/30">
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        )}

        {/* 5. BMO */}
        {parsed && (
          <Card className="p-4 space-y-3 print:break-inside-avoid">
            <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2 flex-wrap">
              {LOCATION_EMOJI.bmo} <span>BMO — Labels ανά Port</span>
              <LabelTypeBadge type={LABEL_METADATA.BMO_B.label_type} />
              <Badge variant="outline" className="text-[9px] ml-auto">
                #{LOCATION_ORDER.bmo}
              </Badge>
            </h2>
            <div className="text-xs text-muted-foreground">
              Κολλάς στην ίνα κάθε port — κάθε port αντιστοιχεί σε όροφο
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {parsed.bmoPorts.length === 0 && (
                <span className="text-xs text-muted-foreground italic col-span-full">
                  Καμία BMO-FB διαδρομή
                </span>
              )}
              {parsed.bmoPorts.map((bp) => (
                <div
                  key={bp.port}
                  className="flex flex-col gap-1.5 p-2 rounded border border-border bg-muted/20"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      Port {bp.port}
                    </Badge>
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                      {floorLabel(bp.floor)}
                    </span>
                  </div>
                  <LabelChip text={`Port ${bp.port} · ${floorLabel(bp.floor)}`} />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 6. FLOOR BOX */}
        {parsed && parsed.fbGroups.length > 0 && (
          <Card className="p-4 space-y-3 print:break-inside-avoid">
            <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2 flex-wrap">
              {LOCATION_EMOJI.fb} <span>Floor Box — Labels</span>
              <LabelTypeBadge type={LABEL_METADATA.FB_DOOR.label_type} />
              <Badge variant="outline" className="text-[9px] ml-auto">
                #{LOCATION_ORDER.fb}
              </Badge>
            </h2>
            {parsed.fbGroups.map((fb) => (
              <div
                key={fb.floor}
                className="flex items-center gap-3 p-2 rounded border border-border bg-muted/20"
              >
                <div className="text-xs font-bold w-16 text-foreground">
                  {floorLabel(fb.floor)}
                </div>
                <div className="flex gap-2">
                  <LabelChip text={`Port ${fb.portFrom}`} />
                  <LabelChip text={`Port ${fb.portTo}`} />
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* 7. PRINT (browser PDF) */}
        {parsed && (
          <Button
            onClick={() => window.print()}
            variant="outline"
            className="w-full gap-2 print:hidden"
          >
            <Printer className="h-4 w-4" />
            Εκτύπωση PDF (Browser)
          </Button>
        )}

        {/* 8. PRINT HISTORY */}
        {printHistory && printHistory.length > 0 && (
          <Card className="p-4 space-y-3 print:hidden">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Ιστορικό Εκτυπώσεων
                <Badge variant="secondary" className="text-[10px]">
                  {printHistory.length}
                </Badge>
              </h2>
              <span className="text-[10px] text-muted-foreground">
                Πάτα "Reprint" αν κάποιο label ξεκόλλησε
              </span>
            </div>

            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {printHistory.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center gap-2 p-2 rounded border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <span className="text-base">
                    {LOCATION_EMOJI[job.location as LabelLocation]}
                  </span>
                  <span className="text-[10px]">
                    {job.label_type === "flag" ? "🏳️" : "🟦"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono font-bold truncate">
                      {job.content}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {job.section_title} ·{" "}
                      {job.printed_at
                        ? formatDistanceToNow(new Date(job.printed_at), {
                            locale: el,
                            addSuffix: true,
                          })
                        : "—"}
                      {job.reprint_count && job.reprint_count > 0 ? (
                        <span className="text-amber-400">
                          {" · "}Reprinted {job.reprint_count}x
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      reprintLabel(
                        job as Parameters<typeof reprintLabel>[0]
                      )
                    }
                    className="flex-shrink-0 h-7 text-[10px] gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Reprint
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 9. PRINT PROGRESS DIALOG */}
        <PrintProgressDialog
          open={printingOpen}
          queue={printQueue}
          currentIdx={currentPrintingIdx}
          onClose={() => setPrintingOpen(false)}
        />
      </div>
    </AppLayout>
  );
}
