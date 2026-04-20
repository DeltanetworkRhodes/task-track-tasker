import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import {
  Banknote,
  TrendingUp,
  Calendar as CalendarIcon,
  Trophy,
  Sparkles,
  ArrowLeft,
  Hourglass,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  subMonths,
} from "date-fns";
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

type PendingItem = {
  key: string;
  sr_id: string;
  building_label: string | null;
  building_type: string | null;
  amount: number;
  phase: number;
  assignment_id: string;
};

const MyEarnings = () => {
  const { user } = useAuth();
  const { data: role, isLoading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<"week" | "month" | "all">("month");
  const isTechnician = role === "technician";

  // 1) Τεχνικός & default_phase (καθορίζει ΜΙΑ φάση: 2 ή 3)
  const { data: profile } = useQuery({
    queryKey: ["my-profile-phase", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("default_phase, organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const myPhase = profile?.default_phase ?? null;

  // 2) Ολοκληρωμένες αμοιβές
  const { data: earnings = [], isLoading: earningsLoading } = useQuery({
    queryKey: ["my-earnings", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("technician_earnings")
        .select(
          "id, amount, phase, building_label, building_type, sr_id, completed_at, created_at"
        )
        .eq("technician_id", user.id)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Earning[];
    },
    enabled: !!user?.id,
  });

  // Φιλτράρισμα ολοκληρωμένων ΜΟΝΟ για τη δική του φάση (αν υπάρχει)
  const myEarnings = useMemo(() => {
    if (!myPhase) return earnings;
    return earnings.filter((e) => e.phase === myPhase);
  }, [earnings, myPhase]);

  // 3) Εκκρεμείς αμοιβές: SR που έχουν ανατεθεί (responsible OR crew) στη φάση του τεχνικού
  //    αλλά η αντίστοιχη φάση δεν έχει ολοκληρωθεί ακόμα.
  const { data: pending = [], isLoading: pendingLoading } = useQuery({
    queryKey: ["my-pending-earnings", user?.id, myPhase, profile?.organization_id],
    enabled: !!user?.id && !!myPhase && !!profile?.organization_id,
    queryFn: async (): Promise<PendingItem[]> => {
      // Α) Όλες οι αναθέσεις του (responsible)
      const { data: respAssign } = await supabase
        .from("assignments")
        .select("id")
        .eq("technician_id", user!.id);

      // Β) Crew αναθέσεις
      const { data: crewRows } = await supabase
        .from("sr_crew_assignments")
        .select("assignment_id")
        .eq("technician_id", user!.id);

      const ids = Array.from(
        new Set([
          ...((respAssign || []).map((r: any) => r.id as string)),
          ...((crewRows || []).map((r: any) => r.assignment_id as string)),
        ])
      );
      if (ids.length === 0) return [];

      // Γ) Constructions για αυτά τα assignments
      const { data: cons } = await supabase
        .from("constructions")
        .select(
          "id, sr_id, building_type, assignment_id, phase2_status, phase3_status"
        )
        .in("assignment_id", ids);

      // Κρατάμε όσα δεν έχουν ολοκληρωθεί στη φάση μας (ακόμα κι αν λείπει το building_type)
      const incompleteCons = (cons || []).filter((c: any) => {
        const phaseField = myPhase === 2 ? c.phase2_status : c.phase3_status;
        return phaseField !== "completed";
      });
      if (incompleteCons.length === 0) return [];

      // Δ) Φόρτωση όλου του pricing του οργανισμού (για default fallback)
      const { data: pricing } = await supabase
        .from("building_pricing")
        .select("building_type, building_label, phase2_price, phase3_price")
        .eq("organization_id", profile!.organization_id!);

      const priceMap = new Map<string, any>();
      (pricing || []).forEach((p: any) => priceMap.set(p.building_type, p));

      // Default fallback: Πολυκατοικία ή το πρώτο διαθέσιμο
      const defaultPrice =
        priceMap.get("poly") ||
        (pricing && pricing.length > 0 ? pricing[0] : null);

      const result: PendingItem[] = [];
      for (const c of incompleteCons) {
        const p = c.building_type ? priceMap.get(c.building_type) : null;
        const priceRow = p || defaultPrice;
        if (!priceRow) continue;
        const amount =
          Number(myPhase === 2 ? priceRow.phase2_price : priceRow.phase3_price) || 0;
        if (amount <= 0) continue;
        result.push({
          key: c.id,
          sr_id: c.sr_id,
          building_label: c.building_type
            ? priceRow.building_label
            : `${priceRow.building_label} (εκτίμηση)`,
          building_type: c.building_type || priceRow.building_type,
          amount,
          phase: myPhase,
          assignment_id: c.assignment_id,
        });
      }
      return result;
    },
  });

  const filtered = useMemo(() => {
    const now = new Date();
    if (period === "week") {
      const s = startOfWeek(now, { weekStartsOn: 1 });
      const e = endOfWeek(now, { weekStartsOn: 1 });
      return myEarnings.filter((x) => {
        const d = new Date(x.completed_at);
        return d >= s && d <= e;
      });
    }
    if (period === "month") {
      const s = startOfMonth(now);
      const e = endOfMonth(now);
      return myEarnings.filter((x) => {
        const d = new Date(x.completed_at);
        return d >= s && d <= e;
      });
    }
    return myEarnings;
  }, [myEarnings, period]);

  const totals = useMemo(() => {
    const total = filtered.reduce((s, x) => s + Number(x.amount), 0);
    const pendingTotal = pending.reduce((s, x) => s + Number(x.amount), 0);
    const lastMonth = (() => {
      const s = startOfMonth(subMonths(new Date(), 1));
      const e = endOfMonth(subMonths(new Date(), 1));
      return myEarnings
        .filter((x) => {
          const d = new Date(x.completed_at);
          return d >= s && d <= e;
        })
        .reduce((s, x) => s + Number(x.amount), 0);
    })();
    return { total, pendingTotal, count: filtered.length, lastMonth };
  }, [filtered, myEarnings, pending]);

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

  const fmt = (n: number) =>
    `€${n.toLocaleString("el-GR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const periodLabel =
    period === "week"
      ? "αυτής της εβδομάδας"
      : period === "month"
      ? "αυτού του μήνα"
      : "συνολικά";

  const phaseLabel = myPhase === 2 ? "Φάση 2 — Όδευση" : myPhase === 3 ? "Φάση 3 — Κολλήσεις" : null;
  const phaseAccent = myPhase === 2 ? "violet" : "emerald";

  // Wait for role to resolve before rendering layout
  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Φόρτωση...</p>
      </div>
    );
  }

  const isLoading = earningsLoading || pendingLoading;

  const content = (
    <div className="space-y-6 w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {isTechnician && (
            <button
              onClick={() => navigate("/technician")}
              className="rounded-lg p-2 hover:bg-muted transition-colors shrink-0"
              aria-label="Πίσω"
            >
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <Banknote className="h-6 w-6 text-primary" />
              Οι Αμοιβές μου
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {phaseLabel ? (
                <>Παρακολούθησε τις αμοιβές σου για <strong>{phaseLabel}</strong></>
              ) : (
                <>Παρακολούθησε τα έσοδά σου από ολοκληρωμένες φάσεις</>
              )}
            </p>
          </div>
        </div>

        {/* Period switcher */}
        <div className="inline-flex rounded-xl bg-muted p-1">
          {(
            [
              { k: "week", label: "Εβδομάδα" },
              { k: "month", label: "Μήνας" },
              { k: "all", label: "Σύνολο" },
            ] as const
          ).map((p) => (
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
            <p
              className={`text-4xl sm:text-5xl font-black tracking-tight mt-2 bg-gradient-to-r ${
                phaseAccent === "violet"
                  ? "from-violet-600 to-violet-400"
                  : "from-emerald-600 to-emerald-400"
              } bg-clip-text text-transparent`}
            >
              {fmt(totals.total)}
            </p>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
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

          {myPhase && (
            <div className="rounded-xl bg-background/80 backdrop-blur border border-border p-4 min-w-[180px]">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                <Hourglass className="h-3 w-3 text-amber-500" />
                Έχεις να πάρεις
              </p>
              <p
                className={`text-2xl font-extrabold mt-1 ${
                  phaseAccent === "violet" ? "text-violet-600" : "text-emerald-600"
                }`}
              >
                {fmt(totals.pendingTotal)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {pending.length} εκκρεμή SR
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Pending earnings */}
      {myPhase && pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold flex items-center gap-2 px-1">
            <Hourglass className="h-4 w-4 text-amber-500" />
            Εκκρεμείς Αμοιβές ({pending.length})
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              Σύνολο: <strong className="text-foreground">{fmt(totals.pendingTotal)}</strong>
            </span>
          </h2>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
            <div className="divide-y divide-amber-500/15">
              {pending.map((p) => (
                <div
                  key={p.key}
                  className="flex items-center justify-between px-4 py-3 hover:bg-amber-500/10 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`shrink-0 h-9 w-9 rounded-lg flex items-center justify-center text-[11px] font-extrabold ${
                        p.phase === 2
                          ? "bg-violet-500/15 text-violet-600"
                          : "bg-emerald-500/15 text-emerald-600"
                      }`}
                    >
                      Φ{p.phase}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">SR {p.sr_id}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {p.building_label || p.building_type || "—"}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400 shrink-0">
                    {fmt(p.amount)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold flex items-center gap-2 px-1">
          <CalendarIcon className="h-4 w-4 text-primary" />
          Ιστορικό Ολοκληρωμένων
        </h2>

        {isLoading ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">Φόρτωση...</p>
          </div>
        ) : byDay.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
            <Banknote className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">
              Δεν υπάρχουν αμοιβές για αυτή την περίοδο
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {phaseLabel
                ? `Ολοκλήρωσε ${phaseLabel} σε ένα SR για να ξεκινήσεις`
                : "Ολοκλήρωσε Φάση 2 ή Φάση 3 σε ένα SR για να ξεκινήσεις"}
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
                    <div
                      key={e.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
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
                      <p className="text-sm font-bold tabular-nums text-foreground shrink-0">
                        {fmt(Number(e.amount))}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );

  // Technicians: standalone layout (no admin sidebar)
  if (isTechnician) {
    return (
      <div className="min-h-screen bg-background safe-top safe-left safe-right ios-safe-bottom">
        <div className="p-4 sm:p-6">{content}</div>
      </div>
    );
  }

  // Admins: full app layout with sidebar
  return <AppLayout>{content}</AppLayout>;
};

export default MyEarnings;
