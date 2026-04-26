import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, AlertCircle, Briefcase, LogOut, Users, Settings } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";

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

  const { data: oteStats } = useQuery({
    queryKey: ["ote_card_stats"],
    queryFn: async () => {
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
          .eq("status", "completed"),
      ]);

      return {
        active: activeRes.count || 0,
        stuck: stuckRes.count || 0,
        completed: completedRes.count || 0,
      };
    },
  });

  if (roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Φόρτωση...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              🌀 DELTANETWORK
            </h1>
            <p className="text-xs text-muted-foreground">FTTx Operations Platform</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-foreground">{user?.email}</p>
              <p className="text-xs text-muted-foreground">
                {new Date().toLocaleDateString("el-GR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              <LogOut className="h-4 w-4 mr-2" />
              Έξοδος
            </Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground">Καλημέρα! 👋</h2>
          <p className="text-muted-foreground mt-1">
            Επίλεξε τον πίνακα ελέγχου που θέλεις να δουλέψεις
          </p>
        </div>

        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="text-lg font-semibold text-foreground">Πίνακες Ελέγχου</h3>
          <span className="text-xs text-muted-foreground">Διαχείριση ανά Client</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ClientCard
            icon="📡"
            title="OTE / COSMOTE"
            subtitle="FTTH Β' Φάση + Αυτοψίες"
            colorClass="from-blue-500/20 to-cyan-500/10 border-blue-500/30"
            stats={[
              { label: "Ενεργά SR", value: oteStats?.active ?? "—" },
              { label: "Ολοκληρωμένα", value: oteStats?.completed ?? "—" },
            ]}
            alert={
              oteStats && oteStats.stuck > 0
                ? `${oteStats.stuck} stuck SRs (>14 ημέρες)`
                : undefined
            }
            onClick={() => navigate("/ote/dashboard")}
          />

          <ClientCard
            icon="📱"
            title="Vodafone"
            subtitle="LLU + FTTH Φ3"
            colorClass="from-red-500/20 to-rose-500/10 border-red-500/30"
            stats={[
              { label: "Ενεργά SR", value: "—" },
              { label: "Σε εκκρεμότητα", value: "—" },
            ]}
            comingSoon
            onClick={() => navigate("/vodafone/dashboard")}
          />

          <ClientCard
            icon="📺"
            title="Nova"
            subtitle="Multi-service"
            colorClass="from-purple-500/20 to-fuchsia-500/10 border-purple-500/30"
            stats={[
              { label: "Ενεργά SR", value: "—" },
              { label: "Σε εκκρεμότητα", value: "—" },
            ]}
            comingSoon
            onClick={() => navigate("/nova/dashboard")}
          />

          <ClientCard
            icon="⚡"
            title="ΔΕΗ"
            subtitle="Δίκτυο Διανομής"
            colorClass="from-yellow-500/20 to-amber-500/10 border-yellow-500/30"
            stats={[
              { label: "Ενεργά SR", value: "—" },
              { label: "Σε εκκρεμότητα", value: "—" },
            ]}
            comingSoon
            onClick={() => navigate("/deh/dashboard")}
          />

          <ClientCard
            icon="💼"
            title="Συνολική Εικόνα"
            subtitle="Cashflow & KPIs"
            colorClass="from-emerald-500/20 to-green-500/10 border-emerald-500/30"
            stats={[
              { label: "Clients", value: "4" },
              { label: "Status", value: "Soon" },
            ]}
            isMaster
            onClick={() => navigate("/master/dashboard")}
          />
        </div>

        {/* Quick actions */}
        <div className="mt-10 flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => navigate("/users")}>
            <Users className="h-4 w-4 mr-2" />
            Χρήστες
          </Button>
          <Button variant="outline" onClick={() => navigate("/settings")}>
            <Settings className="h-4 w-4 mr-2" />
            Ρυθμίσεις
          </Button>
        </div>
      </main>
    </div>
  );
}

interface ClientCardProps {
  icon: string;
  title: string;
  subtitle: string;
  colorClass: string;
  stats: Array<{ label: string; value: string | number }>;
  alert?: string;
  comingSoon?: boolean;
  isMaster?: boolean;
  onClick: () => void;
}

function ClientCard({
  icon,
  title,
  subtitle,
  colorClass,
  stats,
  alert,
  comingSoon,
  isMaster,
  onClick,
}: ClientCardProps) {
  return (
    <Card
      onClick={onClick}
      className={`relative cursor-pointer p-6 bg-gradient-to-br ${colorClass} hover:scale-[1.02] transition-transform border-2`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-4xl mb-2">{icon}</div>
          <h4 className="text-lg font-bold text-foreground">{title}</h4>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {!comingSoon && <ArrowRight className="h-5 w-5 text-muted-foreground" />}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {stats.map((stat, idx) => (
          <div key={idx} className="rounded-md bg-background/50 px-3 py-2">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-lg font-semibold text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      {alert && (
        <Badge variant="destructive" className="mt-4 gap-1">
          <AlertCircle className="h-3 w-3" />
          {alert}
        </Badge>
      )}

      {comingSoon && (
        <Badge variant="secondary" className="mt-4">
          🔜 Σύντομα διαθέσιμο
        </Badge>
      )}

      {isMaster && (
        <Badge className="mt-4 gap-1 bg-emerald-600 hover:bg-emerald-700">
          <Briefcase className="h-3 w-3" />
          All Clients
        </Badge>
      )}
    </Card>
  );
}
