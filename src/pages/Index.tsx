import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import deltaLogoIcon from "@/assets/delta-logo-icon.png";
import StatCard from "@/components/StatCard";
import AssignmentTable from "@/components/AssignmentTable";
import SyncButton from "@/components/SyncButton";
import SetupWizard from "@/components/SetupWizard";
import { useAssignments, useConstructions } from "@/hooks/useData";
import { statusLabels } from "@/data/mockData";
import { ClipboardCheck, Wrench, TrendingUp, Euro, FolderOpen, Activity, Wifi, PieChartIcon, CalendarDays, Timer, Zap } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, Cell, PieChart, Pie, LineChart, Line, CartesianGrid, ResponsiveContainer } from "recharts";
import { useMemo } from "react";

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "τώρα";
  if (diffMins < 60) return `${diffMins}λ`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}ω`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}μ`;
  return `${Math.floor(diffDays / 7)}εβδ`;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(38 92% 50%)",
  inspection: "hsl(330 100% 44%)",
  pre_committed: "hsl(220 70% 55%)",
  waiting_ote: "hsl(190 75% 45%)",
  construction: "hsl(280 55% 52%)",
  completed: "hsl(152 60% 42%)",
  cancelled: "hsl(0 60% 50%)",
};

const GREEK_MONTHS: Record<number, string> = {
  0: "Ιαν", 1: "Φεβ", 2: "Μαρ", 3: "Απρ", 4: "Μαϊ", 5: "Ιουν",
  6: "Ιουλ", 7: "Αυγ", 8: "Σεπ", 9: "Οκτ", 10: "Νοε", 11: "Δεκ",
};

const Index = () => {
  const [wizardDismissed, setWizardDismissed] = useState(false);
  const { data: dbAssignments } = useAssignments();
  const { data: dbConstructions } = useConstructions();

  const assignments = useMemo(() => {
    if (!dbAssignments) return [];
    return dbAssignments.map(a => ({
      id: a.id,
      srId: a.sr_id,
      area: a.area,
      status: a.status as any,
      technician: '—',
      customerName: (a as any).customer_name || '',
      address: (a as any).address || '',
      cab: (a as any).cab || '',
      phone: (a as any).phone || '',
      date: a.created_at.split('T')[0],
      updatedAt: a.updated_at,
      comments: a.comments || '',
      photos: a.photos_count || 0,
      driveUrl: a.drive_folder_url || '',
    }));
  }, [dbAssignments]);

  const constructions = useMemo(() => {
    if (!dbConstructions) return [];
    return dbConstructions.map(c => ({
      id: c.id,
      srId: c.sr_id,
      sesId: c.ses_id || '',
      ak: c.ak || '',
      cab: c.cab || '',
      floors: c.floors || 0,
      status: c.status as any,
      revenue: Number(c.revenue),
      materialCost: Number(c.material_cost),
      profit: Number(c.profit || 0),
      date: c.created_at.split('T')[0],
    }));
  }, [dbConstructions]);

  const activeAssignments = assignments.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length;
  const completedAssignments = assignments.filter(a => a.status === 'completed').length;
  const waitingOte = assignments.filter(a => a.status === 'waiting_ote').length;
  const totalRevenue = constructions.reduce((sum, c) => sum + c.revenue, 0);
  const totalProfit = constructions.reduce((sum, c) => sum + c.profit, 0);
  const activeConstructions = constructions.filter(c => c.status === 'in_progress').length;
  const withDrive = assignments.filter(a => (a as any).driveUrl).length;

  // Status distribution
  const statusCounts = Object.entries(
    assignments.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([status, count]) => ({
    status,
    label: (statusLabels as any)[status] || status,
    count,
    fill: STATUS_COLORS[status] || "hsl(220 10% 46%)",
  }));

  const chartConfig = statusCounts.reduce((acc, s) => {
    acc[s.status] = { label: s.label, color: s.fill };
    return acc;
  }, {} as Record<string, { label: string; color: string }>);

  // Monthly completions trend
  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months: { month: string; label: string; completed: number; revenue: number; profit: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = GREEK_MONTHS[d.getMonth()];
      const monthAssignments = assignments.filter(a => a.date.startsWith(key) && a.status === 'completed');
      const monthConstructions = constructions.filter(c => c.date.startsWith(key));
      months.push({
        month: key, label,
        completed: monthAssignments.length,
        revenue: monthConstructions.reduce((s, c) => s + c.revenue, 0),
        profit: monthConstructions.reduce((s, c) => s + c.profit, 0),
      });
    }
    return months;
  }, [assignments, constructions]);

  const trendConfig = {
    completed: { label: "Ολοκληρωμένα", color: "hsl(152 60% 42%)" },
    revenue: { label: "Έσοδα", color: "hsl(220 70% 55%)" },
    profit: { label: "Κέρδος", color: "hsl(152 60% 42%)" },
  };

  // Recent activity
  const recentActivity = [...assignments]
    .sort((a, b) => (b.updatedAt || b.date).localeCompare(a.updatedAt || a.date))
    .slice(0, 8)
    .map(a => ({
      srId: a.srId,
      area: a.area,
      status: a.status,
      label: (statusLabels as any)[a.status] || a.status,
      date: a.updatedAt ? new Date(a.updatedAt).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' }) : a.date.slice(5),
      timeAgo: a.updatedAt ? getTimeAgo(a.updatedAt) : '',
    }));

  return (
    <AppLayout>
      <div className="space-y-5 sm:space-y-6 max-w-[1400px] mx-auto">
        {/* Hero Banner */}
        <div className="relative rounded-2xl overflow-hidden shadow-xl bg-sidebar">
          {/* Gradient background instead of image for better mobile performance */}
          <div className="absolute inset-0 bg-gradient-to-br from-sidebar via-sidebar-accent to-sidebar opacity-90" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(330_100%_44%/0.15),transparent_60%)]" />
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-[radial-gradient(circle,hsl(152_60%_42%/0.08),transparent_70%)]" />

          <div className="relative z-10 px-5 py-6 sm:px-8 sm:py-8">
            {/* Top row: logo + sync */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4 sm:gap-5">
                <img
                  src={deltaLogoIcon}
                  alt="DeltaNetwork"
                  className="h-10 sm:h-12 w-auto object-contain drop-shadow-lg"
                />
                <div className="h-8 sm:h-10 w-px bg-white/15" />
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="h-0.5 w-5 rounded-full cosmote-gradient" />
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">Fiber to the X</span>
                  </div>
                  <h1 className="text-lg sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-white">
                    Πίνακας Ελέγχου
                  </h1>
                  <p className="text-[10px] sm:text-xs text-white/45 mt-0.5">
                    Διαχείριση δικτύου οπτικών ινών — Ρόδος & Κως
                  </p>
                </div>
              </div>
              <div className="hidden sm:block shrink-0">
                <SyncButton />
              </div>
            </div>

            {/* Quick stats row */}
            <div className="mt-5 grid grid-cols-3 gap-3 sm:flex sm:items-center sm:gap-6 lg:gap-8">
              <div className="text-center sm:text-left">
                <p className="text-2xl sm:text-3xl font-extrabold text-white">{assignments.length}</p>
                <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-white/40 mt-0.5">Αναθέσεις</p>
              </div>
              <div className="hidden sm:block h-8 w-px bg-white/10" />
              <div className="text-center sm:text-left">
                <p className="text-2xl sm:text-3xl font-extrabold text-white">{constructions.length}</p>
                <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-white/40 mt-0.5">Κατασκευές</p>
              </div>
              <div className="hidden sm:block h-8 w-px bg-white/10" />
              <div className="text-center sm:text-left">
                <p className="text-2xl sm:text-3xl font-extrabold text-white">{totalProfit.toLocaleString('el-GR')}€</p>
                <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-white/40 mt-0.5">Κέρδος</p>
              </div>
            </div>

            {/* Mobile sync button */}
            <div className="mt-4 sm:hidden">
              <SyncButton />
            </div>
          </div>
        </div>

        {/* Setup Wizard */}
        {!wizardDismissed && (
          <SetupWizard onDismiss={() => setWizardDismissed(true)} />
        )}

        {/* Stat Cards - responsive grid */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard title="Ενεργές Αναθέσεις" value={activeAssignments} subtitle={`${completedAssignments} ολοκληρωμένες`} icon={ClipboardCheck} trend="up" trendValue={`${assignments.length} σύνολο`} />
          <StatCard title="Αναμονή ΟΤΕ" value={waitingOte} subtitle="σε αναμονή" icon={Timer} />
          <StatCard title="Κατασκευές" value={activeConstructions} subtitle="σε εξέλιξη" icon={Wrench} accent />
          <StatCard title="Έσοδα" value={`${totalRevenue.toLocaleString('el-GR')}€`} subtitle="κατασκευών" icon={Euro} trend="up" trendValue={`${totalProfit.toLocaleString('el-GR')}€ κέρδος`} />
          <StatCard title="Καθαρό Κέρδος" value={`${totalProfit.toLocaleString('el-GR')}€`} subtitle={`${totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0}% margin`} icon={TrendingUp} trend={totalProfit > 0 ? 'up' : 'down'} trendValue={`${constructions.length} κατ.`} accent />
          <StatCard title="Drive Folders" value={withDrive} subtitle={`από ${assignments.length}`} icon={FolderOpen} />
        </div>

        {/* Charts Row - stack on mobile */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* Status Bar Chart */}
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
              <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
              Κατάσταση Αναθέσεων
            </h2>
            <ChartContainer config={chartConfig} className="h-[200px] sm:h-[220px] w-full">
              <BarChart data={statusCounts} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={45} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={25} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={28}>
                  {statusCounts.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>

          {/* Monthly Trend */}
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
              <CalendarDays className="h-4 w-4 text-accent shrink-0" />
              Μηνιαία Ολοκλήρωση
            </h2>
            <ChartContainer config={trendConfig} className="h-[200px] sm:h-[220px] w-full">
              <BarChart data={monthlyTrend} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="completed" name="Ολοκληρωμένα" fill="hsl(152 60% 42%)" radius={[6, 6, 0, 0]} barSize={24} />
              </BarChart>
            </ChartContainer>
          </div>

          {/* Revenue Pie */}
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm md:col-span-2 xl:col-span-1">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
              <PieChartIcon className="h-4 w-4 text-accent shrink-0" />
              Έσοδα vs Κόστος Υλικών
            </h2>
            {(() => {
              const totalMaterialCost = constructions.reduce((sum, c) => sum + c.materialCost, 0);
              const pieData = [
                { name: "Καθαρό Κέρδος", value: Math.max(0, totalProfit), fill: "hsl(152 60% 42%)" },
                { name: "Κόστος Υλικών", value: totalMaterialCost, fill: "hsl(330 100% 44%)" },
              ];
              const pieConfig = {
                profit: { label: "Καθαρό Κέρδος", color: "hsl(152 60% 42%)" },
                cost: { label: "Κόστος Υλικών", color: "hsl(330 100% 44%)" },
              };
              return (
                <>
                  <ChartContainer config={pieConfig} className="h-[160px] sm:h-[180px] w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} strokeWidth={2} stroke="hsl(var(--card))">
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="flex flex-wrap justify-center gap-4 mt-2">
                    {pieData.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                        <span className="text-muted-foreground">{item.name}</span>
                        <span className="font-bold text-foreground">{item.value.toLocaleString('el-GR')}€</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Activity + Revenue Trend */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Recent Activity */}
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
              <Activity className="h-4 w-4 text-accent shrink-0" />
              Πρόσφατη Δραστηριότητα
            </h2>
            <div className="space-y-2">
              {recentActivity.map((item, i) => (
                <div key={i} className="flex items-center gap-2 sm:gap-3 text-xs rounded-lg px-2.5 sm:px-3 py-2 sm:py-2.5 bg-muted/50 hover:bg-muted transition-colors">
                  <div
                    className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full shrink-0 ring-2 ring-background"
                    style={{ backgroundColor: STATUS_COLORS[item.status] || "hsl(220 10% 46%)" }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-foreground text-[11px] sm:text-xs">{item.srId}</span>
                    <span className="text-muted-foreground ml-1.5 sm:ml-2 text-[10px] sm:text-xs hidden sm:inline">{item.area}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded bg-muted truncate max-w-[80px] sm:max-w-none">
                    {item.label}
                  </span>
                  {item.timeAgo && (
                    <span className="text-muted-foreground/60 shrink-0 font-mono text-[9px] sm:text-[10px]">{item.timeAgo}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Revenue Line Chart */}
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
              <TrendingUp className="h-4 w-4 text-primary shrink-0" />
              Τάση Εσόδων / Κέρδους
            </h2>
            <ChartContainer config={trendConfig} className="h-[200px] sm:h-[220px] w-full">
              <LineChart data={monthlyTrend} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={45} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="revenue" name="Έσοδα" stroke="hsl(220 70% 55%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="profit" name="Κέρδος" stroke="hsl(152 60% 42%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartContainer>
          </div>
        </div>

        {/* Recent Assignments Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 sm:px-5 py-3 sm:py-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
              <h2 className="font-bold text-sm">Πρόσφατες Αναθέσεις</h2>
            </div>
            <span className="text-[10px] sm:text-[11px] text-muted-foreground font-mono bg-muted px-2 sm:px-2.5 py-1 rounded-full">{assignments.length} εγγραφές</span>
          </div>
          <div className="overflow-x-auto">
            <AssignmentTable assignments={[...assignments].sort((a, b) => (b.updatedAt || b.date).localeCompare(a.updatedAt || a.date)).slice(0, 5)} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Index;
