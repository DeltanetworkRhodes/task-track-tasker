import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  DollarSign, Banknote, Activity, Briefcase, AlertCircle,
  MapPin, Sparkles, Eye, Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip,
  Legend, CartesianGrid
} from "recharts";

const OTE_BLUE = "#3B82F6";
const VF_RED = "#E60000";

type DailyVal = { ote: number; vf: number };

export default function MasterDashboard() {
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["master_dashboard_v1"],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
      const last30Days = new Date(Date.now() - 30 * 86400000).toISOString();
      const stuckThreshold = new Date(Date.now() - 14 * 86400000).toISOString();

      const [
        oteProfitMonthRes,
        oteProfitLastMonthRes,
        oteAssignmentsActiveRes,
        oteAssignmentsStuckRes,
        oteAssignmentsCompletedRes,
        vfTicketsMonthRes,
        vfTicketsLastMonthRes,
        vfPendingRes,
        vfDailyRes,
        subPaymentsPendingRes,
        oteByAreaRes,
        vfByRegionRes,
      ] = await Promise.all([
        supabase.from("profit_per_sr").select("revenue, expenses, profit, created_at")
          .gte("created_at", startOfMonth),
        supabase.from("profit_per_sr").select("revenue, expenses, profit")
          .gte("created_at", startOfLastMonth).lte("created_at", endOfLastMonth),
        supabase.from("assignments").select("*", { count: "exact", head: true })
          .neq("status", "completed"),
        supabase.from("assignments").select("*", { count: "exact", head: true })
          .eq("status", "construction")
          .lt("updated_at", stuckThreshold),
        supabase.from("assignments").select("*", { count: "exact", head: true })
          .eq("status", "completed").gte("updated_at", startOfMonth),
        supabase.from("vodafone_tickets")
          .select("total_vodafone_eur, total_subcontractor_eur, margin_eur, completed_at, region")
          .eq("status", "completed").gte("completed_at", startOfMonth),
        supabase.from("vodafone_tickets")
          .select("total_vodafone_eur, total_subcontractor_eur")
          .eq("status", "completed").gte("completed_at", startOfLastMonth).lte("completed_at", endOfLastMonth),
        supabase.from("vodafone_tickets").select("*", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase.from("vodafone_tickets")
          .select("total_vodafone_eur, completed_at")
          .eq("status", "completed").gte("completed_at", last30Days),
        supabase.from("subcontractor_payments").select("amount_eur, status").eq("status", "pending"),
        supabase.from("assignments").select("area, status").eq("status", "completed").gte("updated_at", startOfMonth),
        supabase.from("vodafone_tickets").select("region, total_vodafone_eur").eq("status", "completed").gte("completed_at", startOfMonth),
      ]);

      // OTE
      const oteData = oteProfitMonthRes.data || [];
      const oteRevenue = oteData.reduce((s, r: any) => s + Number(r.revenue || 0), 0);
      const oteExpenses = oteData.reduce((s, r: any) => s + Number(r.expenses || 0), 0);
      const oteProfit = oteData.reduce((s, r: any) => s + Number(r.profit || 0), 0);
      const oteLastData = oteProfitLastMonthRes.data || [];
      const oteLastRevenue = oteLastData.reduce((s, r: any) => s + Number(r.revenue || 0), 0);

      // Vodafone
      const vfData = vfTicketsMonthRes.data || [];
      const vfRevenue = vfData.reduce((s, r: any) => s + Number(r.total_vodafone_eur || 0), 0);
      const vfCosts = vfData.reduce((s, r: any) => s + Number(r.total_subcontractor_eur || 0), 0);
      const vfProfit = vfData.reduce((s, r: any) => s + Number(r.margin_eur || 0), 0);
      const vfLastData = vfTicketsLastMonthRes.data || [];
      const vfLastRevenue = vfLastData.reduce((s, r: any) => s + Number(r.total_vodafone_eur || 0), 0);

      // Combined
      const totalRevenue = oteRevenue + vfRevenue;
      const totalCosts = oteExpenses + vfCosts;
      const totalProfit = oteProfit + vfProfit;
      const totalLastRevenue = oteLastRevenue + vfLastRevenue;
      const revenueChange = totalLastRevenue > 0
        ? ((totalRevenue - totalLastRevenue) / totalLastRevenue) * 100
        : 0;

      const pendingSubPayments = (subPaymentsPendingRes.data || [])
        .reduce((s: number, p: any) => s + Number(p.amount_eur || 0), 0);

      // Daily cashflow
      const dailyMap: Record<string, DailyVal> = {};
      oteData.forEach((r: any) => {
        if (r.created_at) {
          const day = new Date(r.created_at).toISOString().split("T")[0];
          if (!dailyMap[day]) dailyMap[day] = { ote: 0, vf: 0 };
          dailyMap[day].ote += Number(r.revenue || 0);
        }
      });
      (vfDailyRes.data || []).forEach((r: any) => {
        if (r.completed_at) {
          const day = new Date(r.completed_at).toISOString().split("T")[0];
          if (!dailyMap[day]) dailyMap[day] = { ote: 0, vf: 0 };
          dailyMap[day].vf += Number(r.total_vodafone_eur || 0);
        }
      });
      const cashflow = Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({
          date: new Date(date).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit" }),
          OTE: Number(vals.ote.toFixed(2)),
          VODAFONE: Number(vals.vf.toFixed(2)),
        }));

      // Top Regions
      const regionMap: Record<string, { revenue: number; clients: Set<string> }> = {};
      const oteAreas = Array.from(new Set((oteByAreaRes.data || []).map((a: any) => a.area || "Άγνωστη")));
      const oteRevenuePerArea = oteAreas.length > 0 ? oteRevenue / oteAreas.length : 0;
      oteAreas.forEach((area) => {
        if (!regionMap[area]) regionMap[area] = { revenue: 0, clients: new Set() };
        regionMap[area].revenue += oteRevenuePerArea;
        regionMap[area].clients.add("OTE");
      });
      (vfByRegionRes.data || []).forEach((t: any) => {
        const region = t.region || "Άγνωστη";
        if (!regionMap[region]) regionMap[region] = { revenue: 0, clients: new Set() };
        regionMap[region].revenue += Number(t.total_vodafone_eur || 0);
        regionMap[region].clients.add("VODAFONE");
      });
      const topRegions = Object.entries(regionMap)
        .map(([region, data]) => ({
          region,
          revenue: data.revenue,
          clients: Array.from(data.clients),
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      return {
        totalRevenue,
        totalCosts,
        totalProfit,
        profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        revenueChange,
        pendingLiabilities: pendingSubPayments,
        ote: {
          revenue: oteRevenue,
          expenses: oteExpenses,
          profit: oteProfit,
          completed: oteAssignmentsCompletedRes.count || 0,
          active: oteAssignmentsActiveRes.count || 0,
          stuck: oteAssignmentsStuckRes.count || 0,
        },
        vodafone: {
          revenue: vfRevenue,
          costs: vfCosts,
          profit: vfProfit,
          completed: vfData.length,
          pending: vfPendingRes.count || 0,
        },
        cashflow,
        topRegions,
      };
    },
  });

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Καλημέρα";
    if (h < 17) return "Καλό μεσημέρι";
    if (h < 21) return "Καλό απόγευμα";
    return "Καλό βράδυ";
  })();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Emerald Ambient Background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[120px] animate-pulse-glow" />
        <div className="absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-teal-500/10 blur-[120px] animate-pulse-glow" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/3 left-1/3 h-[400px] w-[400px] rounded-full bg-cyan-500/5 blur-[100px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-emerald-500/10 bg-background/70 backdrop-blur-xl">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/client-selector")}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Πίνακες
            </Button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
              💼
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-tight">Συνολική Εικόνα</h1>
              <p className="text-[11px] text-muted-foreground">All Clients Dashboard</p>
            </div>
          </div>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 hidden sm:flex">
            <Sparkles className="h-3 w-3 mr-1" /> Premium
          </Badge>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Greeting */}
        <div className="animate-fade-in">
          <h2 className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent">
            {greeting} 👋
          </h2>
          <p className="text-muted-foreground mt-1">
            Συνολική εικόνα μηνός — {new Date().toLocaleDateString("el-GR", { month: "long", year: "numeric" })}
          </p>
        </div>

        {/* HERO KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Συνολικά Έσοδα"
            value={stats?.totalRevenue ?? 0}
            isCurrency
            change={stats?.revenueChange}
            color="emerald"
            icon={<DollarSign className="h-5 w-5" />}
            stagger={1}
            big
          />
          <KpiCard
            label="Συνολικά Κόστη"
            value={stats?.totalCosts ?? 0}
            isCurrency
            color="amber"
            icon={<Banknote className="h-5 w-5" />}
            stagger={2}
          />
          <KpiCard
            label="Καθαρό Κέρδος"
            value={stats?.totalProfit ?? 0}
            isCurrency
            subtitle={`Margin ${(stats?.profitMargin ?? 0).toFixed(1)}%`}
            color={(stats?.totalProfit ?? 0) >= 0 ? "emerald" : "red"}
            icon={<Activity className="h-5 w-5" />}
            stagger={3}
            big
          />
          <KpiCard
            label="Εκκρεμείς Πληρωμές"
            value={stats?.pendingLiabilities ?? 0}
            isCurrency
            subtitle="Σε υπεργολάβους"
            color="red"
            icon={<Wallet className="h-5 w-5" />}
            stagger={4}
          />
        </div>

        {/* Cashflow Chart */}
        <div
          className="rounded-2xl border border-emerald-500/15 bg-card/60 backdrop-blur-xl p-6 shadow-xl shadow-emerald-500/5 animate-fade-in"
          style={{ animationDelay: "0.5s", animationFillMode: "backwards" }}
        >
          <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
                Cashflow — Τελευταίες 30 ημέρες
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Συνολικά έσοδα ανά ημέρα από όλους τους clients
              </p>
            </div>
          </div>

          {!stats?.cashflow?.length ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <TrendingDown className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Δεν υπάρχουν έσοδα ακόμα</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={stats.cashflow}>
                <defs>
                  <linearGradient id="oteGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={OTE_BLUE} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={OTE_BLUE} stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="vfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={VF_RED} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={VF_RED} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  formatter={(v: any, name: string) => [`${Number(v).toFixed(2)}€`, name]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Area type="monotone" dataKey="OTE" stackId="1" stroke={OTE_BLUE} fill="url(#oteGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="VODAFONE" stackId="1" stroke={VF_RED} fill="url(#vfGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Per-Client Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ClientPanel
            icon="📡"
            title="OTE / COSMOTE"
            subtitle="Κατασκευές οπτικών ινών"
            color="blue"
            stats={[
              { label: "Έσοδα", value: stats?.ote.revenue ?? 0, isCurrency: true, primary: true },
              { label: "Κόστη", value: stats?.ote.expenses ?? 0, isCurrency: true },
              { label: "Κέρδος", value: stats?.ote.profit ?? 0, isCurrency: true, accent: true },
              { label: "Ολοκληρωμένα", value: stats?.ote.completed ?? 0 },
              { label: "Ενεργά", value: stats?.ote.active ?? 0 },
            ]}
            alert={(stats?.ote.stuck ?? 0) > 0 ? `${stats?.ote.stuck} SR κολλημένα >14 ημέρες` : undefined}
            onClick={() => navigate("/ote/dashboard")}
          />

          <ClientPanel
            icon="📱"
            title="VODAFONE"
            subtitle="Τεχνικές κλήσεις & εγκαταστάσεις"
            color="red"
            stats={[
              { label: "Έσοδα", value: stats?.vodafone.revenue ?? 0, isCurrency: true, primary: true },
              { label: "Κόστη υπεργολάβων", value: stats?.vodafone.costs ?? 0, isCurrency: true },
              { label: "Margin", value: stats?.vodafone.profit ?? 0, isCurrency: true, accent: true },
              { label: "Ολοκληρωμένα tickets", value: stats?.vodafone.completed ?? 0 },
              { label: "Εκκρεμή", value: stats?.vodafone.pending ?? 0 },
            ]}
            alert={(stats?.vodafone.pending ?? 0) > 10 ? `${stats?.vodafone.pending} εκκρεμή tickets` : undefined}
            onClick={() => navigate("/vodafone/dashboard")}
          />
        </div>

        {/* Top Regions */}
        <div
          className="rounded-2xl border border-emerald-500/15 bg-card/60 backdrop-blur-xl p-6 shadow-xl shadow-emerald-500/5 animate-fade-in"
          style={{ animationDelay: "0.7s", animationFillMode: "backwards" }}
        >
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2 mb-5">
            <MapPin className="h-5 w-5 text-emerald-500" />
            Top 5 Περιοχές
          </h3>

          {!stats?.topRegions?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">Δεν υπάρχουν δεδομένα</p>
          ) : (
            <div className="space-y-2">
              {stats.topRegions.map((r, idx) => {
                const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
                return (
                  <div
                    key={r.region}
                    className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-background/40 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all group"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-600/10 text-xl">
                      {medals[idx]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{r.region}</p>
                      <div className="flex gap-1.5 mt-1">
                        {r.clients.map((c) => (
                          <Badge
                            key={c}
                            variant="outline"
                            className={`text-[10px] ${c === "OTE" ? "border-blue-500/30 text-blue-500" : "border-red-500/30 text-red-500"}`}
                          >
                            {c === "OTE" ? "📡" : "📱"} {c}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-emerald-500 tabular-nums">
                        {r.revenue.toFixed(0)}€
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {isLoading && (
          <p className="text-center text-sm text-muted-foreground animate-pulse">Φόρτωση δεδομένων…</p>
        )}
      </div>
    </div>
  );
}

// ============================================
// KPI Card
// ============================================
interface KpiCardProps {
  label: string;
  value: number;
  isCurrency?: boolean;
  subtitle?: string;
  change?: number;
  color: "emerald" | "amber" | "red" | "blue";
  icon: React.ReactNode;
  stagger: number;
  big?: boolean;
}

function KpiCard({ label, value, isCurrency, subtitle, change, color, icon, stagger, big }: KpiCardProps) {
  const colorMap = {
    emerald: { bg: "from-emerald-500/15 to-teal-600/5", border: "border-emerald-500/30 hover:border-emerald-500/60", text: "text-emerald-500", iconBg: "from-emerald-500 to-teal-600" },
    amber: { bg: "from-amber-500/15 to-amber-600/5", border: "border-amber-500/30 hover:border-amber-500/60", text: "text-amber-500", iconBg: "from-amber-500 to-amber-600" },
    red: { bg: "from-red-500/15 to-red-600/5", border: "border-red-500/30 hover:border-red-500/60", text: "text-red-500", iconBg: "from-red-500 to-red-600" },
    blue: { bg: "from-blue-500/15 to-blue-600/5", border: "border-blue-500/30 hover:border-blue-500/60", text: "text-blue-500", iconBg: "from-blue-500 to-blue-600" },
  };
  const c = colorMap[color];
  const isPositive = (change ?? 0) >= 0;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${c.border} bg-gradient-to-br ${c.bg} backdrop-blur-xl p-5 transition-all hover:scale-[1.02] hover:shadow-xl animate-fade-in`}
      style={{ animationDelay: `${stagger * 0.1}s`, animationFillMode: "backwards" }}
    >
      <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-10 blur-2xl ${c.iconBg}" />

      <div className="relative space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${c.iconBg} text-white shadow-lg`}>
            {icon}
          </div>
        </div>

        <div>
          <div className={`${big ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"} font-extrabold ${c.text} tabular-nums`}>
            <AnimatedCounter
              value={value}
              decimals={isCurrency ? 2 : 0}
              suffix={isCurrency ? "€" : ""}
            />
          </div>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>}
        </div>

        {change !== undefined && change !== 0 && (
          <div className={`flex items-center gap-1 text-[11px] font-medium ${isPositive ? "text-emerald-500" : "text-red-500"}`}>
            {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(change).toFixed(1)}% vs προηγ. μήνα
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Client Panel
// ============================================
interface ClientPanelProps {
  icon: string;
  title: string;
  subtitle: string;
  color: "blue" | "red";
  stats: Array<{ label: string; value: number; isCurrency?: boolean; primary?: boolean; accent?: boolean }>;
  alert?: string;
  onClick: () => void;
}

function ClientPanel({ icon, title, subtitle, color, stats, alert, onClick }: ClientPanelProps) {
  const c = color === "blue"
    ? { border: "border-blue-500/20 hover:border-blue-500/40", glow: "from-blue-500 to-blue-600", text: "text-blue-500", shadow: "hover:shadow-blue-500/10" }
    : { border: "border-red-500/20 hover:border-red-500/40", glow: "from-red-500 to-red-600", text: "text-red-500", shadow: "hover:shadow-red-500/10" };

  return (
    <div
      className={`rounded-2xl border ${c.border} bg-card/60 backdrop-blur-xl p-6 transition-all hover:shadow-xl ${c.shadow} animate-fade-in`}
      style={{ animationDelay: "0.6s", animationFillMode: "backwards" }}
    >
      <div className="flex items-start justify-between mb-5 gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${c.glow} text-white text-2xl shadow-lg`}>
            {icon}
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onClick} className={c.border}>
          <Eye className="h-3.5 w-3.5 mr-1" /> Άνοιγμα
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((s, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-xl bg-background/50 border border-border/40 ${s.primary ? "col-span-2" : ""}`}
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{s.label}</p>
            <div className={`${s.primary ? "text-2xl" : "text-lg"} font-extrabold mt-1 tabular-nums ${s.accent ? "text-emerald-500" : s.primary ? c.text : "text-foreground"}`}>
              <AnimatedCounter
                value={s.value}
                decimals={s.isCurrency ? 2 : 0}
                suffix={s.isCurrency ? "€" : ""}
              />
            </div>
          </div>
        ))}
      </div>

      {alert && (
        <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 text-xs font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {alert}
        </div>
      )}
    </div>
  );
}
