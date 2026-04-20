import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Printer, CheckCircle2, Package } from "lucide-react";
import type { PrintableLabel } from "@/lib/bluetoothLabelPrinter";

interface Props {
  open: boolean;
  queue: PrintableLabel[];
  currentIdx: number | null;
  onClose: () => void;
}

const LOC_INFO: Record<
  PrintableLabel["location"],
  { label: string; emoji: string; color: string; bg: string }
> = {
  kampina: { label: "ΚΑΜΠΙΝΑ", emoji: "🏗️", color: "text-amber-500", bg: "from-amber-500/10 to-orange-500/10" },
  bep: { label: "BEP", emoji: "🔌", color: "text-violet-400", bg: "from-violet-500/10 to-indigo-500/10" },
  bmo: { label: "BMO", emoji: "📡", color: "text-cyan-400", bg: "from-cyan-500/10 to-sky-500/10" },
  fb: { label: "FB", emoji: "📋", color: "text-emerald-400", bg: "from-emerald-500/10 to-green-500/10" },
};

export function PrintProgressDialog({ open, queue, currentIdx, onClose }: Props) {
  const total = queue.length;
  const done = currentIdx !== null ? currentIdx : 0;
  const progress = total > 0 ? (done / total) * 100 : 0;
  const current = currentIdx !== null ? queue[currentIdx] : null;

  const groups = queue.reduce<Record<string, Array<PrintableLabel & { idx: number }>>>(
    (acc, label, idx) => {
      if (!acc[label.location]) acc[label.location] = [];
      acc[label.location].push({ ...label, idx });
      return acc;
    },
    {}
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary" />
            Εκτύπωση Labels
          </DialogTitle>
        </DialogHeader>

        {/* Tape banner */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
          <Package className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            12mm tape · Όλα τα labels με το ίδιο tape
          </span>
        </div>

        {/* Overall progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono">
              {done} / {total} labels
            </span>
            <span className="font-bold text-primary">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>

        {/* Current label */}
        {current && (
          <motion.div
            key={current.print_order}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-3 rounded-lg border border-border bg-gradient-to-br ${LOC_INFO[current.location].bg}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{LOC_INFO[current.location].emoji}</span>
              <Badge variant="secondary" className="text-[10px]">
                {current.label_type === "flag" ? "🏳️ FLAG" : "🟦 FLAT"}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-mono">
                #{current.print_order}
              </Badge>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {current.section_title}
            </div>
            <div className="font-mono text-sm font-bold whitespace-pre-line">
              {current.content_lines
                ? current.content_lines.map((line, i) => <div key={i}>{line}</div>)
                : current.content}
            </div>
          </motion.div>
        )}

        {/* Timeline */}
        <div className="space-y-2">
          {(["kampina", "bep", "bmo", "fb"] as const).map((loc) => {
            const items = groups[loc];
            if (!items || items.length === 0) return null;
            const completed = items.filter((i) => i.idx < done).length;
            const allDone = completed === items.length;

            return (
              <div key={loc} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{LOC_INFO[loc].emoji}</span>
                    <span className={`text-xs font-bold ${LOC_INFO[loc].color}`}>
                      {LOC_INFO[loc].label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>
                      {completed}/{items.length}
                    </span>
                    {allDone && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {items.map((item) => (
                    <div
                      key={item.idx}
                      className={`h-1.5 flex-1 min-w-[8px] rounded-full transition-colors ${
                        item.idx < done
                          ? "bg-emerald-500"
                          : item.idx === done
                            ? "bg-primary animate-pulse"
                            : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
