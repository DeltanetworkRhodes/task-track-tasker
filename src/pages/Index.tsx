import AppLayout from "@/components/AppLayout";
import fiberHero from "@/assets/fiber-hero.jpg";
import StatCard from "@/components/StatCard";
import AssignmentTable from "@/components/AssignmentTable";
import SyncButton from "@/components/SyncButton";
import { useAssignments, useConstructions } from "@/hooks/useData";
import { mockAssignments, mockConstructions, statusLabels } from "@/data/mockData";
import { ClipboardCheck, Wrench, TrendingUp, Euro, FolderOpen, Activity, Wifi, PieChartIcon, CalendarDays, Timer } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, Cell, PieChart, Pie, LineChart, Line, CartesianGrid } from "recharts";
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
  const { data: dbAssignments } = useAssignments();
  const { data: dbConstructions } = useConstructions();

  const hasRealData = (dbAssignments?.length ?? 0) > 0;
  const assignments = hasRealData ? dbAssignments!.map(a => ({
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
  })) : mockAssignments.map(a => ({ ...a, updatedAt: a.date }));

  const hasRealConstructions = (dbConstructions?.length ?? 0) > 0;
  const constructions = hasRealConstructions ? dbConstructions!.map(c => ({
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
  })) : mockConstructions;

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

  // Monthly completions trend (last 6 months)
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
        month: key,
        label,
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

  // Recent activity - sorted by last update
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
      <div className="space-y-6 max-w-[1400px]">
        {/* Hero Banner */}
        <div className="relative rounded-2xl overflow-hidden shadow-xl">
          <img src={fiberHero} alt="Fiber Optic Network" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
          <div className="relative z-10 px-8 py-8 flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-1 w-8 rounded-full cosmote-gradient" />
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">FTTH Operations</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">Πίνακας Ελέγχου</h1>
              <p className="text-sm text-white/60 max-w-md">
                Διαχείριση αυτοψιών, κατασκευών & υλικών — Δίκτυο Οπτικών Ινών Ρόδος & Κως
                {!hasRealData && <span className="ml-2 text-[11px] rounded-full bg-white/10 text-white/50 px-2 py-0.5 font-medium">demo</span>}
              </p>
            </div>
            <div className="hidden md:flex items-center gap-6">
              <div className="text-center">
                <p className="text-3xl font-extrabold text-white font-mono">{assignments.length}</p>
                <p className="text-[10px] uppercase tracking-wider text-white/50 mt-0.5">Αναθέσεις</p>
              </div>
              <div className="h-10 w-px bg-white/15" />
              <div className="text-center">
                <p className="text-3xl font-extrabold text-white font-mono">{constructions.length}</p>
                <p className="text-[10px] uppercase tracking-wider text-white/50 mt-0.5">Κατασκευές</p>
              </div>
              <div className="h-10 w-px bg-white/15" />
              <div className="text-center">
                <p className="text-3xl font-extrabold text-white font-mono">{totalProfit.toLocaleString('el-GR')}€</p>
                <p className="text-[10px] uppercase tracking-wider text-white/50 mt-0.5">Κέρδος</p>
              </div>
              <div className="ml-4">
                <SyncButton />
              </div>
            </div>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <StatCard title="Ενεργές Αναθέσεις" value={activeAssignments} subtitle={`${completedAssignments} ολοκληρωμένες`} icon={ClipboardCheck} trend="up" trendValue={`${assignments.length} σύνολο`} />
          <StatCard title="Αναμονή ΟΤΕ" value={waitingOte} subtitle="σε αναμονή απάντησης" icon={Timer} />
          <StatCard title="Κατασκευές" value={activeConstructions} subtitle="σε εξέλιξη" icon={Wrench} accent />
          <StatCard title="Έσοδα" value={`${totalRevenue.toLocaleString('el-GR')}€`} subtitle="Σύνολο κατασκευών" icon={Euro} trend="up" trendValue={`${totalProfit.toLocaleString('el-GR')}€ κέρδος`} />
          <StatCard title="Καθαρό Κέρδος" value={`${totalProfit.toLocaleString('el-GR')}€`} subtitle={`${totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0}% margin`} icon={TrendingUp} trend={totalProfit > 0 ? 'up' : 'down'} trendValue={`${constructions.length} κατασκευές`} accent />
          <StatCard title="Drive Folders" value={withDrive} subtitle={`από ${assignments.length} αναθέσεις`} icon={FolderOpen} />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Status Bar Chart */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              Κατάσταση Αναθέσεων
            </h2>
            <ChartContainer config={chartConfig} className="h-[220px] w-full">
              <BarChart data={statusCounts} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <XAxis dataKey="label" tick={{ fill: "hsl(220 10% 46%)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(220 10% 46%)", fontSize: 11 }} axisLine={false} tickLine={false} width={25} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={36}>
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
              <CalendarDays className="h-4 w-4 text-accent" />
              Μηνιαία Ολοκλήρωση & Έσοδα
            </h2>
            <ChartContainer config={trendConfig} className="h-[220px] w-full">
              <BarChart data={monthlyTrend} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 10% 90%)" />
                <XAxis dataKey="label" tick={{ fill: "hsl(220 10% 46%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(220 10% 46%)", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="completed" name="Ολοκληρωμένα" fill="hsl(152 60% 42%)" radius={[6, 6, 0, 0]} barSize={24} />
              </BarChart>
            </ChartContainer>
          </div>

          {/* Revenue vs Cost Pie Chart */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
              <PieChartIcon className="h-4 w-4 text-accent" />
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
                  <ChartContainer config={pieConfig} className="h-[180px] w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        strokeWidth={2}
                        stroke="hsl(0 0% 100%)"
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="flex justify-center gap-5 mt-2">
                    {pieData.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                        <span className="text-muted-foreground">{item.name}</span>
                        <span className="font-mono font-semibold text-foreground">{item.value.toLocaleString('el-GR')}€</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Recent Activity + Quick Stats */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Recent Activity */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
              <Activity className="h-4 w-4 text-accent" />
              Πρόσφατη Δραστηριότητα
            </h2>
            <div className="space-y-3">
              {recentActivity.map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-xs rounded-lg px-3 py-2.5 bg-muted/50 hover:bg-muted transition-colors">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-background"
                    style={{ backgroundColor: STATUS_COLORS[item.status] || "hsl(220 10% 46%)" }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-mono font-semibold text-foreground">{item.srId}</span>
                    <span className="text-muted-foreground ml-2">{item.area}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-[10px] px-2 py-0.5 rounded bg-muted">
                    {item.label}
                  </span>
                  {item.timeAgo && (
                    <span className="text-muted-foreground/60 shrink-0 font-mono text-[10px]">{item.timeAgo}</span>
                  )}
                  <span className="text-muted-foreground shrink-0 font-mono text-[10px]">{item.date}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Revenue Trend Line */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
              <TrendingUp className="h-4 w-4 text-primary" />
              Τάση Εσόδων / Κέρδους
            </h2>
            <ChartContainer config={trendConfig} className="h-[220px] w-full">
              <LineChart data={monthlyTrend} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 10% 90%)" />
                <XAxis dataKey="label" tick={{ fill: "hsl(220 10% 46%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(220 10% 46%)", fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="revenue" name="Έσοδα" stroke="hsl(220 70% 55%)" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="profit" name="Κέρδος" stroke="hsl(152 60% 42%)" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ChartContainer>
          </div>
        </div>

        {/* Recent Assignments Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <h2 className="font-bold text-sm">Πρόσφατες Αναθέσεις</h2>
            </div>
            <span className="text-[11px] text-muted-foreground font-mono bg-muted px-2.5 py-1 rounded-full">{assignments.length} εγγραφές</span>
          </div>
          <AssignmentTable assignments={[...assignments].sort((a, b) => (b.updatedAt || b.date).localeCompare(a.updatedAt || a.date)).slice(0, 5)} />
        </div>
      </div>
    </AppLayout>
  );
};

export default Index;
