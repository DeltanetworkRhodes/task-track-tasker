import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  AlertCircle,
  Briefcase,
  Calendar,
  Sparkles,
  TrendingUp,
  LogOut,
  Settings,
  Users,
  Activity,
  CheckCircle2,
  Wallet,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import logoOte from "@/assets/logo-ote.png";
import logoVodafone from "@/assets/logo-vodafone.png";
import logoNova from "@/assets/logo-nova.png";
import logoDeh from "@/assets/logo-deh.png";
import logoDelta from "@/assets/delta-logo-icon.png";

type ColorKey = "blue" | "red" | "purple" | "amber" | "emerald";

export default function ClientSelector() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: role, isLoading: roleLoading } = useUserRole();

  useEffect(() => {
    if (!roleLoading && role === "technician") {
      navigate("/technician", { replace: true });
    }
    if (!roleLoading && role === "super_admin") {
      navigate("/super-admin", { replace: true });
    }
  }, [role, roleLoading, navigate]);

  // OTE stats
  const { data: oteStats } = useQuery({
    queryKey: ["ote_card_stats"],
    queryFn: async () => {
      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString();
      const stuckThreshold = new Date(Date.now() - 14 * 86400000).toISOString();
      const [activeRes, stuckRes, completedRes] = await Promise.all([
        supabase
          .from("assignments")
          .select("*", { count: "exact", head: true })
          .neq("status", "completed"),
        supabase
          .from("assignments")
          .select("*", { count: "exact", head: true })
          .eq("status", "construction")
          .lt("updated_at", stuckThreshold),
        supabase
          .from("assignments")
          .select("*", { count: "exact", head: true })
          .eq("status", "completed")
          .gte("updated_at", startOfMonth),
      ]);
      return {
        active: activeRes.count || 0,
        stuck: stuckRes.count || 0,
        completed: completedRes.count || 0,
      };
    },
  });

  // Vodafone stats
  const { data: vfStats } = useQuery({
    queryKey: ["vf_card_stats"],
    queryFn: async () => {
      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString();
      const today = new Date().toISOString().split("T")[0];
      try {
        const [monthRes, todayRes, revenueRes] = await Promise.all([
          (supabase as any)
            .from("vodafone_tickets")
            .select("*", { count: "exact", head: true })
            .eq("status", "completed")
            .gte("completed_at", startOfMonth),
          (supabase as any)
            .from("vodafone_tickets")
            .select("*", { count: "exact", head: true })
            .gte("scheduled_at", today),
          (supabase as any)
            .from("vodafone_tickets")
            .select("total_vodafone_eur")
            .eq("status", "completed")
            .gte("completed_at", startOfMonth),
        ]);
        const revenue = (revenueRes.data || []).reduce(
          (sum: number, r: any) => sum + Number(r.total_vodafone_eur || 0),
          0,
        );
        return {
          month_count: monthRes.count || 0,
          today_count: todayRes.count || 0,
          revenue,
        };
      } catch {
        return { month_count: 0, today_count: 0, revenue: 0 };
      }
    },
  });

  if (roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Φόρτωση...</p>
        </div>
      </div>
    );
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Καλημέρα";
    if (h < 17) return "Καλό μεσημέρι";
    if (h < 21) return "Καλό απόγευμα";
    return "Καλό βράδυ";
  })();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient Background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute inset-0 animate-ambient opacity-60"
          style={{
            background:
              "linear-gradient(120deg, hsl(185 70% 42% / 0.10), hsl(160 55% 45% / 0.08), hsl(217 91% 60% / 0.10), hsl(280 91% 65% / 0.08))",
          }}
        />
        <div className="absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-primary/20 blur-[120px] animate-pulse-glow" />
        <div
          className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-accent/20 blur-[140px] animate-pulse-glow"
          style={{ animationDelay: "1.5s" }}
        />
      </div>

      {/* Header */}
      <header className="relative border-b border-border/40 backdrop-blur-xl bg-background/40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-glow-emerald p-1.5">
              <img src={logoDelta} alt="DeltaNetwork" className="h-full w-full object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                DELTANETWORK
              </h1>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                FTTx Platform
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-foreground">{user?.email}</p>
              <p className="text-xs text-muted-foreground">
                {new Date().toLocaleDateString("el-GR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/settings")}
              className="rounded-xl"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut()}
              className="rounded-xl"
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Έξοδος</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative container mx-auto px-4 py-8 sm:py-12">
        {/* Greeting */}
        <div className="mb-8 sm:mb-12 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full glass-card text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            {new Date().toLocaleDateString("el-GR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            {greeting} <span className="inline-block animate-float">👋</span>
          </h2>
          <p className="mt-2 text-base text-muted-foreground">
            Επίλεξε τον πίνακα ελέγχου για να ξεκινήσεις
          </p>
        </div>

        {/* Quick Stats Banner */}
        <div className="mb-10 grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in-up stagger-1">
          <StatPill
            label="Ενεργά SR"
            value={oteStats?.active ?? 0}
            color="blue"
            icon={<Activity className="h-3.5 w-3.5" />}
          />
          <StatPill
            label="Ολοκληρωμένα μήνα"
            value={oteStats?.completed ?? 0}
            color="emerald"
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          />
          <StatPill
            label="Vodafone Tickets"
            value={vfStats?.month_count ?? 0}
            color="red"
            icon={<Zap className="h-3.5 w-3.5" />}
          />
          <StatPill
            label="Έσοδα Vodafone"
            value={vfStats?.revenue ?? 0}
            color="amber"
            icon={<Wallet className="h-3.5 w-3.5" />}
            isCurrency
          />
        </div>

        {/* Section Title */}
        <div className="mb-6 flex items-center gap-3 animate-fade-in-up stagger-2">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Πίνακες Ελέγχου
          </h3>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>

        {/* Premium Cards Grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <PremiumCard
            logo={logoOte}
            title="OTE / COSMOTE"
            subtitle="FTTH Β' Φάση + Αυτοψίες"
            color="blue"
            stats={[
              { label: "Ενεργά", value: oteStats?.active ?? 0 },
              { label: "Ολοκληρωμένα", value: oteStats?.completed ?? 0 },
            ]}
            alert={
              oteStats && oteStats.stuck > 0
                ? `${oteStats.stuck} stuck SRs (>14 ημέρες)`
                : undefined
            }
            onClick={() => navigate("/ote/dashboard")}
            stagger={1}
          />

          <PremiumCard
            logo={logoVodafone}
            title="Vodafone"
            subtitle="LLU + FTTH Φ3 + Tickets"
            color="red"
            stats={[
              { label: "Tickets μήνα", value: vfStats?.month_count ?? 0 },
              {
                label: "Έσοδα",
                value: vfStats?.revenue ?? 0,
                isCurrency: true,
              },
            ]}
            onClick={() => navigate("/vodafone/dashboard")}
            stagger={2}
          />

          <PremiumCard
            logo={logoNova}
            title="Nova"
            subtitle="Multi-service"
            color="purple"
            comingSoon
            onClick={() => navigate("/nova/dashboard")}
            stagger={3}
          />

          <PremiumCard
            logo={logoDeh}
            title="ΔΕΗ"
            subtitle="Δίκτυο Διανομής"
            color="amber"
            comingSoon
            onClick={() => navigate("/deh/dashboard")}
            stagger={4}
          />

          <PremiumCard
            fallbackIcon={<Briefcase className="h-7 w-7 text-emerald-500" />}
            title="Συνολική Εικόνα"
            subtitle="Cashflow & KPIs"
            color="emerald"
            isMaster
            onClick={() => navigate("/master/dashboard")}
            stagger={5}
          />
        </div>

        {/* Quick Links */}
        <div className="mt-12 flex flex-wrap gap-3 animate-fade-in-up stagger-6">
          <Button
            variant="outline"
            onClick={() => navigate("/subcontractors")}
            className="gap-2 rounded-xl hover:bg-primary/10 hover:border-primary/40 transition-all"
          >
            <Users className="h-4 w-4" />
            Υπεργολάβοι
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/users")}
            className="gap-2 rounded-xl hover:bg-primary/10 hover:border-primary/40 transition-all"
          >
            <Briefcase className="h-4 w-4" />
            Χρήστες
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/settings")}
            className="gap-2 rounded-xl hover:bg-primary/10 hover:border-primary/40 transition-all"
          >
            <Settings className="h-4 w-4" />
            Ρυθμίσεις
          </Button>
        </div>
      </main>
    </div>
  );
}

// ============================================
// PREMIUM CARD COMPONENT
// ============================================
interface PremiumCardProps {
  logo?: string;
  fallbackIcon?: React.ReactNode;
  title: string;
  subtitle: string;
  color: ColorKey;
  stats?: Array<{ label: string; value: number; isCurrency?: boolean }>;
  alert?: string;
  comingSoon?: boolean;
  isMaster?: boolean;
  onClick: () => void;
  stagger: number;
}

function PremiumCard({
  logo,
  fallbackIcon,
  title,
  subtitle,
  color,
  stats,
  alert,
  comingSoon,
  isMaster,
  onClick,
  stagger,
}: PremiumCardProps) {
  const colorMap: Record<
    ColorKey,
    {
      gradient: string;
      border: string;
      iconGlow: string;
      iconBg: string;
      accent: string;
    }
  > = {
    blue: {
      gradient: "from-blue-500/15 via-blue-500/5 to-transparent",
      border: "border-blue-500/30 group-hover:border-blue-500/60",
      iconGlow: "shadow-glow-blue",
      iconBg: "from-blue-500 to-blue-600",
      accent: "text-blue-500",
    },
    red: {
      gradient: "from-red-500/15 via-red-500/5 to-transparent",
      border: "border-red-500/30 group-hover:border-red-500/60",
      iconGlow: "shadow-glow-red",
      iconBg: "from-red-500 to-red-600",
      accent: "text-red-500",
    },
    purple: {
      gradient: "from-purple-500/15 via-purple-500/5 to-transparent",
      border: "border-purple-500/30 group-hover:border-purple-500/60",
      iconGlow: "shadow-glow-purple",
      iconBg: "from-purple-500 to-purple-600",
      accent: "text-purple-500",
    },
    amber: {
      gradient: "from-amber-500/15 via-amber-500/5 to-transparent",
      border: "border-amber-500/30 group-hover:border-amber-500/60",
      iconGlow: "shadow-glow-amber",
      iconBg: "from-amber-500 to-amber-600",
      accent: "text-amber-500",
    },
    emerald: {
      gradient: "from-emerald-500/15 via-teal-500/10 to-transparent",
      border: "border-emerald-500/30 group-hover:border-emerald-500/60",
      iconGlow: "shadow-glow-emerald",
      iconBg: "from-emerald-500 to-teal-600",
      accent: "text-emerald-500",
    },
  };

  const c = colorMap[color];

  return (
    <button
      onClick={onClick}
      disabled={comingSoon}
      className={`group relative text-left animate-fade-in-up stagger-${stagger} ${
        comingSoon ? "cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      {/* Ambient glow behind the card */}
      {!comingSoon && (
        <div
          className={`absolute -inset-1 rounded-3xl bg-gradient-to-br ${c.gradient} opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500`}
        />
      )}

      {/* Card body */}
      <div
        className={`relative h-full rounded-3xl border-2 p-6 glass-card overflow-hidden transition-all duration-500 ${c.border} ${
          !comingSoon ? "tilt-card" : "opacity-80"
        }`}
      >
        {/* Background gradient layer */}
        <div
          className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${c.gradient} opacity-60`}
        />

        {/* Shimmer line on hover */}
        {!comingSoon && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        )}

        <div className="relative">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${c.iconBg} text-3xl shadow-lg ${
                  !comingSoon ? c.iconGlow : ""
                } ${!comingSoon ? "group-hover:animate-float" : ""}`}
              >
                <span className="drop-shadow-sm">{icon}</span>
              </div>
              <div>
                <h4 className="text-lg font-bold text-foreground leading-tight">
                  {title}
                </h4>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {subtitle}
                </p>
              </div>
            </div>
            {!comingSoon && (
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full bg-background/40 ${c.accent} group-hover:translate-x-1 transition-transform`}
              >
                <ArrowRight className="h-4 w-4" />
              </div>
            )}
          </div>

          {/* Stats */}
          {stats && stats.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {stats.map((stat, idx) => (
                <div
                  key={idx}
                  className="rounded-xl bg-background/50 backdrop-blur-sm px-3 py-2.5 border border-border/30"
                >
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">
                    {stat.label}
                  </p>
                  <p className={`text-xl font-bold ${c.accent}`}>
                    <AnimatedCounter
                      value={Number(stat.value) || 0}
                      decimals={stat.isCurrency ? 0 : 0}
                      suffix={stat.isCurrency ? "€" : ""}
                    />
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Alert */}
          {alert && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {alert}
            </div>
          )}

          {/* Coming soon */}
          {comingSoon && (
            <div className="mt-4 inline-flex items-center px-3 py-1.5 rounded-full bg-muted/50 text-muted-foreground text-xs font-medium">
              🔜 Σύντομα διαθέσιμο
            </div>
          )}

          {/* Master badge */}
          {isMaster && (
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-xs font-semibold">
              <TrendingUp className="h-3.5 w-3.5" />
              All Clients
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ============================================
// STAT PILL COMPONENT
// ============================================
interface StatPillProps {
  label: string;
  value: number;
  color: ColorKey;
  icon?: React.ReactNode;
  isCurrency?: boolean;
}

function StatPill({ label, value, color, icon, isCurrency }: StatPillProps) {
  const colorMap: Record<ColorKey, string> = {
    blue: "from-blue-500/10 to-blue-600/5 border-blue-500/20 text-blue-600 dark:text-blue-400",
    red: "from-red-500/10 to-red-600/5 border-red-500/20 text-red-600 dark:text-red-400",
    purple:
      "from-purple-500/10 to-purple-600/5 border-purple-500/20 text-purple-600 dark:text-purple-400",
    amber:
      "from-amber-500/10 to-amber-600/5 border-amber-500/20 text-amber-600 dark:text-amber-400",
    emerald:
      "from-emerald-500/10 to-teal-600/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  };

  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br ${colorMap[color]} backdrop-blur-sm p-4 transition-all hover:scale-[1.02]`}
    >
      <div className="flex items-center gap-1.5 mb-1.5 opacity-80">
        {icon}
        <p className="text-[11px] uppercase tracking-wider font-medium">
          {label}
        </p>
      </div>
      <p className="text-2xl font-bold">
        <AnimatedCounter value={value} suffix={isCurrency ? "€" : ""} />
      </p>
    </div>
  );
}
