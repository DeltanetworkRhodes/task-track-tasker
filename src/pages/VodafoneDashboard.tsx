import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ticket,
  Plus,
  Users,
  Receipt,
  TrendingUp,
  Banknote,
  FileSpreadsheet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function VodafoneDashboard() {
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["vf_dashboard_stats"],
    queryFn: async () => {
      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      ).toISOString();

      const [pendingRes, completedRes, revenueRes, subsRes] = await Promise.all(
        [
          supabase
            .from("vodafone_tickets")
            .select("*", { count: "exact", head: true })
            .eq("status", "pending"),
          supabase
            .from("vodafone_tickets")
            .select("*", { count: "exact", head: true })
            .eq("status", "completed")
            .gte("completed_at", startOfMonth),
          supabase
            .from("vodafone_tickets")
            .select("total_vodafone_eur, total_subcontractor_eur")
            .eq("status", "completed")
            .gte("completed_at", startOfMonth),
          supabase
            .from("subcontractors")
            .select("*", { count: "exact", head: true })
            .eq("active", true),
        ]
      );

      const voda = (revenueRes.data || []).reduce(
        (s: number, r: { total_vodafone_eur: number | null }) =>
          s + Number(r.total_vodafone_eur || 0),
        0
      );
      const sub = (revenueRes.data || []).reduce(
        (s: number, r: { total_subcontractor_eur: number | null }) =>
          s + Number(r.total_subcontractor_eur || 0),
        0
      );

      return {
        pending: pendingRes.count || 0,
        completed_month: completedRes.count || 0,
        revenue_voda: voda,
        revenue_sub: sub,
        margin: voda - sub,
        subs_count: subsRes.count || 0,
      };
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/client-selector")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Πίνακες
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              📱 Vodafone Dashboard
            </h1>
            <p className="text-xs text-muted-foreground">
              Διαχείριση LLU + FTTH Φ3
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Σε εκκρεμότητα</p>
            <p className="text-3xl font-bold text-foreground">
              {stats?.pending ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">tickets</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">
              Ολοκληρωμένα μήνα
            </p>
            <p className="text-3xl font-bold text-foreground">
              {stats?.completed_month ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">tickets</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Έσοδα μήνα</p>
            <p className="text-3xl font-bold text-foreground">
              {(stats?.revenue_voda ?? 0).toLocaleString("el-GR", {
                maximumFractionDigits: 0,
              })}
              €
            </p>
            <p className="text-xs text-muted-foreground">από Vodafone</p>
          </Card>
          <Card
            className={`p-4 ${
              (stats?.margin ?? 0) >= 0 ? "bg-green-500/5" : "bg-red-500/5"
            }`}
          >
            <p className="text-xs text-muted-foreground">Margin μήνα</p>
            <p
              className={`text-3xl font-bold ${
                (stats?.margin ?? 0) >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {(stats?.margin ?? 0) >= 0 ? "+" : ""}
              {(stats?.margin ?? 0).toLocaleString("el-GR", {
                maximumFractionDigits: 0,
              })}
              €
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <TrendingUp className="h-3 w-3" />
              καθαρό κέρδος
            </p>
          </Card>
        </div>

        {/* Quick actions */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Card
            className="p-6 cursor-pointer hover:border-red-500/40 transition-colors bg-gradient-to-br from-red-500/10 to-rose-500/5"
            onClick={() => navigate("/vodafone/ticket/new")}
          >
            <Plus className="h-8 w-8 text-red-500 mb-2" />
            <h3 className="text-base font-semibold">Νέο Ticket</h3>
            <p className="text-xs text-muted-foreground">
              Καταγραφή νέου ραντεβού
            </p>
          </Card>
          <Card
            className="p-6 cursor-pointer hover:border-foreground/30 transition-colors"
            onClick={() => navigate("/vodafone/tickets")}
          >
            <Ticket className="h-8 w-8 text-foreground mb-2" />
            <h3 className="text-base font-semibold">Όλα τα Tickets</h3>
            <p className="text-xs text-muted-foreground">Λίστα + φίλτρα</p>
          </Card>
          <Card
            className="p-6 cursor-pointer hover:border-foreground/30 transition-colors"
            onClick={() => navigate("/subcontractors")}
          >
            <Users className="h-8 w-8 text-foreground mb-2" />
            <h3 className="text-base font-semibold">Υπεργολάβοι</h3>
            <p className="text-xs text-muted-foreground">
              {stats?.subs_count ?? 0} ενεργοί
            </p>
          </Card>
          <Card
            className="p-6 cursor-pointer hover:border-amber-500/40 transition-colors bg-gradient-to-br from-amber-500/10 to-orange-500/5"
            onClick={() => navigate("/subcontractor-payments")}
          >
            <Banknote className="h-8 w-8 text-amber-600 mb-2" />
            <h3 className="text-base font-semibold">Πληρωμές</h3>
            <p className="text-xs text-muted-foreground">Μηνιαίες πληρωμές</p>
          </Card>
          <Card
            className="p-6 cursor-pointer hover:border-emerald-500/40 transition-colors bg-gradient-to-br from-emerald-500/10 to-teal-500/5"
            onClick={() => navigate("/vodafone/import")}
          >
            <FileSpreadsheet className="h-8 w-8 text-emerald-600 mb-2" />
            <h3 className="text-base font-semibold">Excel Import</h3>
            <p className="text-xs text-muted-foreground">Μαζική εισαγωγή</p>
          </Card>
        </div>

        {/* Secondary actions */}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => navigate("/vodafone/tickets")}
          >
            <Receipt className="h-4 w-4 mr-2" />
            Τιμολόγηση
          </Button>
        </div>
      </main>
    </div>
  );
}
