import AppLayout from "@/components/AppLayout";
import StatCard from "@/components/StatCard";
import AssignmentTable from "@/components/AssignmentTable";
import SyncButton from "@/components/SyncButton";
import { useAssignments, useConstructions } from "@/hooks/useData";
import { mockAssignments, mockConstructions, statusLabels } from "@/data/mockData";
import { ClipboardCheck, Wrench, TrendingUp, Euro, FolderOpen, Activity } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, Cell, PieChart, Pie } from "recharts";

const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(45 90% 55%)",
  inspection: "hsl(175 85% 45%)",
  pre_committed: "hsl(215 70% 55%)",
  construction: "hsl(280 60% 55%)",
  completed: "hsl(145 70% 48%)",
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
    comments: a.comments || '',
    photos: a.photos_count || 0,
    driveUrl: a.drive_folder_url || '',
  })) : mockAssignments;

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

  const activeAssignments = assignments.filter(a => a.status !== 'completed').length;
  const completedAssignments = assignments.filter(a => a.status === 'completed').length;
  const totalRevenue = constructions.reduce((sum, c) => sum + c.revenue, 0);
  const totalProfit = constructions.reduce((sum, c) => sum + c.profit, 0);
  const activeConstructions = constructions.filter(c => c.status === 'in_progress').length;
  const withDrive = assignments.filter(a => (a as any).driveUrl).length;

  // Status distribution for chart
  const statusCounts = Object.entries(
    assignments.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([status, count]) => ({
    status,
    label: (statusLabels as any)[status] || status,
    count,
    fill: STATUS_COLORS[status] || "hsl(215 15% 48%)",
  }));

  const chartConfig = statusCounts.reduce((acc, s) => {
    acc[s.status] = { label: s.label, color: s.fill };
    return acc;
  }, {} as Record<string, { label: string; color: string }>);

  // Recent activity (last 5 sorted by date)
  const recentActivity = [...assignments]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6)
    .map(a => ({
      srId: a.srId,
      area: a.area,
      status: a.status,
      label: (statusLabels as any)[a.status] || a.status,
      date: a.date,
    }));

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Πίνακας Ελέγχου</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Επισκόπηση λειτουργιών FTTH
              {!hasRealData && <span className="ml-2 text-xs opacity-60">(demo data)</span>}
            </p>
          </div>
          <SyncButton />
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard title="Ενεργές Αναθέσεις" value={activeAssignments} subtitle={`${completedAssignments} ολοκληρωμένες`} icon={ClipboardCheck} trend="up" trendValue={`${assignments.length} σύνολο`} />
          <StatCard title="Κατασκευές" value={activeConstructions} subtitle="σε εξέλιξη" icon={Wrench} />
          <StatCard title="Έσοδα" value={`${totalRevenue.toLocaleString('el-GR')}€`} subtitle="Σύνολο κατασκευών" icon={Euro} trend="up" trendValue={`${totalProfit.toLocaleString('el-GR')}€ κέρδος`} />
          <StatCard title="Καθαρό Κέρδος" value={`${totalProfit.toLocaleString('el-GR')}€`} subtitle={`${totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0}% margin`} icon={TrendingUp} trend={totalProfit > 0 ? 'up' : 'down'} trendValue={`${constructions.length} κατασκευές`} />
          <StatCard title="Drive Folders" value={withDrive} subtitle={`από ${assignments.length} αναθέσεις`} icon={FolderOpen} />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Status Bar Chart */}
          <div className="lg:col-span-2 rounded-lg border border-border/50 bg-card p-5">
            <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              Κατανομή Κατάστασης Αναθέσεων
            </h2>
            <ChartContainer config={chartConfig} className="h-[220px] w-full">
              <BarChart data={statusCounts} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <XAxis dataKey="label" tick={{ fill: "hsl(215 15% 48%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(215 15% 48%)", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={40}>
                  {statusCounts.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>

          {/* Recent Activity */}
          <div className="rounded-lg border border-border/50 bg-card p-5">
            <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              Πρόσφατη Δραστηριότητα
            </h2>
            <div className="space-y-3">
              {recentActivity.map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[item.status] || "hsl(215 15% 48%)" }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-mono font-medium text-foreground">{item.srId}</span>
                    <span className="text-muted-foreground ml-2">{item.area}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0 font-mono">{item.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Assignments Table */}
        <div className="rounded-lg border border-border/50 bg-card">
          <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm">Πρόσφατες Αναθέσεις</h2>
            </div>
            <span className="text-xs text-muted-foreground font-mono">{assignments.length} εγγραφές</span>
          </div>
          <AssignmentTable assignments={assignments.slice(0, 5)} />
        </div>
      </div>
    </AppLayout>
  );
};

export default Index;
