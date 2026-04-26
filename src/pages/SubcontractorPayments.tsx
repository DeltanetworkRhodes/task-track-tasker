import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Calendar, Banknote, FileText, CheckCircle2, Clock,
  Eye, Plus, Loader2, AlertCircle, Printer,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SummaryRow = {
  subcontractor_id: string;
  full_name: string;
  short_name: string | null;
  primary_region: string | null;
  tickets_count: number;
  total_amount: number;
  has_existing_payment: boolean;
  payment_status: string;
  payment_id: string | null;
};

type PaymentDialogState = {
  payment_id: string;
  subcontractor_id: string;
  full_name: string;
  total_amount: number;
} | null;

const MONTH_NAMES = [
  "Ιαν", "Φεβ", "Μαρ", "Απρ", "Μάι", "Ιουν",
  "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ",
];
const monthName = (m: number) => MONTH_NAMES[m - 1];

export default function SubcontractorPayments() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [statementSub, setStatementSub] = useState<SummaryRow | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<PaymentDialogState>(null);
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ["sub_payment_summary", selectedYear, selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "compute_subcontractor_monthly_summary",
        { p_year: selectedYear, p_month: selectedMonth }
      );
      if (error) throw error;
      return (data || []) as SummaryRow[];
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["payment_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subcontractor_payments")
        .select(
          "*, subcontractor:subcontractors(full_name, short_name, primary_region)"
        )
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const pending = (history as any[]).filter((p) => p.status === "pending");

  const { data: tickets = [] } = useQuery({
    queryKey: [
      "sub_tickets",
      statementSub?.subcontractor_id,
      selectedYear,
      selectedMonth,
    ],
    queryFn: async () => {
      if (!statementSub) return [];
      const startDate = new Date(
        selectedYear,
        selectedMonth - 1,
        1
      ).toISOString();
      const endDate = new Date(selectedYear, selectedMonth, 1).toISOString();

      const { data, error } = await supabase
        .from("vodafone_tickets")
        .select("*, services:vodafone_ticket_services(*)")
        .eq("subcontractor_id", statementSub.subcontractor_id)
        .eq("status", "completed")
        .gte("completed_at", startDate)
        .lt("completed_at", endDate)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!statementSub,
  });

  const getOrgId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Δεν είστε συνδεδεμένος");
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!profile?.organization_id) throw new Error("Δεν βρέθηκε organization");
    return profile.organization_id;
  };

  const createPaymentMutation = useMutation({
    mutationFn: async (sub: SummaryRow) => {
      const organization_id = await getOrgId();
      const { error } = await supabase.from("subcontractor_payments").insert({
        organization_id,
        subcontractor_id: sub.subcontractor_id,
        period_year: selectedYear,
        period_month: selectedMonth,
        tickets_count: sub.tickets_count,
        amount_eur: sub.total_amount,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Εγγραφή πληρωμής δημιουργήθηκε");
      qc.invalidateQueries({ queryKey: ["sub_payment_summary"] });
      qc.invalidateQueries({ queryKey: ["payment_history"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      if (!paymentDialog) return;
      const { error } = await supabase
        .from("subcontractor_payments")
        .update({
          status: "paid",
          payment_date: paymentDate,
          payment_method: paymentMethod,
        })
        .eq("id", paymentDialog.payment_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Πληρωμή καταχωρήθηκε");
      qc.invalidateQueries({ queryKey: ["sub_payment_summary"] });
      qc.invalidateQueries({ queryKey: ["payment_history"] });
      setPaymentDialog(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const massCreateMutation = useMutation({
    mutationFn: async () => {
      const organization_id = await getOrgId();
      const toCreate = summary.filter(
        (s) => !s.has_existing_payment && Number(s.total_amount) > 0
      );
      if (toCreate.length === 0) {
        throw new Error("Δεν υπάρχουν εκκρεμείς πληρωμές προς δημιουργία");
      }
      const { error } = await supabase.from("subcontractor_payments").insert(
        toCreate.map((s) => ({
          organization_id,
          subcontractor_id: s.subcontractor_id,
          period_year: selectedYear,
          period_month: selectedMonth,
          tickets_count: s.tickets_count,
          amount_eur: s.total_amount,
          status: "pending",
        }))
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Δημιουργήθηκαν όλες οι πληρωμές μήνα!");
      qc.invalidateQueries({ queryKey: ["sub_payment_summary"] });
      qc.invalidateQueries({ queryKey: ["payment_history"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const totalOwed = summary.reduce(
    (sum, s) =>
      !s.has_existing_payment ? sum + Number(s.total_amount || 0) : sum,
    0
  );
  const totalPending = pending.reduce(
    (sum, p: any) => sum + Number(p.amount_eur || 0),
    0
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
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
              <Banknote className="h-5 w-5" />
              Πληρωμές Υπεργολάβων
            </h1>
            <p className="text-xs text-muted-foreground">
              Διαχείριση μηνιαίων πληρωμών
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* KPI banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="p-4 bg-amber-500/5">
            <p className="text-xs text-muted-foreground">Νέες προς δημιουργία</p>
            <p className="text-3xl font-bold text-amber-600">
              {totalOwed.toLocaleString("el-GR", { maximumFractionDigits: 0 })}€
            </p>
            <p className="text-xs text-muted-foreground">
              {monthName(selectedMonth)} {selectedYear}
            </p>
          </Card>
          <Card className="p-4 bg-orange-500/5">
            <p className="text-xs text-muted-foreground">Εκκρεμείς πληρωμές</p>
            <p className="text-3xl font-bold text-orange-600">
              {totalPending.toLocaleString("el-GR", { maximumFractionDigits: 0 })}€
            </p>
            <p className="text-xs text-muted-foreground">
              {pending.length} εγγραφές
            </p>
          </Card>
          <Card className="p-4 bg-green-500/5">
            <p className="text-xs text-muted-foreground">Ιστορικό πληρωμών</p>
            <p className="text-3xl font-bold text-green-600">
              {(history as any[]).filter((h) => h.status === "paid").length}
            </p>
            <p className="text-xs text-muted-foreground">πληρωμένες</p>
          </Card>
        </div>

        <Tabs defaultValue="current">
          <TabsList>
            <TabsTrigger value="current">📅 Τρέχων Μήνας</TabsTrigger>
            <TabsTrigger value="pending">
              ⏳ Εκκρεμείς ({pending.length})
            </TabsTrigger>
            <TabsTrigger value="history">📜 Ιστορικό</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select
                value={String(selectedMonth)}
                onValueChange={(v) => setSelectedMonth(Number(v))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {monthName(i + 1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(selectedYear)}
                onValueChange={(v) => setSelectedYear(Number(v))}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex-1" />

              {summary.some(
                (s) => !s.has_existing_payment && Number(s.total_amount) > 0
              ) && (
                <Button
                  onClick={() => massCreateMutation.mutate()}
                  disabled={massCreateMutation.isPending}
                >
                  {massCreateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Δημιουργία πληρωμών μήνα
                </Button>
              )}
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : summary.length === 0 ? (
              <Card className="p-8 text-center">
                <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Δεν υπάρχουν υπεργολάβοι
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {summary.map((s) => {
                  const amount = Number(s.total_amount);
                  const hasPayment = s.has_existing_payment;
                  return (
                    <Card key={s.subcontractor_id} className="p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[200px]">
                          <p className="font-semibold">👨 {s.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            📍 {s.primary_region || "—"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {s.tickets_count} ολοκληρωμένα tickets
                          </p>
                          {hasPayment && (
                            <Badge variant="outline" className="mt-1">
                              {s.payment_status === "paid" && (
                                <>
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Πληρωμένο
                                </>
                              )}
                              {s.payment_status === "pending" && (
                                <>
                                  <Clock className="h-3 w-3 mr-1" />
                                  Εκκρεμές
                                </>
                              )}
                            </Badge>
                          )}
                        </div>

                        <div className="text-right">
                          <p className="text-2xl font-bold">
                            {amount.toLocaleString("el-GR", {
                              minimumFractionDigits: 2,
                            })}
                            €
                          </p>
                          <div className="flex flex-wrap gap-2 justify-end mt-2">
                            {amount > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setStatementSub(s)}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                Tickets
                              </Button>
                            )}
                            {!hasPayment && amount > 0 && (
                              <Button
                                size="sm"
                                onClick={() => createPaymentMutation.mutate(s)}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Δημιουργία
                              </Button>
                            )}
                            {hasPayment &&
                              s.payment_status === "pending" &&
                              s.payment_id && (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    setPaymentDialog({
                                      payment_id: s.payment_id!,
                                      subcontractor_id: s.subcontractor_id,
                                      full_name: s.full_name,
                                      total_amount: amount,
                                    })
                                  }
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Mark Paid
                                </Button>
                              )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pending" className="space-y-2">
            {pending.length === 0 ? (
              <Card className="p-8 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto text-green-600 mb-2" />
                <p className="font-semibold">Καμία εκκρεμής πληρωμή!</p>
                <p className="text-xs text-muted-foreground">
                  Είσαι ενημερωμένος με όλους τους υπεργολάβους.
                </p>
              </Card>
            ) : (
              pending.map((p: any) => (
                <Card key={p.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <p className="font-semibold">
                        👨 {p.subcontractor?.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        📍 {p.subcontractor?.primary_region || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        📅 {monthName(p.period_month)} {p.period_year} •{" "}
                        {p.tickets_count} tickets
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">
                        {Number(p.amount_eur).toLocaleString("el-GR", {
                          minimumFractionDigits: 2,
                        })}
                        €
                      </p>
                      <Button
                        size="sm"
                        className="mt-2"
                        onClick={() =>
                          setPaymentDialog({
                            payment_id: p.id,
                            subcontractor_id: p.subcontractor_id,
                            full_name: p.subcontractor?.full_name,
                            total_amount: p.amount_eur,
                          })
                        }
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Mark Paid
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-2">
            {history.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Δεν υπάρχει ιστορικό πληρωμών
                </p>
              </Card>
            ) : (
              (history as any[]).map((p) => (
                <Card key={p.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">
                          👨 {p.subcontractor?.full_name}
                        </p>
                        <Badge
                          variant={
                            p.status === "paid" ? "default" : "outline"
                          }
                        >
                          {p.status === "paid" && "✅ Πληρωμένο"}
                          {p.status === "pending" && "⏳ Εκκρεμές"}
                          {p.status === "partial" && "◐ Μερικό"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        📅 {monthName(p.period_month)} {p.period_year} •{" "}
                        {p.tickets_count} tickets
                      </p>
                      {p.payment_date && (
                        <p className="text-xs text-muted-foreground">
                          Πληρώθηκε{" "}
                          {new Date(p.payment_date).toLocaleDateString("el-GR")}
                          {p.payment_method && ` • ${p.payment_method}`}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold">
                        {Number(p.amount_eur).toLocaleString("el-GR", {
                          minimumFractionDigits: 2,
                        })}
                        €
                      </p>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Statement Dialog */}
      <Dialog
        open={!!statementSub}
        onOpenChange={(o) => !o && setStatementSub(null)}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Statement: {statementSub?.full_name} •{" "}
              {monthName(selectedMonth)} {selectedYear}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Card className="p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Tickets</p>
                  <p className="text-2xl font-bold">{tickets.length}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Σύνολο</p>
                  <p className="text-2xl font-bold">
                    {(tickets as any[])
                      .reduce(
                        (s, t) => s + Number(t.total_subcontractor_eur || 0),
                        0
                      )
                      .toLocaleString("el-GR", { minimumFractionDigits: 2 })}
                    €
                  </p>
                </div>
              </div>
            </Card>

            <div className="space-y-2">
              {(tickets as any[]).map((t) => (
                <Card key={t.id} className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <p className="font-mono text-sm font-semibold">
                        {t.ticket_id}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.customer_address || "—"} •{" "}
                        {t.completed_at &&
                          new Date(t.completed_at).toLocaleDateString("el-GR")}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(t.services || []).map((s: any, idx: number) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-[10px]"
                          >
                            {s.service_code} ×{s.quantity}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {Number(t.total_subcontractor_eur || 0).toFixed(2)}€
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
              {tickets.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">
                  Δεν υπάρχουν tickets
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Print/Save PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Paid Dialog */}
      <Dialog
        open={!!paymentDialog}
        onOpenChange={(o) => !o && setPaymentDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Καταχώρηση Πληρωμής</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Υπεργολάβος</Label>
              <p className="font-semibold">{paymentDialog?.full_name}</p>
            </div>
            <div>
              <Label className="text-xs">Ποσό</Label>
              <p className="text-2xl font-bold">
                {Number(paymentDialog?.total_amount || 0).toLocaleString(
                  "el-GR",
                  { minimumFractionDigits: 2 }
                )}
                €
              </p>
            </div>
            <div>
              <Label className="text-xs">Ημερομηνία πληρωμής</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Μέθοδος πληρωμής</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">
                    🏦 Τραπεζικό έμβασμα
                  </SelectItem>
                  <SelectItem value="cash">💵 Μετρητά</SelectItem>
                  <SelectItem value="check">📄 Επιταγή</SelectItem>
                  <SelectItem value="other">Άλλο</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(null)}>
              Ακύρωση
            </Button>
            <Button
              onClick={() => markPaidMutation.mutate()}
              disabled={markPaidMutation.isPending}
            >
              {markPaidMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Καταχώρηση
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
