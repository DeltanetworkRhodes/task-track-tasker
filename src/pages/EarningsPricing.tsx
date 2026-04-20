import { useState, useMemo, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Save, Info, Banknote, Loader2 } from "lucide-react";

interface BuildingPriceRow {
  id: string;
  building_type: string;
  building_label: string;
  building_icon: string | null;
  phase2_price: number;
  phase3_price: number;
  sort_order: number | null;
}

const EarningsPricing = () => {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Map<string, { phase2_price: number; phase3_price: number }>>(new Map());

  const { data: rows, isLoading } = useQuery({
    queryKey: ["building-pricing", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("building_pricing")
        .select("id, building_type, building_label, building_icon, phase2_price, phase3_price, sort_order")
        .eq("organization_id", organizationId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as BuildingPriceRow[];
    },
  });

  // Map for quick edited values lookup
  const getValue = (row: BuildingPriceRow, field: "phase2_price" | "phase3_price") => {
    const p = pending.get(row.id);
    if (p) return p[field];
    return Number(row[field]);
  };

  const setValue = (row: BuildingPriceRow, field: "phase2_price" | "phase3_price", value: number) => {
    setPending((prev) => {
      const next = new Map(prev);
      const current = next.get(row.id) ?? { phase2_price: Number(row.phase2_price), phase3_price: Number(row.phase3_price) };
      next.set(row.id, { ...current, [field]: isNaN(value) ? 0 : value });
      return next;
    });
  };

  const dirtyCount = pending.size;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = Array.from(pending.entries());
      for (const [id, vals] of updates) {
        const { error } = await supabase
          .from("building_pricing")
          .update({
            phase2_price: vals.phase2_price,
            phase3_price: vals.phase3_price,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Οι τιμές αποθηκεύτηκαν", {
        description: "Οι αλλαγές εφαρμόστηκαν σε όλα τα νέα SR",
      });
      setPending(new Map());
      queryClient.invalidateQueries({ queryKey: ["building-pricing"] });
    },
    onError: (err: any) => toast.error(err?.message || "Σφάλμα αποθήκευσης"),
  });

  const stats = useMemo(() => {
    if (!rows || rows.length === 0) return { avg2: 0, avg3: 0, total: 0 };
    const list = rows.map((r) => ({
      p2: getValue(r, "phase2_price"),
      p3: getValue(r, "phase3_price"),
    }));
    const avg2 = list.reduce((s, x) => s + x.p2, 0) / list.length;
    const avg3 = list.reduce((s, x) => s + x.p3, 0) / list.length;
    return { avg2, avg3, total: avg2 + avg3 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, pending]);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
              Τιμοκατάλογος ανά Κτίριο
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Τιμές που λαμβάνει ο τεχνικός ανά ολοκλήρωση φάσης
            </p>
          </div>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={dirtyCount === 0 || saveMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-500/20 hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Αποθήκευση
            {dirtyCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold">
                {dirtyCount}
              </span>
            )}
          </button>
        </div>

        {/* Info banner */}
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 p-4 flex items-start gap-3">
          <div className="rounded-lg bg-violet-100 p-2 shrink-0">
            <Info className="h-4 w-4 text-violet-700" />
          </div>
          <div>
            <p className="text-sm font-bold text-violet-900">
              Ο τεχνικός βλέπει το ποσό πριν και μετά την ολοκλήρωση
            </p>
            <p className="text-xs text-violet-700/80 mt-0.5">
              Αυτόματη χρέωση στη βάση όταν ολοκληρώνεται η φάση. Καμιά χειροκίνητη ενέργεια.
            </p>
          </div>
        </div>

        {/* Pricing table */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-3 px-4 text-left font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                    Τύπος Κτιρίου
                  </th>
                  <th className="py-3 px-4 text-right font-semibold text-violet-600 text-[11px] uppercase tracking-wider">
                    🔧 Φ2 Οδεύσεις
                  </th>
                  <th className="py-3 px-4 text-right font-semibold text-emerald-600 text-[11px] uppercase tracking-wider">
                    🔬 Φ3 Κόλληση
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-muted-foreground text-sm">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : !rows || rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-muted-foreground text-sm">
                      Δεν υπάρχουν τιμές
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const isDirty = pending.has(row.id);
                    return (
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        className={`border-b border-border/50 transition-colors ${
                          isDirty ? "bg-violet-50/40" : "hover:bg-muted/30"
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{row.building_icon || "🏢"}</span>
                            <div>
                              <p className="font-bold text-foreground">{row.building_label}</p>
                              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                                {row.building_type}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all">
                            <span className="text-xs text-muted-foreground">€</span>
                            <input
                              type="number"
                              min={0}
                              step={10}
                              value={getValue(row, "phase2_price")}
                              onChange={(e) => setValue(row, "phase2_price", parseFloat(e.target.value))}
                              className="w-24 bg-transparent text-right font-bold tabular-nums text-foreground focus:outline-none"
                            />
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
                            <span className="text-xs text-muted-foreground">€</span>
                            <input
                              type="number"
                              min={0}
                              step={10}
                              value={getValue(row, "phase3_price")}
                              onChange={(e) => setValue(row, "phase3_price", parseFloat(e.target.value))}
                              className="w-24 bg-transparent text-right font-bold tabular-nums text-foreground focus:outline-none"
                            />
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary card */}
        <div className="grid grid-cols-3 gap-3 rounded-2xl bg-muted/40 p-4">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Μέση Φ2</p>
            <p className="text-2xl font-extrabold text-violet-600 tabular-nums mt-1">€{stats.avg2.toFixed(0)}</p>
          </div>
          <div className="text-center border-x border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Μέση Φ3</p>
            <p className="text-2xl font-extrabold text-emerald-600 tabular-nums mt-1">€{stats.avg3.toFixed(0)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Μέσο σύνολο</p>
            <p className="text-2xl font-extrabold text-foreground tabular-nums mt-1">€{stats.total.toFixed(0)}</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default EarningsPricing;
