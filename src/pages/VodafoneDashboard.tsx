import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Ticket,
  Users,
  Banknote,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Zap,
  Award,
  Activity,
  ArrowUpRight,
  Eye,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import logoVodafone from "@/assets/logo-vodafone.png";
import {
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
} from "recharts";

const VF_RED = "#E60000";
const VF_RED_LIGHT = "#FF4444";

type ColorKey = "red" | "blue" | "amber" | "emerald" | "purple";

export default function VodafoneDashboard() {
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["vf_dashboard_stats_v2"],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();
      const today = now.toISOString().split("T")[0];
      const sb = supabase as any;

      const safeCount = async (q: any) => {
        try {
          const r = await q;
          return r.count || 0;
        } catch {
          return 0;
        }
      };
      const safeData = async (q: any) => {
        try {
          const r = await q;
          return r.data || [];
        } catch {
          return [];
        }
      };

      const [
        pending,
        completedMonth,
        todayCount,
        allTime,
        monthData,
        lastMonthData,
        subs,
        recent,
        pendingPayments,
      ] = await Promise.all([
        safeCount(
          sb.from("vodafone_tickets").select("*", { count: "exact", head: true }).eq("status", "pending"),
        ),
        safeCount(
          sb
            .from("vodafone_tickets")
            .select("*", { count: "exact", head: true })
            .eq("status", "completed")
            .gte("completed_at", startOfMonth),
        ),
        safeCount(
          sb.from("vodafone_tickets").select("*", { count: "exact", head: true }).gte("scheduled_at", today),
        ),
        safeCount(sb.from("vodafone_tickets").select("*", { count: "exact", head: true })),
        safeData(
          sb
            .from("vodafone_tickets")
            .select(
              "total_vodafone_eur, total_subcontractor_eur, completed_at, customer_type, region, subcontractor_id, services:vodafone_ticket_services(service_code, total_vodafone)",
            )
            .eq("status", "completed")
            .gte("completed_at", startOfMonth),
        ),
        safeData(
          sb
            .from("vodafone_tickets")
            .select("total_vodafone_eur, total_subcontractor_eur")
            .eq("status", "completed")
            .gte("completed_at", startOfLastMonth)
            .lte("completed_at", endOfLastMonth),
        ),
        safeData(
          sb.from("subcontractors").select("id, full_name, short_name, primary_region").eq("active", true),
        ),
        safeData(
          sb
            .from("vodafone_tickets")
            .select(
              "id, ticket_id, customer_type, region, status, total_vodafone_eur, completed_at, created_at, subcontractor:subcontractors(short_name, full_name)",
            )
            .order("created_at", { ascending: false })
            .limit(5),
        ),
        safeData(sb.from("subcontractor_payments").select("amount_eur").eq("status", "pending")),
      ]);

      const voda = monthData.reduce((s: number, r: any) => s + Number(r.total_vodafone_eur || 0), 0);
      const sub = monthData.reduce((s: number, r: any) => s + Number(r.total_subcontractor_eur || 0), 0);
      const lastVoda = lastMonthData.reduce((s: number, r: any) => s + Number(r.total_vodafone_eur || 0), 0);
      const lastSub = lastMonthData.reduce(
        (s: number, r: any) => s + Number(r.total_subcontractor_eur || 0),
        0,
      );
      const margin = voda - sub;
      const lastMargin = lastVoda - lastSub;

      // Daily revenue
      const byDay: Record<string, number> = {};
      monthData.forEach((r: any) => {
        if (r.completed_at) {
          const day = new Date(r.completed_at).toISOString().split("T")[0];
          byDay[day] = (byDay[day] || 0) + Number(r.total_vodafone_eur || 0);
        }
      });
      const dailyRevenue = Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({
          date: new Date(date).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit" }),
          value: Number(value.toFixed(2)),
        }));

      // Top services
      const serviceCounts: Record<string, { count: number; revenue: number }> = {};
      monthData.forEach((r: any) => {
        (r.services || []).forEach((s: any) => {
          if (!serviceCounts[s.service_code]) serviceCounts[s.service_code] = { count: 0, revenue: 0 };
          serviceCounts[s.service_code].count++;
          serviceCounts[s.service_code].revenue += Number(s.total_vodafone || 0);
        });
      });
      const topServices = Object.entries(serviceCounts)
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, 5)
        .map(([code, data]) => ({ code, ...data }));

      // Top subs
      const subCounts: Record<
        string,
        { name: string; count: number; revenue: number; sub_revenue: number }
      > = {};
      monthData.forEach((r: any) => {
        if (r.subcontractor_id) {
          const found = subs.find((s: any) => s.id === r.subcontractor_id);
          const name = found?.short_name || found?.full_name || "Unknown";
          if (!subCounts[r.subcontractor_id])
            subCounts[r.subcontractor_id] = { name, count: 0, revenue: 0, sub_revenue: 0 };
          subCounts[r.subcontractor_id].count++;
          subCounts[r.subcontractor_id].revenue += Number(r.total_vodafone_eur || 0);
          subCounts[r.subcontractor_id].sub_revenue += Number(r.total_subcontractor_eur || 0);
        }
      });
      const topSubs = Object.values(subCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Customer type breakdown
      const typeBreakdown: Record<string, number> = { CBU: 0, EBU: 0, SoHo: 0 };
      monthData.forEach((r: any) => {
        if (r.customer_type) typeBreakdown[r.customer_type] = (typeBreakdown[r.customer_type] || 0) + 1;
      });

      const pendingPaymentsTotal = pendingPayments.reduce(
        (s: number, p: any) => s + Number(p.amount_eur || 0),
        0,
      );

      return {
        pending,
        completed_month: completedMonth,
        today_count: todayCount,
        all_time: allTime,
        revenue_voda: voda,
        revenue_sub: sub,
        margin,
        margin_pct: voda > 0 ? (margin / voda) * 100 : 0,
        revenue_change: lastVoda > 0 ? ((voda - lastVoda) / lastVoda) * 100 : 0,
        margin_change: lastMargin > 0 ? ((margin - lastMargin) / lastMargin) * 100 : 0,
        subs_count: subs.length,
        daily_revenue: dailyRevenue,
        top_services: topServices,
        top_subs: topSubs,
        type_breakdown: typeBreakdown,
        recent,
        pending_payments_total: pendingPaymentsTotal,
      };
    },
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Vodafone Red Ambient Background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute inset-0 animate-ambient opacity-50"
          style={{
            background:
              "linear-gradient(120deg, hsl(0 84% 60% / 0.10), hsl(0 100% 50% / 0.06), hsl(350 100% 55% / 0.08), hsl(0 84% 60% / 0.10))",
          }}
        />
        <div className="absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-red-500/20 blur-[120px] animate-pulse-glow" />
        <div
          className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-rose-500/20 blur-[140px] animate-pulse-glow"
          style={{ animationDelay: "1.5s" }}
        />
      </div>

      {/* Header */}
      <header className="relative border-b border-border/40 backdrop-blur-xl bg-background/40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/client-selector")}
              className="rounded-xl shrink-0"
            >
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Πίνακες</span>
            </Button>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-red-700 text-2xl shadow-glow-red shrink-0">
              📱
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-foreground truncate">VODAFONE</h1>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground truncate">
                LLU + FTTH Φ3 Dashboard
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate("/vodafone/ticket/new")}
            className="gap-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-md hover:shadow-glow-red text-white shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Νέο Ticket</span>
          </Button>
        </div>
      </header>

      <main className="relative container mx-auto px-4 py-6 sm:py-8 space-y-8">
        {/* HERO KPI Section */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Έσοδα Μήνα"
            value={stats?.revenue_voda ?? 0}
            isCurrency
            subtitle="από Vodafone"
            change={stats?.revenue_change}
            color="red"
            icon={<Banknote className="h-5 w-5 text-white" />}
            stagger={1}
          />
          <KpiCard
            label="Καθαρό Margin"
            value={stats?.margin ?? 0}
            isCurrency
            subtitle={`${(stats?.margin_pct ?? 0).toFixed(1)}% margin`}
            change={stats?.margin_change}
            color={(stats?.margin ?? 0) >= 0 ? "emerald" : "red"}
            icon={<TrendingUp className="h-5 w-5 text-white" />}
            stagger={2}
          />
          <KpiCard
            label="Ολοκληρωμένα"
            value={stats?.completed_month ?? 0}
            subtitle="tickets μήνα"
            color="blue"
            icon={<CheckCircle2 className="h-5 w-5 text-white" />}
            stagger={3}
          />
          <KpiCard
            label="Σε εκκρεμότητα"
            value={stats?.pending ?? 0}
            subtitle={`${stats?.today_count ?? 0} σήμερα`}
            color="amber"
            icon={<AlertCircle className="h-5 w-5 text-white" />}
            stagger={4}
          />
        </section>

        {/* Quick Actions */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction
            icon={<Plus className="h-5 w-5" />}
            label="Νέο Ticket"
            sublabel="30 sec"
            onClick={() => navigate("/vodafone/ticket/new")}
            color="red"
            stagger={1}
          />
          <QuickAction
            icon={<Ticket className="h-5 w-5" />}
            label="Όλα τα Tickets"
            sublabel={`${stats?.all_time ?? 0} συνολικά`}
            onClick={() => navigate("/vodafone/tickets")}
            color="blue"
            stagger={2}
          />
          <QuickAction
            icon={<FileSpreadsheet className="h-5 w-5" />}
            label="Excel Import"
            sublabel="Μαζική εισαγωγή"
            onClick={() => navigate("/vodafone/import")}
            color="purple"
            stagger={3}
          />
          <QuickAction
            icon={<Banknote className="h-5 w-5" />}
            label="Πληρωμές"
            sublabel={`${stats?.subs_count ?? 0} υπεργολάβοι`}
            onClick={() => navigate("/subcontractor-payments")}
            color="emerald"
            stagger={4}
          />
        </section>

        {/* Charts Row */}
        <section className="grid lg:grid-cols-3 gap-5">
          {/* Daily Revenue Chart */}
          <div className="lg:col-span-2 rounded-3xl border border-red-500/20 glass-card p-6 animate-fade-in-up stagger-1">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <Activity className="h-5 w-5 text-red-500" />
                  Έσοδα ανά Ημέρα
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Τρέχων μήνας</p>
              </div>
              <Badge variant="outline" className="border-red-500/30 text-red-500">
                {stats?.daily_revenue?.length ?? 0} ημέρες
              </Badge>
            </div>

            {isLoading ? (
              <div className="h-[260px] shimmer rounded-2xl" />
            ) : !stats?.daily_revenue?.length ? (
              <div className="h-[260px] flex flex-col items-center justify-center text-center">
                <Sparkles className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">Δεν υπάρχουν έσοδα ακόμα</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={stats.daily_revenue} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vfGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={VF_RED} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={VF_RED} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v: any) => [`${Number(v).toFixed(2)}€`, "Έσοδα"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={VF_RED}
                    strokeWidth={2.5}
                    fill="url(#vfGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Customer Type Breakdown */}
          <div className="rounded-3xl border border-red-500/20 glass-card p-6 animate-fade-in-up stagger-2">
            <h3 className="flex items-center gap-2 text-lg font-bold text-foreground mb-5">
              <Users className="h-5 w-5 text-red-500" />
              Κατηγορίες
            </h3>

            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 shimmer rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { type: "CBU", label: "CBU (Νησιά)", color: VF_RED, icon: "🏝️" },
                  { type: "EBU", label: "EBU (Επιχειρήσεις)", color: VF_RED_LIGHT, icon: "🏢" },
                  { type: "SoHo", label: "SoHo", color: "#FF8C8C", icon: "🏪" },
                ].map((c) => {
                  const tb = stats?.type_breakdown ?? { CBU: 0, EBU: 0, SoHo: 0 };
                  const count = tb[c.type] || 0;
                  const total = (tb.CBU || 0) + (tb.EBU || 0) + (tb.SoHo || 0);
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={c.type}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <span>{c.icon}</span>
                          <span>{c.label}</span>
                        </div>
                        <span className="text-sm font-bold tabular-nums text-foreground">{count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${pct}%`, backgroundColor: c.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Top Services & Top Subs */}
        <section className="grid lg:grid-cols-2 gap-5">
          {/* Top Services */}
          <div className="rounded-3xl border border-red-500/20 glass-card p-6 animate-fade-in-up stagger-3">
            <h3 className="flex items-center gap-2 text-lg font-bold text-foreground mb-4">
              <Zap className="h-5 w-5 text-amber-500" />
              Top Services Μήνα
            </h3>
            {!stats?.top_services?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">Δεν υπάρχουν δεδομένα</p>
            ) : (
              <div className="space-y-2">
                {stats.top_services.map((s, idx) => (
                  <div
                    key={s.code}
                    className="flex items-center gap-3 p-3 rounded-xl bg-background/40 hover:bg-background/60 transition-colors"
                  >
                    <RankBadge rank={idx + 1} />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono font-semibold text-sm text-foreground truncate">{s.code}</p>
                      <p className="text-xs text-muted-foreground">{s.count}× εκτελέσεις</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-red-500 tabular-nums">
                        {s.revenue.toFixed(2)}€
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Subcontractors */}
          <div className="rounded-3xl border border-red-500/20 glass-card p-6 animate-fade-in-up stagger-4">
            <h3 className="flex items-center gap-2 text-lg font-bold text-foreground mb-4">
              <Award className="h-5 w-5 text-emerald-500" />
              Top Υπεργολάβοι
            </h3>
            {!stats?.top_subs?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Δεν υπάρχουν tickets ανατεθειμένα
              </p>
            ) : (
              <div className="space-y-2">
                {stats.top_subs.map((s: any, idx: number) => {
                  const margin = s.revenue - s.sub_revenue;
                  const marginPct = s.revenue > 0 ? (margin / s.revenue) * 100 : 0;
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-3 rounded-xl bg-background/40 hover:bg-background/60 transition-colors"
                    >
                      <RankBadge rank={idx + 1} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.count} tickets</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm text-foreground tabular-nums">
                          {s.revenue.toFixed(0)}€
                        </p>
                        <p
                          className={`text-[11px] font-semibold tabular-nums ${
                            marginPct >= 0 ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {marginPct >= 0 ? "+" : ""}
                          {marginPct.toFixed(1)}% margin
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Recent Activity */}
        <section className="rounded-3xl border border-red-500/20 glass-card p-6 animate-fade-in-up stagger-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Activity className="h-5 w-5 text-red-500" />
              Πρόσφατα Tickets
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/vodafone/tickets")}
              className="gap-1 text-red-500 hover:text-red-600 hover:bg-red-500/10"
            >
              <Eye className="h-4 w-4" />
              Όλα
            </Button>
          </div>

          {!stats?.recent?.length ? (
            <div className="text-center py-12">
              <Ticket className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground mb-4">Δεν υπάρχουν tickets ακόμα</p>
              <Button
                onClick={() => navigate("/vodafone/ticket/new")}
                className="gap-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
              >
                <Plus className="h-4 w-4" />
                Δημιούργησε το πρώτο
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.recent.map((t: any) => (
                <div
                  key={t.id}
                  onClick={() => navigate(`/vodafone/ticket/${t.id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-background/40 hover:bg-red-500/5 cursor-pointer transition-all hover:translate-x-1"
                >
                  <StatusDot status={t.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm text-foreground">
                        {t.ticket_id}
                      </span>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                        {t.customer_type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{t.region}</span>
                      {t.subcontractor && (
                        <span className="truncate">
                          • 👨‍🔧 {t.subcontractor.short_name || t.subcontractor.full_name}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm text-foreground tabular-nums">
                      {Number(t.total_vodafone_eur || 0).toFixed(0)}€
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString("el-GR", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
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
  color: ColorKey;
  icon: React.ReactNode;
  stagger: number;
}

function KpiCard({ label, value, isCurrency, subtitle, change, color, icon, stagger }: KpiCardProps) {
  const colorMap: Record<ColorKey, { bg: string; border: string; text: string; iconBg: string; glow: string }> = {
    red: {
      bg: "from-red-500/15 to-red-600/5",
      border: "border-red-500/30 hover:border-red-500/60",
      text: "text-red-500",
      iconBg: "from-red-500 to-red-600",
      glow: "shadow-glow-red",
    },
    blue: {
      bg: "from-blue-500/15 to-blue-600/5",
      border: "border-blue-500/30 hover:border-blue-500/60",
      text: "text-blue-500",
      iconBg: "from-blue-500 to-blue-600",
      glow: "shadow-glow-blue",
    },
    amber: {
      bg: "from-amber-500/15 to-amber-600/5",
      border: "border-amber-500/30 hover:border-amber-500/60",
      text: "text-amber-500",
      iconBg: "from-amber-500 to-amber-600",
      glow: "shadow-glow-amber",
    },
    emerald: {
      bg: "from-emerald-500/15 to-teal-600/5",
      border: "border-emerald-500/30 hover:border-emerald-500/60",
      text: "text-emerald-500",
      iconBg: "from-emerald-500 to-teal-600",
      glow: "shadow-glow-emerald",
    },
    purple: {
      bg: "from-purple-500/15 to-purple-600/5",
      border: "border-purple-500/30 hover:border-purple-500/60",
      text: "text-purple-500",
      iconBg: "from-purple-500 to-purple-600",
      glow: "shadow-glow-purple",
    },
  };
  const c = colorMap[color];
  const isPositive = (change ?? 0) >= 0;

  return (
    <div
      className={`relative animate-fade-in-up stagger-${stagger} rounded-3xl border-2 p-5 glass-card tilt-card overflow-hidden ${c.border}`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${c.bg}`} />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <p className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">{label}</p>
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${c.iconBg} ${c.glow}`}>
            {icon}
          </div>
        </div>

        <p className={`text-3xl sm:text-4xl font-bold ${c.text} leading-none`}>
          <AnimatedCounter value={Number(value) || 0} suffix={isCurrency ? "€" : ""} />
        </p>
        {subtitle && <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>}

        {change !== undefined && Math.abs(change) > 0.05 && (
          <div
            className={`mt-3 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${
              isPositive ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
            }`}
          >
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(change).toFixed(1)}% vs προηγ.
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Quick Action
// ============================================
interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  onClick: () => void;
  color: ColorKey;
  stagger: number;
}

function QuickAction({ icon, label, sublabel, onClick, color, stagger }: QuickActionProps) {
  const colorMap: Record<ColorKey, string> = {
    red: "from-red-500/10 to-red-600/5 border-red-500/30 hover:border-red-500/60 text-red-500",
    blue: "from-blue-500/10 to-blue-600/5 border-blue-500/30 hover:border-blue-500/60 text-blue-500",
    purple: "from-purple-500/10 to-purple-600/5 border-purple-500/30 hover:border-purple-500/60 text-purple-500",
    emerald:
      "from-emerald-500/10 to-teal-600/5 border-emerald-500/30 hover:border-emerald-500/60 text-emerald-500",
    amber: "from-amber-500/10 to-amber-600/5 border-amber-500/30 hover:border-amber-500/60 text-amber-500",
  };
  return (
    <button
      onClick={onClick}
      className={`group text-left animate-fade-in-up stagger-${stagger} rounded-2xl border-2 bg-gradient-to-br ${colorMap[color]} backdrop-blur-sm p-4 transition-all hover:-translate-y-1 hover:shadow-lg`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/60 group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{label}</p>
          <p className="text-[11px] text-muted-foreground truncate">{sublabel}</p>
        </div>
        <ArrowUpRight className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>
    </button>
  );
}

// ============================================
// Rank Badge (medals)
// ============================================
function RankBadge({ rank }: { rank: number }) {
  const styles: Record<number, string> = {
    1: "bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-md",
    2: "bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-md",
    3: "bg-gradient-to-br from-orange-400 to-orange-700 text-white shadow-md",
  };
  return (
    <div
      className={`flex h-9 w-9 items-center justify-center rounded-full font-bold text-sm shrink-0 ${
        styles[rank] || "bg-muted text-muted-foreground"
      }`}
    >
      {rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : `#${rank}`}
    </div>
  );
}

// ============================================
// Status Dot
// ============================================
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-amber-500",
    in_progress: "bg-blue-500",
    completed: "bg-emerald-500",
    cancelled: "bg-gray-500",
    failed: "bg-red-500",
  };
  const cls = colors[status] || "bg-muted-foreground";
  return (
    <div className="relative shrink-0">
      <div className={`h-2.5 w-2.5 rounded-full ${cls}`} />
      {status === "in_progress" && (
        <div className={`absolute inset-0 h-2.5 w-2.5 rounded-full ${cls} animate-ping opacity-75`} />
      )}
    </div>
  );
}
