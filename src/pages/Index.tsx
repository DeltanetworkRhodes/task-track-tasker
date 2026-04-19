import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import AppLayout from "@/components/AppLayout";
import deltaLogoIcon from "@/assets/delta-logo-icon.png";
import StatCard from "@/components/StatCard";
import AssignmentTable from "@/components/AssignmentTable";

import SetupWizard from "@/components/SetupWizard";
import PaymentTracker from "@/components/PaymentTracker";
import CallDashboardWidget from "@/components/CallDashboardWidget";
import AdminNextUpHero from "@/components/admin/AdminNextUpHero";
import AdminOutlierBanner from "@/components/admin/AdminOutlierBanner";
import FreshnessIndicator from "@/components/technician/FreshnessIndicator";
import { useAssignments, useConstructions } from "@/hooks/useData";
import { statusLabels } from "@/data/mockData";
import { ClipboardCheck, Wrench, TrendingUp, Euro, Activity, Wifi, PieChartIcon, CalendarDays, Timer, Zap, Wallet } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, Cell, PieChart, Pie, LineChart, Line, CartesianGrid, ResponsiveContainer } from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";


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
  construction: "hsl(280 55% 52%)",
  completed: "hsl(220 70% 55%)",
  submitted: "hsl(187 70% 50%)",
  paid: "hsl(152 60% 42%)",
  rejected: "hsl(0 60% 50%)",
  cancelled: "hsl(0 60% 50%)",
};

const GREEK_MONTHS: Record<number, string> = {
  0: "Ιαν", 1: "Φεβ", 2: "Μαρ", 3: "Απρ", 4: "Μαϊ", 5: "Ιουν",
  6: "Ιουλ", 7: "Αυγ", 8: "Σεπ", 9: "Οκτ", 10: "Νοε", 11: "Δεκ",
};

const Index = () => {
  const [wizardDismissed, setWizardDismissed] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const { data: dbAssignments } = useAssignments();
  const { data: dbConstructions } = useConstructions();

  const { data: wizardCompleted } = useQuery({
    queryKey: ["setup-wizard-status", organizationId],
    queryFn: async () => {
      if (!organizationId) return false;
      const { data } = await supabase
        .from("org_settings")
        .select("setting_value")
        .eq("organization_id", organizationId)
        .eq("setting_key", "setup_wizard_completed")
        .maybeSingle();
      return data?.setting_value === "true";
    },
    enabled: !!organizationId,
  });

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
      driveEgrafaUrl: (a as any).drive_egrafa_url || '',
      drivePromeletiUrl: (a as any).drive_promeleti_url || '',
      callStatus: (a as any).call_status || 'not_called',
      callNotes: (a as any).call_notes || '',
      lastCalledAt: (a as any).last_called_at || null,
      callCount: (a as any).call_count || 0,
      appointmentAt: (a as any).appointment_at || null,
      call_status: (a as any).call_status || 'not_called',
      customer_name: (a as any).customer_name || '',
      appointment_at: (a as any).appointment_at || null,
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

  const activeAssignments = assignments.filter(a => !["completed", "cancelled", "submitted", "paid", "rejected"].includes(a.status)).length;
  const completedAssignments = assignments.filter(a => a.status === "completed" || a.status === "submitted" || a.status === "paid").length;
  const pendingPayments = assignments.filter(a => a.status === "submitted");
  const pendingPaymentTotal = (dbAssignments || [])
    .filter((a: any) => a.status === "submitted")
    .reduce((s: number, a: any) => s + (Number((a as any).payment_amount) || 0), 0);
  
  const totalRevenue = constructions.reduce((sum, c) => sum + c.revenue, 0);
  const totalProfit = constructions.reduce((sum, c) => sum + c.profit, 0);
  const activeConstructions = constructions.filter(c => c.status === 'in_progress').length;
  

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
    const months: { month: string; label: string; completed: number; revenue: number; profit: number; prevCompleted: number; prevRevenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = GREEK_MONTHS[d.getMonth()];
      const monthAssignments = assignments.filter(a => a.date.startsWith(key) && a.status === 'completed');
      const monthConstructions = constructions.filter(c => c.date.startsWith(key));

      // Previous month for comparison
      const pd = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const prevKey = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
      const prevCompleted = assignments.filter(a => a.date.startsWith(prevKey) && a.status === 'completed').length;
      const prevRevenue = constructions.filter(c => c.date.startsWith(prevKey)).reduce((s, c) => s + c.revenue, 0);

      months.push({
        month: key, label,
        completed: monthAssignments.length,
        revenue: monthConstructions.reduce((s, c) => s + c.revenue, 0),
        profit: monthConstructions.reduce((s, c) => s + c.profit, 0),
        prevCompleted, prevRevenue,
      });
    }
    return months;
  }, [assignments, constructions]);

  // Month-over-month changes for current month
  const momChanges = useMemo(() => {
    if (monthlyTrend.length < 2) return null;
    const curr = monthlyTrend[monthlyTrend.length - 1];
    const prev = monthlyTrend[monthlyTrend.length - 2];
    const pctChange = (c: number, p: number) => p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 100);
    return {
      completedPct: pctChange(curr.completed, prev.completed),
      revenuePct: pctChange(curr.revenue, prev.revenue),
      profitPct: pctChange(curr.profit, prev.profit),
    };
  }, [monthlyTrend]);

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

  // Next upcoming appointment org-wide (Fuselab "default view" hero)
  const nextAppointment = useMemo(() => {
    if (!dbAssignments) return null;
    const now = Date.now();
    const upcoming = (dbAssignments as any[])
      .filter(a => a.appointment_at && new Date(a.appointment_at).getTime() > now - 30 * 60_000)
      .filter(a => !["completed", "cancelled", "submitted", "paid", "rejected"].includes(a.status))
      .sort((a, b) => new Date(a.appointment_at).getTime() - new Date(b.appointment_at).getTime());
    return upcoming[0] || null;
  }, [dbAssignments]);

  // Outliers
  const { staleAssignments, missedAppointments, unpaidLong } = useMemo(() => {
    const now = Date.now();
    const stale: any[] = [];
    const missed: any[] = [];
    const unpaid: any[] = [];
    (dbAssignments || []).forEach((a: any) => {
      const isActive = !["completed", "cancelled", "submitted", "paid", "rejected"].includes(a.status);
      if (isActive) {
        const updatedAge = now - new Date(a.updated_at).getTime();
        if (updatedAge > 7 * 86400_000) stale.push(a);
        if (a.appointment_at) {
          const apptAge = now - new Date(a.appointment_at).getTime();
          if (apptAge > 60 * 60_000) missed.push(a);
        }
      }
      if (a.status === "submitted") {
        const submittedAge = now - new Date(a.submitted_at || a.updated_at).getTime();
        if (submittedAge > 30 * 86400_000) unpaid.push(a);
      }
    });
    return {
      staleAssignments: stale.slice(0, 5),
      missedAppointments: missed.slice(0, 5),
      unpaidLong: unpaid.slice(0, 5),
    };
  }, [dbAssignments]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["assignments"] });
    queryClient.invalidateQueries({ queryKey: ["constructions"] });
    setLastRefresh(Date.now());
  };

  return (
    <AppLayout>
      <div className="space-y-5 sm:space-y-6 w-full">
        {/* Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-2xl overflow-hidden shadow-xl bg-sidebar"
        >
          {/* Animated gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-sidebar via-sidebar-accent to-sidebar opacity-90" />
          <motion.div
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(330_100%_44%/0.18),transparent_60%)]"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute bottom-0 right-0 w-64 h-64 bg-[radial-gradient(circle,hsl(152_60%_42%/0.1),transparent_70%)]"
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="relative z-10 px-5 py-6 sm:px-8 sm:py-8">
            {/* Top row: logo + sync */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4 sm:gap-5">
                <motion.img
                  src={deltaLogoIcon}
                  alt="DeltaNetwork"
                  className="h-10 sm:h-12 w-auto object-contain drop-shadow-lg"
                  initial={{ scale: 0.8, rotate: -8, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 220, damping: 18 }}
                />
                <div className="h-8 sm:h-10 w-px bg-white/15" />
                <motion.div
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                >
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
                </motion.div>
              </div>

            </div>

            {/* Quick stats row */}
            <motion.div
              className="mt-5 grid grid-cols-3 gap-3 sm:flex sm:items-center sm:gap-6 lg:gap-8"
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1, delayChildren: 0.3 } } }}
            >
              {[
                { value: assignments.length, label: "Αναθέσεις" },
                { value: constructions.length, label: "Κατασκευές" },
                { value: `${totalProfit.toLocaleString('el-GR')}€`, label: "Κέρδος" },
              ].map((s, i) => (
                <motion.div
                  key={s.label}
                  className="text-center sm:text-left"
                  variants={{
                    hidden: { opacity: 0, y: 12 },
                    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 280, damping: 22 } },
                  }}
                >
                  <p className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums">{s.value}</p>
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-white/40 mt-0.5">{s.label}</p>
                </motion.div>
              ))}
            </motion.div>


          </div>
        </motion.div>

        {/* Freshness indicator */}
        <FreshnessIndicator lastUpdatedAt={lastRefresh} onRefresh={handleRefresh} />

        {/* Outliers banner */}
        <AdminOutlierBanner
          staleAssignments={staleAssignments}
          missedAppointments={missedAppointments}
          unpaidLong={unpaidLong}
        />

        {/* Next-up hero (org-wide next appointment) */}
        {nextAppointment && <AdminNextUpHero assignment={nextAppointment} />}

        {/* Setup Wizard */}
        {!wizardDismissed && !wizardCompleted && (
          <SetupWizard onDismiss={() => setWizardDismissed(true)} />
        )}

        {/* Dashboard Tabs */}
        <Tabs defaultValue="overview" className="space-y-5">
          <TabsList>
            <TabsTrigger value="overview">📊 Επισκόπηση</TabsTrigger>
            <TabsTrigger value="payments">💰 Πληρωμές</TabsTrigger>
          </TabsList>

          <TabsContent value="payments">
            <PaymentTracker />
          </TabsContent>

          <TabsContent value="overview" className="space-y-5">
        {/* Stat Cards - responsive grid */}
        <motion.div
          className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6"
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
        >
          {[
            <StatCard key="1" title="Ενεργές Αναθέσεις" value={activeAssignments} subtitle={`${completedAssignments} ολοκληρωμένες`} icon={ClipboardCheck} trend="up" trendValue={`${assignments.length} σύνολο`} />,
            <StatCard key="2" title="Προδεσμεύσεις" value={assignments.filter(a => a.status === 'pre_committed').length} subtitle="σε αναμονή GIS" icon={Timer} />,
            <StatCard key="3" title="Κατασκευές" value={activeConstructions} subtitle="σε εξέλιξη" icon={Wrench} accent />,
            <StatCard key="4" title="Έσοδα" value={`${totalRevenue.toLocaleString('el-GR')}€`} subtitle="κατασκευών" icon={Euro} trend="up" trendValue={`${totalProfit.toLocaleString('el-GR')}€ κέρδος`} />,
            <StatCard key="5" title="Καθαρό Κέρδος" value={`${totalProfit.toLocaleString('el-GR')}€`} subtitle={`${totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0}% margin`} icon={TrendingUp} trend={totalProfit > 0 ? 'up' : 'down'} trendValue={`${constructions.length} κατ.`} accent />,
            <StatCard key="6" title="Εκκρεμείς Πληρωμές" value={`${pendingPaymentTotal.toLocaleString('el-GR')}€`} subtitle={`${pendingPayments.length} SR`} icon={Wallet} accent />,
          ].map((card, i) => (
            <motion.div
              key={i}
              variants={{
                hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
                visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 260, damping: 24 } },
              }}
              whileHover={{ y: -3, transition: { type: "spring", stiffness: 400, damping: 25 } }}
            >
              {card}
            </motion.div>
          ))}
        </motion.div>

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
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-sm flex items-center gap-2 text-foreground">
              <CalendarDays className="h-4 w-4 text-accent shrink-0" />
              Μηνιαία Ολοκλήρωση
            </h2>
            {momChanges && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${momChanges.completedPct >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                {momChanges.completedPct >= 0 ? '↑' : '↓'} {Math.abs(momChanges.completedPct)}% vs προηγ.
              </span>
            )}
          </div>
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

        {/* Activity + Revenue Trend + Calls */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                    <span className="text-muted-foreground/60 shrink-0 font-bold text-[9px] sm:text-[10px]">{item.timeAgo}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Revenue Line Chart */}
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-sm flex items-center gap-2 text-foreground">
              <TrendingUp className="h-4 w-4 text-primary shrink-0" />
              Τάση Εσόδων / Κέρδους
            </h2>
            {momChanges && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${momChanges.revenuePct >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                {momChanges.revenuePct >= 0 ? '↑' : '↓'} {Math.abs(momChanges.revenuePct)}% έσοδα
              </span>
            )}
          </div>
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

          {/* Call Dashboard Widget */}
          <CallDashboardWidget assignments={assignments} />
        </div>

        {/* Recent Assignments Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 sm:px-5 py-3 sm:py-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
              <h2 className="font-bold text-sm">Πρόσφατες Αναθέσεις</h2>
            </div>
            <span className="text-[10px] sm:text-[11px] text-muted-foreground font-bold bg-muted px-2 sm:px-2.5 py-1 rounded-full">{assignments.length} εγγραφές</span>
          </div>
          <div className="overflow-x-auto">
            <AssignmentTable assignments={[...assignments].sort((a, b) => (b.updatedAt || b.date).localeCompare(a.updatedAt || a.date)).slice(0, 5)} />
          </div>
        </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Index;
