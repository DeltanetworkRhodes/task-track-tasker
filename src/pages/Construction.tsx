import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import StatCard from "@/components/StatCard";
import { useConstructions, useAssignments } from "@/hooks/useData";
import { constructionStatusLabels } from "@/data/mockData";
import { Wrench, TrendingUp, Receipt, DollarSign, Search, Filter, ExternalLink, ChevronDown, ChevronUp, Calendar, MapPin, Layers, Route, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  in_progress: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  completed: "bg-green-500/10 text-green-600 border-green-500/20",
  invoiced: "bg-primary/10 text-primary border-primary/20",
};

const statusChartColors: Record<string, string> = {
  in_progress: "hsl(38 92% 50%)",
  completed: "hsl(152 60% 42%)",
  invoiced: "hsl(220 70% 55%)",
};

const ConstructionPage = () => {
  const { data: dbConstructions, isLoading } = useConstructions();
  const { data: dbAssignments } = useAssignments();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedConstruction, setSelectedConstruction] = useState<any>(null);
  const [sortField, setSortField] = useState<string>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("constructions")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success(`Η κατασκευή ${deleteTarget.srId} διαγράφηκε`);
      queryClient.invalidateQueries({ queryKey: ["constructions"] });
      setDeleteTarget(null);
      setSelectedConstruction(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleConstructionStatusChange = async (constructionId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("constructions")
        .update({ status: newStatus })
        .eq("id", constructionId);
      if (error) throw error;
      toast.success(`Κατάσταση → ${(constructionStatusLabels as any)[newStatus] || newStatus}`);
      if (selectedConstruction?.id === constructionId) {
        setSelectedConstruction({ ...selectedConstruction, status: newStatus });
      }
      queryClient.invalidateQueries({ queryKey: ["constructions"] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const constructions = useMemo(() => {
    if (!dbConstructions) return [];
    return dbConstructions.map(c => ({
      id: c.id,
      srId: c.sr_id,
      sesId: c.ses_id || '',
      ak: c.ak || '',
      cab: c.cab || '',
      floors: c.floors || 0,
      status: c.status,
      revenue: Number(c.revenue),
      materialCost: Number(c.material_cost),
      profit: Number(c.profit || 0),
      date: c.created_at.split('T')[0],
      routingType: (c as any).routing_type || '',
      pendingNote: (c as any).pending_note || '',
      assignmentId: (c as any).assignment_id || '',
      routes: (c as any).routes || [],
    }));
  }, [dbConstructions]);

  // Match assignment data for extra info
  const assignmentMap = useMemo(() => {
    const map: Record<string, any> = {};
    (dbAssignments || []).forEach(a => {
      map[a.sr_id] = a;
    });
    return map;
  }, [dbAssignments]);

  // Stats
  const totalRevenue = constructions.reduce((s, c) => s + c.revenue, 0);
  const totalCost = constructions.reduce((s, c) => s + c.materialCost, 0);
  const totalProfit = constructions.reduce((s, c) => s + c.profit, 0);
  const completedCount = constructions.filter(c => c.status === 'completed' || c.status === 'invoiced').length;
  const inProgressCount = constructions.filter(c => c.status === 'in_progress').length;

  // Status distribution for chart
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    constructions.forEach(c => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    return Object.entries(counts).map(([status, count]) => ({
      status,
      label: (constructionStatusLabels as any)[status] || status,
      count,
      fill: statusChartColors[status] || "hsl(220 10% 46%)",
    }));
  }, [constructions]);

  // Monthly revenue trend
  const monthlyTrend = useMemo(() => {
    const months: Record<string, { revenue: number; cost: number; profit: number; count: number }> = {};
    constructions.forEach(c => {
      const month = c.date.substring(0, 7); // YYYY-MM
      if (!months[month]) months[month] = { revenue: 0, cost: 0, profit: 0, count: 0 };
      months[month].revenue += c.revenue;
      months[month].cost += c.materialCost;
      months[month].profit += c.profit;
      months[month].count += 1;
    });
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, data]) => ({
        month: month.substring(5), // MM
        ...data,
      }));
  }, [constructions]);

  // Filtering & sorting
  const filtered = useMemo(() => {
    let result = constructions.filter(c => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.srId.toLowerCase().includes(q) ||
          c.sesId.toLowerCase().includes(q) ||
          c.cab.toLowerCase().includes(q) ||
          c.ak.toLowerCase().includes(q);
      }
      return true;
    });

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date": cmp = a.date.localeCompare(b.date); break;
        case "revenue": cmp = a.revenue - b.revenue; break;
        case "profit": cmp = a.profit - b.profit; break;
        case "sr": cmp = a.srId.localeCompare(b.srId); break;
        default: cmp = a.date.localeCompare(b.date);
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [constructions, search, statusFilter, sortField, sortAsc]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const chartConfig = statusCounts.reduce((acc, s) => {
    acc[s.status] = { label: s.label, color: s.fill };
    return acc;
  }, {} as Record<string, { label: string; color: string }>);

  const trendConfig = {
    revenue: { label: "Έσοδα", color: "hsl(220 70% 55%)" },
    cost: { label: "Κόστος", color: "hsl(330 100% 44%)" },
    profit: { label: "Κέρδος", color: "hsl(152 60% 42%)" },
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px]">
        <div>
          <h1 className="text-2xl font-bold">Πυλώνας 2 — Κατασκευές</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Διαχείριση κατασκευών, υλικών και φύλλων απολογισμού
            
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard title="Σύνολο Κατασκευών" value={constructions.length} subtitle={`${inProgressCount} σε εξέλιξη`} icon={Wrench} />
          <StatCard title="Ολοκληρωμένες" value={completedCount} subtitle={`${Math.round((completedCount / Math.max(constructions.length, 1)) * 100)}% επιτυχία`} icon={TrendingUp} trend="up" trendValue={`${constructions.length} σύνολο`} />
          <StatCard title="Συνολικά Έσοδα" value={`${totalRevenue.toLocaleString('el-GR')}€`} subtitle="Από κατασκευές" icon={Receipt} accent />
          <StatCard title="Κόστος Υλικών" value={`${totalCost.toLocaleString('el-GR')}€`} subtitle={`${totalRevenue > 0 ? Math.round((totalCost / totalRevenue) * 100) : 0}% των εσόδων`} icon={DollarSign} />
          <StatCard title="Καθαρό Κέρδος" value={`${totalProfit.toLocaleString('el-GR')}€`} subtitle={`${totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0}% margin`} icon={TrendingUp} trend={totalProfit >= 0 ? "up" : "down"} trendValue={`${completedCount} ολοκληρωμένες`} accent />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Status Distribution */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
              <Wrench className="h-4 w-4 text-primary" />
              Κατάσταση Κατασκευών
            </h2>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={statusCounts} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <XAxis dataKey="label" tick={{ fill: "hsl(220 10% 46%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(220 10% 46%)", fontSize: 11 }} axisLine={false} tickLine={false} width={25} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={40}>
                  {statusCounts.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>

          {/* Monthly Trend */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
              <TrendingUp className="h-4 w-4 text-accent" />
              Μηνιαία Τάση Εσόδων
            </h2>
            {monthlyTrend.length > 0 ? (
              <ChartContainer config={trendConfig} className="h-[200px] w-full">
                <LineChart data={monthlyTrend} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 10% 90%)" />
                  <XAxis dataKey="month" tick={{ fill: "hsl(220 10% 46%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "hsl(220 10% 46%)", fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(220 70% 55%)" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="profit" stroke="hsl(152 60% 42%)" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="cost" stroke="hsl(330 100% 44%)" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 5" />
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                Δεν υπάρχουν αρκετά δεδομένα
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Αναζήτηση SR, SES, CAB..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Κατάσταση" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Όλες</SelectItem>
              <SelectItem value="in_progress">Σε Εξέλιξη</SelectItem>
              <SelectItem value="completed">Ολοκληρωμένες</SelectItem>
              <SelectItem value="invoiced">Τιμολογημένες</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground font-bold self-center bg-muted px-2.5 py-1.5 rounded-full">
            {filtered.length} / {constructions.length}
          </span>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => toggleSort("sr")}>
                    <span className="flex items-center gap-1">SR ID <SortIcon field="sr" /></span>
                  </th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">SES ID</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">CAB</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Πελάτης</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Κατάσταση</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground text-xs uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => toggleSort("revenue")}>
                    <span className="flex items-center justify-end gap-1">Έσοδα <SortIcon field="revenue" /></span>
                  </th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground text-xs uppercase tracking-wider">Κόστος</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground text-xs uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => toggleSort("profit")}>
                    <span className="flex items-center justify-end gap-1">Κέρδος <SortIcon field="profit" /></span>
                  </th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground text-xs uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => toggleSort("date")}>
                    <span className="flex items-center justify-end gap-1">Ημ/νία <SortIcon field="date" /></span>
                  </th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground text-xs uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/30">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="py-3 px-4"><div className="h-4 bg-muted animate-pulse rounded" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      <Wrench className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>Δεν βρέθηκαν κατασκευές</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const assignment = assignmentMap[c.srId];
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-border/30 hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedConstruction(c)}
                      >
                        <td className="py-3 px-4 font-bold text-primary">{c.srId}</td>
                        <td className="py-3 px-4 text-xs font-bold">{c.sesId || '—'}</td>
                        <td className="py-3 px-4 text-xs font-bold">{c.cab || '—'}</td>
                        <td className="py-3 px-4 text-xs">{assignment?.customer_name || '—'}</td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className={statusColors[c.status] || ""}>
                            {(constructionStatusLabels as any)[c.status] || c.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right font-bold">{c.revenue > 0 ? `${c.revenue.toLocaleString('el-GR')}€` : '—'}</td>
                        <td className="py-3 px-4 text-right font-bold text-destructive">{c.materialCost > 0 ? `${c.materialCost.toLocaleString('el-GR')}€` : '—'}</td>
                        <td className={`py-3 px-4 text-right font-bold ${c.profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                          {c.profit !== 0 ? `${c.profit >= 0 ? '+' : ''}${c.profit.toLocaleString('el-GR')}€` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-xs text-muted-foreground font-bold">{c.date}</td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
                            className="text-muted-foreground/40 hover:text-destructive transition-colors p-1 rounded"
                            title="Διαγραφή"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Dialog */}
        <Dialog open={!!selectedConstruction} onOpenChange={(open) => { if (!open) setSelectedConstruction(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" />
                Κατασκευή — {selectedConstruction?.srId}
              </DialogTitle>
            </DialogHeader>
            {selectedConstruction && (() => {
              const c = selectedConstruction;
              const assignment = assignmentMap[c.srId];
              return (
                <div className="space-y-4">
                  {/* Status */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5">Κατάσταση</p>
                    <Select
                      value={c.status}
                      onValueChange={(val) => handleConstructionStatusChange(c.id, val)}
                    >
                      <SelectTrigger className="w-full h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(constructionStatusLabels).map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Technical Details */}
                  <Card className="p-4 space-y-2 text-sm">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Τεχνικά Στοιχεία</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs font-medium">SES ID:</span>
                        <span className="font-mono">{c.sesId || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs font-medium">Α/Κ:</span>
                        <span className="font-mono">{c.ak || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs font-medium">CAB:</span>
                        <span className="font-mono">{c.cab || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{c.floors || 0} όροφοι</span>
                      </div>
                      {c.routingType && (
                        <div className="flex items-center gap-2 col-span-2">
                          <Route className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>Όδευση: {c.routingType}</span>
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Customer Info */}
                  {assignment && (
                    <Card className="p-4 space-y-2 text-sm">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Πελάτης</h3>
                      {assignment.customer_name && <p className="font-medium">{assignment.customer_name}</p>}
                      {assignment.address && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{assignment.address}</span>
                        </div>
                      )}
                      {assignment.area && (
                        <div className="text-xs text-muted-foreground">Περιοχή: {assignment.area}</div>
                      )}
                      {assignment.drive_folder_url && (
                        <a href={assignment.drive_folder_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary text-xs hover:underline">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Google Drive
                        </a>
                      )}
                    </Card>
                  )}

                  {/* Financials */}
                  <Card className="p-4 space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Οικονομικά</h3>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Έσοδα</p>
                        <p className="text-lg font-bold font-mono text-primary">{c.revenue.toLocaleString('el-GR')}€</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Κόστος</p>
                        <p className="text-lg font-bold font-mono text-destructive">{c.materialCost.toLocaleString('el-GR')}€</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Κέρδος</p>
                        <p className={`text-lg font-bold font-mono ${c.profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                          {c.profit >= 0 ? '+' : ''}{c.profit.toLocaleString('el-GR')}€
                        </p>
                      </div>
                    </div>
                    {c.revenue > 0 && (
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, (c.profit / c.revenue) * 100))}%` }}
                        />
                      </div>
                    )}
                  </Card>

                  {/* Pending Note */}
                  {c.pendingNote && (
                    <Card className="p-4 text-sm">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Σημείωση Αναμονής</h3>
                      <p className="text-muted-foreground">{c.pendingNote}</p>
                    </Card>
                  )}

                  {/* Date */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Δημιουργία: {new Date(c.date).toLocaleDateString('el-GR')}</span>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Διαγραφή Κατασκευής</AlertDialogTitle>
              <AlertDialogDescription>
                Είστε σίγουροι ότι θέλετε να διαγράψετε την κατασκευή <strong className="text-foreground">{deleteTarget?.srId}</strong>; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Ακύρωση</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Διαγραφή..." : "Διαγραφή"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
};

export default ConstructionPage;
