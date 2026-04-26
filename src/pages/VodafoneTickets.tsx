import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  ArrowLeft,
  Ticket,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

type StatusKey =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "failed";

const STATUS_LABELS: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: typeof Clock;
  }
> = {
  pending: { label: "Αναμονή", variant: "secondary", icon: Clock },
  in_progress: { label: "Σε εξέλιξη", variant: "default", icon: Clock },
  completed: { label: "Ολοκληρωμένο", variant: "default", icon: CheckCircle2 },
  cancelled: { label: "Ακυρωμένο", variant: "secondary", icon: XCircle },
  failed: { label: "Απέτυχε", variant: "destructive", icon: AlertCircle },
};

export default function VodafoneTickets() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [subFilter, setSubFilter] = useState<string>("all");

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["vodafone_tickets", statusFilter, subFilter],
    queryFn: async () => {
      let q = supabase
        .from("vodafone_tickets")
        .select(
          "*, subcontractor:subcontractors(full_name, short_name)"
        )
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (subFilter !== "all") q = q.eq("subcontractor_id", subFilter);

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: subs = [] } = useQuery({
    queryKey: ["subcontractors_list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subcontractors")
        .select("id, full_name, short_name")
        .eq("active", true)
        .order("full_name");
      return data || [];
    },
  });

  const { data: monthStats } = useQuery({
    queryKey: ["vf_month_stats"],
    queryFn: async () => {
      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      ).toISOString();

      const [totalRes, completedRes, revenueRes] = await Promise.all([
        supabase
          .from("vodafone_tickets")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startOfMonth),
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
      ]);

      const totalVoda = (revenueRes.data || []).reduce(
        (s: number, r: { total_vodafone_eur: number | null }) =>
          s + Number(r.total_vodafone_eur || 0),
        0
      );
      const totalSub = (revenueRes.data || []).reduce(
        (s: number, r: { total_subcontractor_eur: number | null }) =>
          s + Number(r.total_subcontractor_eur || 0),
        0
      );

      return {
        total: totalRes.count || 0,
        completed: completedRes.count || 0,
        revenue_voda: totalVoda,
        revenue_sub: totalSub,
        margin: totalVoda - totalSub,
      };
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/vodafone/dashboard")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Πίσω
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Ticket className="h-5 w-5 text-red-500" />
                Vodafone Tickets
              </h1>
              <p className="text-xs text-muted-foreground">
                {tickets.length} tickets
                {statusFilter !== "all" &&
                  ` • ${STATUS_LABELS[statusFilter]?.label}`}
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate("/vodafone/ticket/new")}
            className="gap-2 bg-red-500 hover:bg-red-600 text-white"
          >
            <Plus className="h-4 w-4" />
            Νέο Ticket
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Tickets μήνα</p>
            <p className="text-2xl font-bold text-foreground">
              {monthStats?.total ?? "..."}
            </p>
            <p className="text-xs text-muted-foreground">
              {monthStats?.completed ?? 0} ολοκληρωμένα
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Έσοδα Vodafone</p>
            <p className="text-2xl font-bold text-foreground">
              {(monthStats?.revenue_voda ?? 0).toLocaleString("el-GR", {
                maximumFractionDigits: 0,
              })}
              €
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Πληρωμές υπεργ.</p>
            <p className="text-2xl font-bold text-orange-600">
              {(monthStats?.revenue_sub ?? 0).toLocaleString("el-GR", {
                maximumFractionDigits: 0,
              })}
              €
            </p>
          </Card>
          <Card
            className={`p-4 ${
              (monthStats?.margin ?? 0) >= 0
                ? "bg-green-500/5"
                : "bg-red-500/5"
            }`}
          >
            <p className="text-xs text-muted-foreground">Margin</p>
            <p
              className={`text-2xl font-bold ${
                (monthStats?.margin ?? 0) >= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {(monthStats?.margin ?? 0) >= 0 ? "+" : ""}
              {(monthStats?.margin ?? 0).toLocaleString("el-GR", {
                maximumFractionDigits: 0,
              })}
              €
            </p>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Όλα τα status</SelectItem>
              <SelectItem value="pending">⏳ Αναμονή</SelectItem>
              <SelectItem value="in_progress">🔄 Σε εξέλιξη</SelectItem>
              <SelectItem value="completed">✅ Ολοκληρωμένα</SelectItem>
              <SelectItem value="cancelled">❌ Ακυρωμένα</SelectItem>
              <SelectItem value="failed">⚠️ Απέτυχαν</SelectItem>
            </SelectContent>
          </Select>

          <Select value={subFilter} onValueChange={setSubFilter}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Υπεργολάβος" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Όλοι οι υπεργολάβοι</SelectItem>
              {subs.map((s: { id: string; full_name: string; short_name: string | null }) => (
                <SelectItem key={s.id} value={s.id}>
                  👨 {s.short_name || s.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tickets List */}
        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">
            Φόρτωση...
          </div>
        ) : tickets.length === 0 ? (
          <Card className="p-10 text-center">
            <Ticket className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold">Δεν υπάρχουν tickets</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Δημιούργησε το πρώτο Vodafone ticket
            </p>
            <Button
              onClick={() => navigate("/vodafone/ticket/new")}
              className="gap-2 bg-red-500 hover:bg-red-600 text-white"
            >
              <Plus className="h-4 w-4" />
              Νέο Ticket
            </Button>
          </Card>
        ) : (
          <div className="space-y-2">
            {tickets.map((t: any) => {
              const status =
                STATUS_LABELS[t.status as StatusKey] || STATUS_LABELS.pending;
              const StatusIcon = status.icon;
              const margin = Number(t.margin_eur ?? 0);

              return (
                <Card
                  key={t.id}
                  className="p-4 cursor-pointer hover:border-red-500/30 transition-colors"
                  onClick={() => navigate(`/vodafone/ticket/${t.id}`)}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={status.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                        <span className="font-mono text-sm font-semibold">
                          {t.ticket_id}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {t.customer_type}/
                          {t.zone === "ISLANDS" ? "Νησιά" : "Λοιπή Ελ."}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        📍 {t.customer_address || "-"} • {t.region}
                      </p>
                      {t.subcontractor && (
                        <p className="text-xs text-muted-foreground mt-1">
                          👨{" "}
                          {t.subcontractor.short_name ||
                            t.subcontractor.full_name}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-right">
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">
                          Vodafone
                        </p>
                        <p className="text-sm font-semibold tabular-nums">
                          {Number(t.total_vodafone_eur).toFixed(2)}€
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">
                          Υπεργολ.
                        </p>
                        <p className="text-sm font-semibold tabular-nums text-orange-600">
                          {Number(t.total_subcontractor_eur).toFixed(2)}€
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">
                          Margin
                        </p>
                        <p
                          className={`text-sm font-bold tabular-nums ${
                            margin >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {margin >= 0 ? "+" : ""}
                          {margin.toFixed(2)}€
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
