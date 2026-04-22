/**
 * OteAutoBillingCard
 * ──────────────────
 * Admin-only summary card που δείχνει την αυτόματη τιμολόγηση ΟΤΕ
 * για μια κατασκευή (construction). Διαβάζει από `construction_works`
 * + `work_pricing` και ομαδοποιεί ανά prefix κωδικού (1956 / 1965 / …).
 *
 * Εμφανίζεται μέσα στο detail dialog του Construction.tsx.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sparkles, FileText, Eye, Loader2 } from "lucide-react";
import { getCodePrefix } from "@/lib/oteArticleCategories";
import { isTierManagedCode } from "@/lib/oteAutoBilling";

interface Props {
  constructionId: string;
}

interface WorkRow {
  id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  work_pricing: {
    code: string;
    description: string | null;
    unit: string | null;
  } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  "1955": "Γ' Φάση",
  "1956": "Αυτοψία",
  "1963": "Εσκαλίτ",
  "1965": "Σωλήνωση",
  "1970": "BEP",
  "1980": "Εμφύσηση",
  "1984": "Οριζόντια",
  "1985": "Κατακόρυφη",
  "1986": "Κολλήσεις",
  "1991": "BCP",
  "1993": "Καμπίνα→BEP",
  "1997": "Κουτί BCP",
};

const formatPrice = (n: number) =>
  new Intl.NumberFormat("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const OteAutoBillingCard = ({ constructionId }: Props) => {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { data: works, isLoading } = useQuery({
    queryKey: ["construction_works_summary", constructionId],
    enabled: !!constructionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construction_works")
        .select("id, quantity, unit_price, subtotal, work_pricing:work_pricing_id (code, description, unit)")
        .eq("construction_id", constructionId);
      if (error) throw error;
      return (data ?? []) as unknown as WorkRow[];
    },
  });

  const { autoRows, total, byCategory, totalCount } = useMemo(() => {
    const rows = works ?? [];
    const auto = rows.filter((r) => r.work_pricing?.code && isTierManagedCode(r.work_pricing.code));
    const sum = auto.reduce(
      (s, r) => s + (Number(r.subtotal) || Number(r.quantity) * Number(r.unit_price) || 0),
      0,
    );
    const groups = new Map<string, { count: number; total: number }>();
    for (const r of auto) {
      const code = r.work_pricing?.code || "";
      const prefix = getCodePrefix(code);
      const sub = Number(r.subtotal) || Number(r.quantity) * Number(r.unit_price) || 0;
      const cur = groups.get(prefix) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += sub;
      groups.set(prefix, cur);
    }
    return {
      autoRows: auto,
      total: sum,
      byCategory: Array.from(groups.entries()),
      totalCount: auto.length,
    };
  }, [works]);

  if (isLoading) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Υπολογισμός αυτόματης τιμολόγησης…
      </Card>
    );
  }

  if (totalCount === 0) {
    return (
      <Card className="p-4 text-xs text-muted-foreground">
        Δεν έχουν υπολογιστεί ακόμη αυτόματα άρθρα ΟΤΕ για αυτή την κατασκευή.
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Αυτόματη Τιμολόγηση ΟΤΕ</h3>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Υπολογισμός βάσει AS-BUILD
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-black tabular-nums text-primary">
                {formatPrice(total)} €
              </div>
              <Badge variant="secondary" className="text-[10px] mt-0.5">
                {totalCount} άρθρα
              </Badge>
            </div>
          </div>

          {/* Breakdown per category */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {byCategory.map(([prefix, info]) => (
              <div
                key={prefix}
                className="rounded-lg border border-border bg-card p-2"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                  {CATEGORY_LABELS[prefix] || prefix}
                </div>
                <div className="text-sm font-bold tabular-nums text-foreground mt-0.5">
                  {formatPrice(info.total)} €
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {info.count} άρθρ{info.count === 1 ? "ο" : "α"}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setDetailsOpen(true)}>
              <Eye className="h-4 w-4 mr-1.5" />
              Δες αναλυτικά
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <FileText className="h-4 w-4 mr-1.5" />
              Εκτύπωση ΟΤΕ
            </Button>
          </div>
        </div>
      </Card>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Αναλυτική Τιμολόγηση ΟΤΕ
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto space-y-4">
            {byCategory.map(([prefix]) => {
              const rows = autoRows.filter(
                (r) => getCodePrefix(r.work_pricing?.code || "") === prefix,
              );
              if (rows.length === 0) return null;
              const catTotal = rows.reduce(
                (s, r) =>
                  s + (Number(r.subtotal) || Number(r.quantity) * Number(r.unit_price) || 0),
                0,
              );
              return (
                <div key={prefix} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
                    <span>{CATEGORY_LABELS[prefix] || prefix}</span>
                    <span className="tabular-nums">{formatPrice(catTotal)} €</span>
                  </div>
                  <div className="space-y-1">
                    {rows.map((r) => {
                      const sub =
                        Number(r.subtotal) ||
                        Number(r.quantity) * Number(r.unit_price) ||
                        0;
                      return (
                        <div
                          key={r.id}
                          className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted/50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-[11px] text-primary">
                              {r.work_pricing?.code}
                            </div>
                            <div className="text-foreground truncate">
                              {r.work_pricing?.description || "—"}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[10px] text-muted-foreground tabular-nums">
                              {Number(r.quantity)} × {formatPrice(Number(r.unit_price))} €
                            </div>
                            <div className="font-bold tabular-nums">{formatPrice(sub)} €</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3 mt-2">
            <div className="text-xs text-muted-foreground">
              {totalCount} άρθρα · αυτόματος υπολογισμός
            </div>
            <div className="text-xl font-black tabular-nums text-primary">
              {formatPrice(total)} €
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default OteAutoBillingCard;
