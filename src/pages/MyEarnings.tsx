import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Banknote, TrendingUp, Calendar as CalendarIcon, Trophy, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths } from "date-fns";
import { el } from "date-fns/locale";

type Earning = {
  id: string;
  amount: number;
  phase: number;
  building_label: string | null;
  building_type: string | null;
  sr_id: string;
  completed_at: string;
  created_at: string;
};

const MyEarnings = () => {
  const { user } = useAuth();
  const [period, setPeriod] = useState<"week" | "month" | "all">("month");

  const { data: earnings = [], isLoading } = useQuery({
    queryKey: ["my-earnings", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("technician_earnings")
        .select("id, amount, phase, building_label, building_type, sr_id, completed_at, created_at")
        .eq("technician_id", user.id)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Earning[];
    },
    enabled: !!user?.id,
  });

  const filtered = useMemo(() => {
    const now = new Date();
    if (period === "week") {
      const s = startOfWeek(now, { weekStartsOn: 1 });
      const e = endOfWeek(now, { weekStartsOn: 1 });
      return earnings.filter((x) => {
        const d = new Date(x.completed_at);
        return d >= s && d <= e;
      });
    }
    if (period === "month") {
      const s = startOfMonth(now);
      const e = endOfMonth(now);
      return earnings.filter((x) => {
        const d = new Date(x.completed_at);
        return d >= s && d <= e;
      });
    }
    return earnings;
  }, [earnings, period]);

  const totals = useMemo(() => {
    const total = filtered.reduce((s, x) => s + Number(x.amount), 0);
    const phase2 = filtered.filter((x) => x.phase === 2).reduce((s, x) => s + Number(x.amount), 0);
    const phase3 = filtered.filter((x) => x.phase === 3).reduce((s, x) => s + Number(x.amount), 0);
    const lastMonth = (() => {
      const s = startOfMonth(subMonths(new Date(), 1));
      const e = endOfMonth(subMonths(new Date(), 1));
      return earnings
        .filter((x) => {
          const d = new Date(x.completed_at);
          return d >= s && d <= e;
        })
        .reduce((s, x) => s + Number(x.amount), 0);
    })();
    return { total, phase2, phase3, count: filtered.length, lastMonth };
  }, [filtered, earnings]);

  // Group by day
  const byDay = useMemo(() => {
    const map = new Map<string, Earning[]>();
    filtered.forEach((e) => {
      const key = format(new Date(e.completed_at), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const fmt = (n: number) => `€${n.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const periodLabel = period === "week" ? "αυτής της εβδομάδας" : period === "month" ? "αυτού του μήνα" : "συνολικά";

  return (
    <AppLayout>
      <div className="space-y-6 w-full max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <Banknote className="h-6 w-6 text-primary" />
              Οι Αμοιβές μου
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Παρακολούθησε τα έσοδά σου από ολοκληρωμένες φάσεις
            </p>
          </div>

          {/* Period switcher */}
          <div className="inline-flex rounded-xl bg-muted p-1">
            {([
              { k: "week", label: "Εβδομάδα" },
              { k: "month", label: "Μήνας" },
              { k: "all", label: "Σύνολο" },
            ] as const).map((p) => (
              <button
                key={p.k}
                onClick={() => setPeriod(p.k)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  period === p.k
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Hero card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-emerald-500/10 via-violet-500/5 to-background p-6 sm:p-8 shadow-sm"
        >
          <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />

          <div className="relative flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                Συνολικές Αμοιβές {periodLabel}
              </p>
              <p className="text-4xl sm:text-5xl font-black tracking-tight mt-2 bg-gradient-to-r from-emerald-600 to-violet-600 bg-clip-text text-transparent">
                {fmt(totals.total)}
              </p>
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Trophy className="h-3.5 w-3.5 text-amber-500" />
                  {totals.count} ολοκληρώσεις
                </span>
                {period === "month" && totals.lastMonth > 0 && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Προηγ. μήνας: {fmt(totals.lastMonth)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <div className="rounded-xl bg-background/80 backdrop-blur border border-border p-3 min-w-[110px]">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Φάση 2</p>
                <p className="text-lg font-bold text-violet-600 mt-0.5">{fmt(totals.phase2)}</p>
              </div>
              <div className="rounded-xl bg-background/80 backdrop-blur border border-border p-3 min-w-[110px]">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Φάση 3</p>
                <p className="text-lg font-bold text-emerald-600 mt-0.5">{fmt(totals.phase3)}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Timeline */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold flex items-center gap-2 px-1">
            <CalendarIcon className="h-4 w-4 text-primary" />
            Ιστορικό
          </h2>

          {isLoading ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground">Φόρτωση...</p>
            </div>
          ) : byDay.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
              <Banknote className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">Δεν υπάρχουν αμοιβές για αυτή την περίοδο</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ολοκλήρωσε Φάση 2 ή Φάση 3 σε ένα SR για να ξεκινήσεις
              </p>
            </div>
          ) : (
            byDay.map(([day, items], i) => {
              const total = items.reduce((s, x) => s + Number(x.amount), 0);
              return (
                <motion.div
                  key={day}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5 border-b border-border">
                    <p className="text-xs font-bold capitalize">
                      {format(new Date(day), "EEEE, d MMMM yyyy", { locale: el })}
                    </p>
                    <p className="text-xs font-bold text-emerald-600">{fmt(total)}</p>
                  </div>
                  <div className="divide-y divide-border/50">
                    {items.map((e) => (
                      <div key={e.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`shrink-0 h-9 w-9 rounded-lg flex items-center justify-center text-[11px] font-extrabold ${
                              e.phase === 2
                                ? "bg-violet-500/10 text-violet-600"
                                : "bg-emerald-500/10 text-emerald-600"
                            }`}
                          >
                            Φ{e.phase}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">SR {e.sr_id}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {e.building_label || e.building_type || "—"}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm font-bold tabular-nums text-foreground shrink-0">{fmt(Number(e.amount))}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default MyEarnings;
