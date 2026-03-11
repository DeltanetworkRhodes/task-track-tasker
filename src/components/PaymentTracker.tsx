import { useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";
import { Euro, Clock, CheckCircle, XCircle, TrendingUp, Upload, MoreVertical, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const GREEK_MONTHS: Record<number, string> = {
  0: "Ιαν", 1: "Φεβ", 2: "Μαρ", 3: "Απρ", 4: "Μαϊ", 5: "Ιουν",
  6: "Ιουλ", 7: "Αυγ", 8: "Σεπ", 9: "Οκτ", 10: "Νοε", 11: "Δεκ",
};

const fmtEur = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR" });

const PaymentTracker = () => {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [paidDialog, setPaidDialog] = useState<any>(null);
  const [paidDate, setPaidDate] = useState("");
  const [rejectDialog, setRejectDialog] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [importDialog, setImportDialog] = useState(false);
  const [importResults, setImportResults] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [applying, setApplying] = useState(false);

  // Fetch all assignments with payment statuses
  const { data: paymentAssignments = [] } = useQuery({
    queryKey: ["payment-assignments", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("id, sr_id, area, address, status, payment_amount, payment_date, payment_notes, submitted_at, paid_at, customer_name")
        .eq("organization_id", organizationId!)
        .in("status", ["submitted", "paid", "rejected", "completed"])
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch in-progress constructions for forecast
  const { data: inProgressData = [] } = useQuery({
    queryKey: ["forecast-constructions", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("constructions")
        .select("revenue")
        .eq("organization_id", organizationId!)
        .eq("status", "in_progress");
      if (error) throw error;
      return data || [];
    },
  });

  const submitted = paymentAssignments.filter((a: any) => a.status === "submitted");
  const paid = paymentAssignments.filter((a: any) => a.status === "paid");
  const rejected = paymentAssignments.filter((a: any) => a.status === "rejected");

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const pendingPaymentTotal = submitted.reduce((s: number, a: any) => s + (Number(a.payment_amount) || 0), 0);
  const paidThisMonth = paid.filter((a: any) => a.paid_at?.startsWith(thisMonth));
  const paidThisMonthTotal = paidThisMonth.reduce((s: number, a: any) => s + (Number(a.payment_amount) || 0), 0);

  // Forecast
  const avgPayment = paid.length > 0
    ? paid.reduce((s: number, a: any) => s + (Number(a.payment_amount) || 0), 0) / paid.length
    : 0;
  const forecastTotal = inProgressData.length * avgPayment;

  // 6-month chart data
  const chartData = useMemo(() => {
    const months: { label: string; submitted: number; paid: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = GREEK_MONTHS[d.getMonth()];
      const submittedSum = paymentAssignments
        .filter((a: any) => (a.status === "submitted" || a.status === "paid") && a.submitted_at?.startsWith(key))
        .reduce((s: number, a: any) => s + (Number(a.payment_amount) || 0), 0);
      const paidSum = paymentAssignments
        .filter((a: any) => a.status === "paid" && a.paid_at?.startsWith(key))
        .reduce((s: number, a: any) => s + (Number(a.payment_amount) || 0), 0);
      months.push({ label, submitted: submittedSum, paid: paidSum });
    }
    return months;
  }, [paymentAssignments]);

  const chartConfig = {
    submitted: { label: "Παραδόθηκαν", color: "hsl(187 70% 50%)" },
    paid: { label: "Πληρώθηκαν", color: "hsl(152 60% 42%)" },
  };

  const filtered = tab === "submitted" ? submitted
    : tab === "paid" ? paid
    : tab === "rejected" ? rejected
    : paymentAssignments;

  // Inline edit amount
  const saveAmount = async (id: string) => {
    const val = parseFloat(editValue.replace(",", "."));
    if (isNaN(val)) { setEditingId(null); return; }
    await supabase.from("assignments").update({ payment_amount: val } as any).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["payment-assignments"] });
    setEditingId(null);
    toast.success("Ποσό ενημερώθηκε");
  };

  // Mark as paid
  const markPaid = async () => {
    if (!paidDialog) return;
    await supabase.from("assignments").update({
      status: "paid",
      paid_at: paidDate || new Date().toISOString(),
      payment_date: paidDate || new Date().toISOString().split("T")[0],
    } as any).eq("id", paidDialog.id);
    queryClient.invalidateQueries({ queryKey: ["payment-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["assignments"] });
    setPaidDialog(null);
    setPaidDate("");
    toast.success("Σημειώθηκε ως πληρωμένο ✓");
  };

  // Mark as rejected
  const markRejected = async () => {
    if (!rejectDialog) return;
    await supabase.from("assignments").update({
      status: "rejected",
      payment_notes: rejectReason,
    } as any).eq("id", rejectDialog.id);
    queryClient.invalidateQueries({ queryKey: ["payment-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["assignments"] });
    setRejectDialog(null);
    setRejectReason("");
    toast.success("Σημειώθηκε ως απορριφθέν");
  };

  // Restore to submitted
  const restoreSubmitted = async (id: string) => {
    await supabase.from("assignments").update({
      status: "submitted",
      paid_at: null,
      payment_notes: null,
    } as any).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["payment-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["assignments"] });
    toast.success("Επαναφέρθηκε σε Παραδόθηκε");
  };

  // PDF Import
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportDialog(true);
    setImportResults([]);

    try {
      // Upload to storage
      const path = `imports/${organizationId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("payment-docs").upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      // Call edge function to parse
      const { data, error } = await supabase.functions.invoke("parse-payment-doc", {
        body: { file_path: path, organization_id: organizationId },
      });
      if (error) throw error;

      const results = data?.results || [];
      // Cross-reference with existing assignments
      const enriched = await Promise.all(
        results.map(async (r: any) => {
          const { data: match } = await supabase
            .from("assignments")
            .select("id, sr_id, status")
            .eq("organization_id", organizationId!)
            .eq("sr_id", r.sr_id)
            .maybeSingle();
          return { ...r, found: !!match, assignmentId: match?.id, currentStatus: match?.status };
        })
      );
      setImportResults(enriched);
    } catch (err: any) {
      toast.error("Σφάλμα: " + err.message);
      setImportDialog(false);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const applyImport = async () => {
    setApplying(true);
    let count = 0;
    for (const r of importResults) {
      if (!r.found || !r.assignmentId) continue;
      await supabase.from("assignments").update({
        status: "paid",
        payment_amount: r.amount,
        paid_at: r.date || new Date().toISOString(),
        payment_date: r.date || new Date().toISOString().split("T")[0],
      } as any).eq("id", r.assignmentId);
      count++;
    }
    queryClient.invalidateQueries({ queryKey: ["payment-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["assignments"] });
    setImportDialog(false);
    setImportResults([]);
    toast.success(`${count} SR ενημερώθηκαν ✓`);
    setApplying(false);
  };

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-cyan-400" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Αναμ. Πληρωμή</span>
            </div>
            <p className="text-xl font-extrabold text-foreground">{fmtEur(pendingPaymentTotal)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{submitted.length} SR</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Πληρωμένα (μήνας)</span>
            </div>
            <p className="text-xl font-extrabold text-foreground">{fmtEur(paidThisMonthTotal)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{paidThisMonth.length} SR</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="h-4 w-4 text-red-400" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Απορρίφθηκαν</span>
            </div>
            <p className="text-xl font-extrabold text-foreground">{rejected.length}</p>
            <p className="text-[10px] text-muted-foreground mt-1">SR</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-purple-400" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Πρόβλεψη Μήνα</span>
            </div>
            <p className="text-xl font-extrabold text-foreground">~{fmtEur(forecastTotal)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{inProgressData.length} σε εξέλιξη</p>
          </CardContent>
        </Card>
      </div>

      {/* Import button */}
      <div className="flex justify-end">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xlsx,.csv"
          className="hidden"
          onChange={handleFileUpload}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="gap-2"
        >
          <Upload className="h-4 w-4" />
          📄 Εισαγωγή PDF ΟΤΕ
        </Button>
      </div>

      {/* Filter Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">Όλα</TabsTrigger>
          <TabsTrigger value="submitted">Παραδόθηκαν {submitted.length}</TabsTrigger>
          <TabsTrigger value="paid">Πληρωμένα</TabsTrigger>
          <TabsTrigger value="rejected">Απορρίφθηκαν {rejected.length}</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          {/* Table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">SR ID</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Διεύθυνση</th>
                    <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Ποσό</th>
                    <th className="text-center px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Κατάσταση</th>
                    <th className="text-center px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Ημ/νία</th>
                    <th className="text-center px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a: any) => (
                    <tr key={a.id} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-primary">{a.sr_id}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell truncate max-w-[200px]">
                        {a.address || a.area}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        {editingId === a.id ? (
                          <Input
                            className="w-24 h-7 text-right text-sm ml-auto"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => saveAmount(a.id)}
                            onKeyDown={(e) => e.key === "Enter" && saveAmount(a.id)}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:text-primary transition-colors"
                            onClick={() => {
                              setEditingId(a.id);
                              setEditValue(String(a.payment_amount || 0));
                            }}
                          >
                            {fmtEur(Number(a.payment_amount) || 0)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                          a.status === "submitted" ? "bg-cyan-500/15 text-cyan-400" :
                          a.status === "paid" ? "bg-green-500/15 text-green-400" :
                          a.status === "rejected" ? "bg-red-500/15 text-red-400" :
                          "bg-blue-500/15 text-blue-400"
                        }`}>
                          {a.status === "submitted" ? "Παραδόθηκε" :
                           a.status === "paid" ? "Πληρώθηκε" :
                           a.status === "rejected" ? "Απορρίφθηκε" :
                           "AS-BUILD"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground text-xs hidden sm:table-cell">
                        {a.paid_at ? new Date(a.paid_at).toLocaleDateString("el-GR") :
                         a.submitted_at ? new Date(a.submitted_at).toLocaleDateString("el-GR") : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {a.status !== "paid" && (
                              <DropdownMenuItem onClick={() => { setPaidDialog(a); setPaidDate(""); }}>
                                ✅ Σημείωσε ως Πληρωμένο
                              </DropdownMenuItem>
                            )}
                            {a.status !== "rejected" && (
                              <DropdownMenuItem onClick={() => { setRejectDialog(a); setRejectReason(""); }}>
                                ❌ Σημείωσε ως Απορριφθέν
                              </DropdownMenuItem>
                            )}
                            {(a.status === "paid" || a.status === "rejected") && (
                              <DropdownMenuItem onClick={() => restoreSubmitted(a.id)}>
                                ↩️ Επαναφορά σε Παραδόθηκε
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                        Δεν βρέθηκαν εγγραφές
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* 6-Month Chart */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
          <Euro className="h-4 w-4 text-primary" />
          Παραδόσεις & Πληρωμές (6 μήνες)
        </h3>
        <ChartContainer config={chartConfig} className="h-[220px] w-full">
          <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="submitted" name="Παραδόθηκαν" fill="hsl(187 70% 50%)" radius={[6, 6, 0, 0]} barSize={20} />
            <Bar dataKey="paid" name="Πληρώθηκαν" fill="hsl(152 60% 42%)" radius={[6, 6, 0, 0]} barSize={20} />
          </BarChart>
        </ChartContainer>
      </div>

      {/* Paid Dialog */}
      <Dialog open={!!paidDialog} onOpenChange={(o) => !o && setPaidDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Σημείωσε ως Πληρωμένο</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">SR: <strong>{paidDialog?.sr_id}</strong></p>
            <div>
              <Label>Ημερομηνία Πληρωμής</Label>
              <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaidDialog(null)}>Ακύρωση</Button>
            <Button onClick={markPaid}>Επιβεβαίωση ✓</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={(o) => !o && setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Σημείωσε ως Απορριφθέν</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">SR: <strong>{rejectDialog?.sr_id}</strong></p>
            <div>
              <Label>Λόγος Απόρριψης</Label>
              <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Περιγράψτε τον λόγο..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>Ακύρωση</Button>
            <Button variant="destructive" onClick={markRejected}>Απόρριψη</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Preview Dialog */}
      <Dialog open={importDialog} onOpenChange={(o) => !o && setImportDialog(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>📄 {importing ? "Ανάλυση εγγράφου..." : `Βρέθηκαν ${importResults.length} SR`}</DialogTitle>
          </DialogHeader>
          {importing ? (
            <div className="py-8 text-center text-muted-foreground">Ανάλυση εγγράφου με AI...</div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {importResults.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 text-sm">
                  <span className={r.found ? "text-green-400" : "text-yellow-400"}>{r.found ? "✅" : "⚠️"}</span>
                  <span className="font-bold flex-1">{r.sr_id}</span>
                  <span className="font-bold">{r.amount ? fmtEur(r.amount) : "—"}</span>
                  <span className="text-xs text-muted-foreground">{r.date || ""}</span>
                  {!r.found && <span className="text-[10px] text-yellow-400">Δεν βρέθηκε</span>}
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialog(false)}>Ακύρωση</Button>
            <Button onClick={applyImport} disabled={importing || applying || importResults.filter((r) => r.found).length === 0}>
              {applying ? "Εφαρμογή..." : `Εφαρμογή σε ${importResults.filter((r) => r.found).length} SR →`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PaymentTracker;
