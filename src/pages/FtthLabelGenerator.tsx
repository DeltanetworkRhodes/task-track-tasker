import { useState, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tag, Copy, Check, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";

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

// ─── Main Page ───
export default function FtthLabelGenerator() {
  const [srId, setSrId] = useState("");
  const [loading, setLoading] = useState(false);
  const [srData, setSrData] = useState<any>(null);
  const [gisData, setGisData] = useState<any>(null);

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

      setGisData(gis);
      if (!gis) {
        toast.warning("Δεν βρέθηκαν GIS δεδομένα για αυτό το SR");
      }
    } catch (e: any) {
      toast.error(e.message || "Σφάλμα φόρτωσης");
    } finally {
      setLoading(false);
    }
  }, [srId]);

  // ─── Parse GIS data ───
  const parsed = useMemo(() => {
    if (!gisData) return null;

    const optPaths = (gisData.optical_paths as any[]) || [];

    const getType = (p: any) =>
      (p.type || p["OPTICAL PATH TYPE"] || "").toUpperCase();
    const getPath = (p: any) => p.path || p["OPTICAL PATH"] || "";

    const cabBepPaths = optPaths.filter((p) => getType(p) === "CAB-BEP");
    const bepBmoPaths = optPaths.filter((p) => getType(p) === "BEP-BMO");
    const bmoFbPaths = optPaths.filter((p) => getType(p) === "BMO-FB");

    // ── BEP Grid: μία γραμμή ανά BEP, στήλες 1-12 = αριθμός ίνας στο BEP ──
    // Row A = BEP01, Row B = BEP02, κτλ.
    interface GridCell {
      row: string;
      col: number;
      text: string;
      kind?: "lim" | "floor" | "black";
    }
    const bepCells: GridCell[] = [];

    // Helper: extract BEP index (e.g. "BEP01" → 1)
    const getBepIdx = (path: string): number => {
      const m = path.match(/BEP(\d+)/);
      return m ? parseInt(m[1]) : 1;
    };
    const bepIdxToRow = (idx: number) => String.fromCharCode(64 + idx); // 1→A, 2→B…

    // Step 1 — CAB-BEP: fiber number is the LAST _NN before _SBxx OR end
    cabBepPaths.forEach((p: any) => {
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

    // Step 2 — BEP-BMO: fiber number is the middle _FF_ → όροφος από BMO→FB
    bepBmoPaths.forEach((p: any) => {
      const path = getPath(p);
      // BEP01(b08)_SB01(1:8).PP_FF_BMO01_BB
      const m = path.match(/_SB(\d+)\([^)]+\)\.(\d+)_(\d+)_BMO\d+_(\d+)/);
      if (!m) return;
      const fiber = parseInt(m[3]);
      const bmoPort = parseInt(m[4]);
      const bepIdx = getBepIdx(path);
      const row = bepIdxToRow(bepIdx);

      // Βρες όροφο από BMO→FB
      let floor = "";
      const fbPath = bmoFbPaths.find((fb: any) => {
        const s = getPath(fb);
        return s.match(new RegExp(`BMO\\d+_${bmoPort}_FB`));
      });
      if (fbPath) {
        const s = getPath(fbPath);
        const fm = s.match(/FB\(([^)]+)\)/);
        if (fm) floor = fm[1];
      }

      // Δεν αντικαθιστούμε υπάρχον CAB cell
      if (!bepCells.find((c) => c.row === row && c.col === fiber)) {
        bepCells.push({
          row,
          col: fiber,
          text: floor ? floorLabel(floor) : "",
          kind: "floor",
        });
      }
    });

    // ── BMO ports → όροφος ──
    interface BmoPort {
      port: number;
      floor: string;
    }
    const bmoPorts: BmoPort[] = [];
    bmoFbPaths.forEach((p: any) => {
      const path = getPath(p);
      const m = path.match(/BMO\d+_(\d+)_FB\(([^)]+)\)/);
      if (!m) return;
      bmoPorts.push({ port: parseInt(m[1]), floor: m[2] });
    });
    bmoPorts.sort((a, b) => a.port - b.port);

    // ── FB groups (ομαδοποίηση BMO ports ανά όροφο) ──
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

    // CAB limits για BEP door — μόνο τα limit ranges (B1.1, B1.2…)
    const cabLimits = cabBepPaths
      .map((p: any) => {
        const path = getPath(p);
        const m = path.match(/B(\d+)\.(\d+)/);
        return m ? m[0] : "";
      })
      .filter(Boolean)
      .sort()
      .join(", ");

    // Πόσα BEP rows χρειάζονται;
    const bepRowsCount = Math.max(
      1,
      ...cabBepPaths.map((p: any) => getBepIdx(getPath(p))),
      ...bepBmoPaths.map((p: any) => getBepIdx(getPath(p)))
    );
    const bepRows = Array.from({ length: Math.max(bepRowsCount, 1) }, (_, i) =>
      String.fromCharCode(65 + i)
    );

    return { bepCells, bmoPorts, fbGroups, cabLimits, cabBepPaths, bepRows };
  }, [gisData]);


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

        {/* Placeholder */}
        {!parsed && (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            Εισάγετε SR ID για να φορτώσετε τα δεδομένα GIS και να δημιουργηθούν
            αυτόματα τα labels.
          </Card>
        )}

        {/* 3. ΚΑΜΠΙΝΑ */}
        {parsed && srData && (
          <Card className="p-4 space-y-4 print:break-inside-avoid">
            <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
              🏗️ <span>Καμπίνα</span>
            </h2>

            <div className="space-y-1">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Μέσα στην κασέτα
              </div>
              <LabelChip text={`ΔΙΕΥΘΥΝΣΗ: ${srData.address || ""}`} />
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Εξόδους Splitter
              </div>
              <div className="flex flex-wrap gap-2">
                {parsed.cabBepPaths.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">
                    Καμία CAB-BEP διαδρομή
                  </span>
                )}
                {parsed.cabBepPaths.map((p: any, i: number) => {
                  const path = p.path || p["OPTICAL PATH"] || "";
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
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Σωληνίσκο
              </div>
              <LabelChip text={srData.address || ""} />
            </div>
          </Card>
        )}

        {/* 4. BEP */}
        {parsed && srData && (
          <Card className="p-4 space-y-4 print:break-inside-avoid">
            <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
              🔌 <span>BEP — Labels</span>
            </h2>

            {/* Πόρτα BEP */}
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Πόρτα BEP
              </div>
              <LabelChip
                text={`ΚΑΜΠΙΝΑ: ${srData.cab || ""}\nΟΡΙΑ: ${
                  parsed.cabLimits
                }`}
              />
            </div>

            {/* Μαύρη Ίνα */}
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Μαύρη Ίνα
              </div>
              <LabelChip
                text={`${srData.cab || ""}\n${parsed.cabLimits}`}
              />
            </div>

            {/* Grid A-D × 1-12 */}
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Εσωτερικό Grid{" "}
                <span className="opacity-60 normal-case font-normal">
                  (κλικ για αντιγραφή)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border border-border bg-muted/50 w-10 h-8"></th>
                      {Array.from({ length: 12 }, (_, i) => (
                        <th
                          key={i}
                          className="border border-border bg-muted/50 w-14 h-8 font-mono text-[10px]"
                        >
                          {i + 1}
                          {i === 0 && (
                            <div className="text-[8px] opacity-60">CAB</div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {["A", "B", "C", "D"].map((row) => (
                      <tr key={row}>
                        <td className="border border-border bg-muted/50 text-center font-bold font-mono">
                          {row}
                        </td>
                        {Array.from({ length: 12 }, (_, i) => {
                          const col = i + 1;
                          const cell = parsed.bepCells.find(
                            (c) => c.row === row && c.col === col,
                          );
                          const isCAB = col === 1;
                          return (
                            <td
                              key={col}
                              className={`border border-border p-1 text-center align-middle ${
                                isCAB ? "bg-amber-500/5" : ""
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
            <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
              📡 <span>BMO — Labels ανά Port</span>
            </h2>
            <div className="text-xs text-muted-foreground">
              Κολλάς στην ίνα κάθε port
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
                  className="flex items-center gap-2 p-2 rounded border border-border bg-muted/20"
                >
                  <Badge variant="secondary" className="font-mono">
                    Port {bp.port}
                  </Badge>
                  <LabelChip text={floorLabel(bp.floor)} />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 6. FLOOR BOX */}
        {parsed && parsed.fbGroups.length > 0 && (
          <Card className="p-4 space-y-3 print:break-inside-avoid">
            <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
              🏠 <span>Floor Box — Labels</span>
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

        {/* 7. PRINT */}
        {parsed && (
          <Button
            onClick={() => window.print()}
            variant="outline"
            className="w-full gap-2 print:hidden"
          >
            <Printer className="h-4 w-4" />
            Εκτύπωση
          </Button>
        )}
      </div>
    </AppLayout>
  );
}
