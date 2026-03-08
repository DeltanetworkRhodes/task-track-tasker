import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { useDemo } from "@/contexts/DemoContext";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, ClipboardList, AlertTriangle, Shield, Wrench, Euro, TrendingUp, Timer, FolderOpen, Activity, CalendarDays, PieChart as PieChartIcon, LayoutDashboard, Search, Package, FileText, BarChart3, UserCog, Settings, Menu, X, Sun, Moon } from "lucide-react";
import {
  DemoAssignmentsPanel, DemoConstructionsPanel, DemoMaterialsPanel,
  DemoWorkPricingPanel, DemoProfitPanel, DemoKPIsPanel, DemoSurveysPanel,
  DemoCalendarPanel, DemoUsersPanel, DemoSettingsPanel
} from "@/components/demo/DemoSectionPanels";
import TechnicianAssignments from "@/components/TechnicianAssignments";
import StatCard from "@/components/StatCard";
import { statusLabels } from "@/data/mockData";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, Cell, PieChart, Pie, LineChart, Line, CartesianGrid } from "recharts";
import deltaLogoIcon from "@/assets/delta-logo-icon.png";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";
import { toast } from "sonner";

const DemoBanner = () => (
  <div className="bg-yellow-500 text-yellow-950 text-center text-xs font-bold py-2 px-4 flex items-center justify-center gap-2 safe-top">
    <AlertTriangle className="h-3.5 w-3.5" />
    Περιβάλλον Επίδειξης — Οι αλλαγές δεν αποθηκεύονται
    <AlertTriangle className="h-3.5 w-3.5" />
  </div>
);

const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(38 92% 50%)",
  inspection: "hsl(330 100% 44%)",
  pre_committed: "hsl(220 70% 55%)",
  construction: "hsl(280 55% 52%)",
  completed: "hsl(152 60% 42%)",
  cancelled: "hsl(0 60% 50%)",
};

const statusColorClasses: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  inspection: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  pre_committed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  construction: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  completed: "bg-green-500/10 text-green-600 border-green-500/20",
  cancelled: "bg-red-500/10 text-red-600 border-red-500/20",
};

// Demo sidebar nav items
const DEMO_NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "assignments", label: "Αναθέσεις", icon: ClipboardList },
  { key: "surveys", label: "Αυτοψίες", icon: Search },
  { key: "construction", label: "Κατασκευές", icon: Wrench },
  { key: "documents", label: "AS-BUILD", icon: FileSpreadsheet },
  { key: "materials", label: "Αποθήκη", icon: Package },
  { key: "work-pricing", label: "Τιμοκατάλογος", icon: FileText },
  { key: "profit", label: "Κέρδος/SR", icon: TrendingUp },
  { key: "kpis", label: "KPIs Τεχνικών", icon: BarChart3 },
  { key: "calendar", label: "Ημερολόγιο", icon: CalendarDays },
  { key: "users", label: "Χρήστες", icon: UserCog },
  { key: "settings", label: "Ρυθμίσεις", icon: Settings },
];

// Extended demo data for admin view
const DEMO_ADMIN_ASSIGNMENTS = [
  { id: "a1", srId: "SR-2025-0101", area: "Ρόδος Κέντρο", status: "completed", customerName: "Δ. Παπαδόπουλος", technician: "Γ. Αλεξίου", date: "2025-03-01", cab: "CAB-045" },
  { id: "a2", srId: "SR-2025-0102", area: "Ιαλυσός", status: "construction", customerName: "Μ. Κωνσταντίνου", technician: "Ν. Δημητρίου", date: "2025-03-02", cab: "CAB-112" },
  { id: "a3", srId: "SR-2025-0103", area: "Φαληράκι", status: "completed", customerName: "Α. Ιωάννου", technician: "Γ. Αλεξίου", date: "2025-02-20", cab: "CAB-089" },
  { id: "a4", srId: "SR-2025-0104", area: "Κρεμαστή", status: "pre_committed", customerName: "Ε. Νικολάου", technician: "Ν. Δημητρίου", date: "2025-03-05", cab: "CAB-067" },
  { id: "a5", srId: "SR-2025-0105", area: "Λίνδος", status: "inspection", customerName: "Κ. Βασιλείου", technician: "Γ. Αλεξίου", date: "2025-03-06", cab: "CAB-201" },
  { id: "a6", srId: "SR-2025-0106", area: "Κως Πόλη", status: "pending", customerName: "Σ. Γεωργίου", technician: "—", date: "2025-03-07", cab: "CAB-310" },
  { id: "a7", srId: "SR-2025-0107", area: "Καρδάμαινα", status: "construction", customerName: "Π. Μαρκόπουλος", technician: "Ν. Δημητρίου", date: "2025-02-28", cab: "CAB-155" },
  { id: "a8", srId: "SR-2025-0108", area: "Αρχάγγελος", status: "completed", customerName: "Θ. Καραγιάννης", technician: "Γ. Αλεξίου", date: "2025-02-15", cab: "CAB-078" },
  { id: "a9", srId: "SR-2025-0109", area: "Πεταλούδες", status: "cancelled", customerName: "Λ. Στεφάνου", technician: "Ν. Δημητρίου", date: "2025-02-25", cab: "CAB-044" },
  { id: "a10", srId: "SR-2025-0110", area: "Κοσκινού", status: "completed", customerName: "Α. Χατζηδάκης", technician: "Γ. Αλεξίου", date: "2025-01-20", cab: "CAB-033" },
];

const DEMO_CONSTRUCTIONS = [
  { srId: "SR-2025-0101", revenue: 2180, materialCost: 385, profit: 1795, status: "completed" },
  { srId: "SR-2025-0103", revenue: 1650, materialCost: 290, profit: 1360, status: "completed" },
  { srId: "SR-2025-0108", revenue: 2450, materialCost: 410, profit: 2040, status: "completed" },
  { srId: "SR-2025-0110", revenue: 1820, materialCost: 320, profit: 1500, status: "completed" },
  { srId: "SR-2025-0102", revenue: 0, materialCost: 180, profit: -180, status: "in_progress" },
  { srId: "SR-2025-0107", revenue: 0, materialCost: 95, profit: -95, status: "in_progress" },
];

// ─── Demo Sidebar ───
const DemoSidebar = ({
  activeSection,
  onSectionChange,
  onClose,
  onExit,
}: {
  activeSection: string;
  onSectionChange: (s: string) => void;
  onClose?: () => void;
  onExit: () => void;
}) => {
  const { theme, setTheme } = useTheme();
  const activeConstructions = DEMO_CONSTRUCTIONS.filter(c => c.status === "in_progress").length;

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border overflow-hidden">
      <div className="h-0.5 w-full cosmote-gradient shrink-0" />
      <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
        <div className="flex-1 min-w-0">
          <img src={deltaLogoIcon} alt="DeltaNetwork" className="h-10 w-auto object-contain" />
          <p className="text-[9px] text-sidebar-foreground/50 uppercase tracking-widest mt-1 pl-0.5">FTTx Operations · Demo</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-sidebar-accent transition-colors lg:hidden">
          <X className="h-4 w-4 text-sidebar-foreground/60" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 px-3 pb-2">Μενού</p>
        {DEMO_NAV_ITEMS.map((item) => {
          const isActive = activeSection === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => {
                onSectionChange(item.key);
                onClose?.();
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all text-left ${
                isActive
                  ? "cosmote-gradient text-white font-semibold shadow-lg shadow-primary/20"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-white" : ""}`} />
              {item.label}
              {item.key === "construction" && activeConstructions > 0 && (
                <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-primary/10 text-primary"}`}>
                  {activeConstructions}
                </span>
              )}
              {isActive && !(item.key === "construction" && activeConstructions > 0) && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-4 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-bold text-sidebar-accent-foreground uppercase shrink-0">
            D
          </div>
          <p className="text-[11px] text-sidebar-foreground truncate flex-1">demo@deltanetwork.gr</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex items-center justify-center rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onExit}
            className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Έξοδος Demo
          </button>
        </div>
      </div>
    </aside>
  );
};

// ─── Section router for admin demo ───
const DemoSectionRouter = ({ section }: { section: string }) => {
  switch (section) {
    case "assignments": return <DemoAssignmentsPanel />;
    case "construction": return <DemoConstructionsPanel />;
    case "materials": return <DemoMaterialsPanel />;
    case "work-pricing": return <DemoWorkPricingPanel />;
    case "profit": return <DemoProfitPanel />;
    case "kpis": return <DemoKPIsPanel />;
    case "surveys": return <DemoSurveysPanel />;
    case "calendar": return <DemoCalendarPanel />;
    case "users": return <DemoUsersPanel />;
    case "settings": return <DemoSettingsPanel />;
    case "documents": return <DemoDocumentsPanel />;
    default: return null;
  }
};

// ─── Admin Dashboard Panel ───
const AdminDashboardPanel = () => {
  const assignments = DEMO_ADMIN_ASSIGNMENTS;
  const constructions = DEMO_CONSTRUCTIONS;

  const activeAssignments = assignments.filter(a => a.status !== "completed" && a.status !== "cancelled").length;
  const completedAssignments = assignments.filter(a => a.status === "completed").length;
  const totalRevenue = constructions.reduce((s, c) => s + c.revenue, 0);
  const totalProfit = constructions.reduce((s, c) => s + c.profit, 0);
  const activeConstructions = constructions.filter(c => c.status === "in_progress").length;
  const preCommitted = assignments.filter(a => a.status === "pre_committed").length;

  const statusCounts = Object.entries(
    assignments.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([status, count]) => ({
    status, label: (statusLabels as any)[status] || status, count, fill: STATUS_COLORS[status] || "hsl(220 10% 46%)",
  }));

  const chartConfig = statusCounts.reduce((acc, s) => { acc[s.status] = { label: s.label, color: s.fill }; return acc; }, {} as Record<string, { label: string; color: string }>);

  const monthlyTrend = [
    { label: "Οκτ", completed: 3, revenue: 4200, profit: 3100 },
    { label: "Νοε", completed: 5, revenue: 6800, profit: 5200 },
    { label: "Δεκ", completed: 4, revenue: 5500, profit: 4100 },
    { label: "Ιαν", completed: 2, revenue: 3640, profit: 2800 },
    { label: "Φεβ", completed: 6, revenue: 8900, profit: 6900 },
    { label: "Μαρ", completed: 4, revenue: 6280, profit: 4695 },
  ];

  const trendConfig = {
    completed: { label: "Ολοκληρωμένα", color: "hsl(152 60% 42%)" },
    revenue: { label: "Έσοδα", color: "hsl(220 70% 55%)" },
    profit: { label: "Κέρδος", color: "hsl(152 60% 42%)" },
  };

  const totalMaterialCost = constructions.reduce((s, c) => s + c.materialCost, 0);
  const pieData = [
    { name: "Καθαρό Κέρδος", value: Math.max(0, totalProfit), fill: "hsl(152 60% 42%)" },
    { name: "Κόστος Υλικών", value: totalMaterialCost, fill: "hsl(330 100% 44%)" },
  ];
  const pieConfig = {
    profit: { label: "Καθαρό Κέρδος", color: "hsl(152 60% 42%)" },
    cost: { label: "Κόστος Υλικών", color: "hsl(330 100% 44%)" },
  };

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      {/* Hero Banner */}
      <div className="relative rounded-2xl overflow-hidden shadow-xl bg-sidebar">
        <div className="absolute inset-0 bg-gradient-to-br from-sidebar via-sidebar-accent to-sidebar opacity-90" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(330_100%_44%/0.15),transparent_60%)]" />
        <div className="relative z-10 px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex items-center gap-4 sm:gap-5">
            <img src={deltaLogoIcon} alt="DeltaNetwork" className="h-10 sm:h-12 w-auto object-contain drop-shadow-lg" />
            <div className="h-8 sm:h-10 w-px bg-white/15" />
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <div className="h-0.5 w-5 rounded-full cosmote-gradient" />
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">Fiber to the X</span>
              </div>
              <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-white">Πίνακας Ελέγχου</h1>
              <p className="text-[10px] sm:text-xs text-white/45 mt-0.5">Διαχείριση δικτύου οπτικών ινών — Demo</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3 sm:flex sm:items-center sm:gap-6">
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
              <p className="text-2xl sm:text-3xl font-extrabold text-white">{totalProfit.toLocaleString("el-GR")}€</p>
              <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-white/40 mt-0.5">Κέρδος</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Ενεργές Αναθέσεις" value={activeAssignments} subtitle={`${completedAssignments} ολοκληρωμένες`} icon={ClipboardList} trend="up" trendValue={`${assignments.length} σύνολο`} />
        <StatCard title="Προδεσμεύσεις" value={preCommitted} subtitle="σε αναμονή GIS" icon={Timer} />
        <StatCard title="Κατασκευές" value={activeConstructions} subtitle="σε εξέλιξη" icon={Wrench} accent />
        <StatCard title="Έσοδα" value={`${totalRevenue.toLocaleString("el-GR")}€`} subtitle="κατασκευών" icon={Euro} trend="up" trendValue={`${totalProfit.toLocaleString("el-GR")}€ κέρδος`} />
        <StatCard title="Καθαρό Κέρδος" value={`${totalProfit.toLocaleString("el-GR")}€`} subtitle={`${totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0}% margin`} icon={TrendingUp} trend="up" trendValue={`${constructions.length} κατ.`} accent />
        <StatCard title="Drive Folders" value={6} subtitle={`από ${assignments.length}`} icon={FolderOpen} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
          <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
            <ClipboardList className="h-4 w-4 text-primary shrink-0" /> Κατάσταση Αναθέσεων
          </h2>
          <ChartContainer config={chartConfig} className="h-[200px] sm:h-[220px] w-full">
            <BarChart data={statusCounts} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={45} />
              <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={25} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={28}>
                {statusCounts.map((entry, i) => (<Cell key={i} fill={entry.fill} />))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
          <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
            <CalendarDays className="h-4 w-4 text-accent shrink-0" /> Μηνιαία Ολοκλήρωση
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

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm md:col-span-2 xl:col-span-1">
          <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
            <PieChartIcon className="h-4 w-4 text-accent shrink-0" /> Έσοδα vs Κόστος Υλικών
          </h2>
          <ChartContainer config={pieConfig} className="h-[160px] sm:h-[180px] w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} strokeWidth={2} stroke="hsl(var(--card))">
                {pieData.map((entry, i) => (<Cell key={i} fill={entry.fill} />))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="flex flex-wrap justify-center gap-4 mt-2">
            {pieData.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                <span className="text-muted-foreground">{item.name}</span>
                <span className="font-bold text-foreground">{item.value.toLocaleString("el-GR")}€</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity + Revenue */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
          <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
            <Activity className="h-4 w-4 text-accent shrink-0" /> Πρόσφατη Δραστηριότητα
          </h2>
          <div className="space-y-2">
            {assignments.slice(0, 8).map((a, i) => (
              <div key={i} className="flex items-center gap-2 sm:gap-3 text-xs rounded-lg px-2.5 sm:px-3 py-2 sm:py-2.5 bg-muted/50 hover:bg-muted transition-colors">
                <div className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full shrink-0 ring-2 ring-background" style={{ backgroundColor: STATUS_COLORS[a.status] }} />
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-foreground text-[11px] sm:text-xs">{a.srId}</span>
                  <span className="text-muted-foreground ml-1.5 text-[10px] hidden sm:inline">{a.area}</span>
                </div>
                <span className="text-muted-foreground shrink-0 text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-muted truncate max-w-[80px] sm:max-w-none">
                  {(statusLabels as any)[a.status] || a.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
          <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
            <TrendingUp className="h-4 w-4 text-primary shrink-0" /> Τάση Εσόδων / Κέρδους
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

      {/* Assignments Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 sm:px-5 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary shrink-0" />
            <h2 className="font-bold text-sm">Πρόσφατες Αναθέσεις</h2>
          </div>
          <span className="text-[10px] sm:text-[11px] text-muted-foreground font-bold bg-muted px-2.5 py-1 rounded-full">{assignments.length} εγγραφές</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">SR ID</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Περιοχή</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden sm:table-cell">Πελάτης</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden md:table-cell">Τεχνικός</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Κατάσταση</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-bold text-foreground">{a.srId}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.area}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{a.customerName}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{a.technician}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={`text-[10px] ${statusColorClasses[a.status] || ""}`}>
                      {(statusLabels as any)[a.status] || a.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Main Demo Dashboard ───
const DemoDashboard = () => {
  const { exitDemo, demoAssignments, demoProfile } = useDemo();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<"admin" | "technician">("admin");
  const [adminSection, setAdminSection] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hideCancelled, setHideCancelled] = useState(true);

  const handleExit = () => {
    exitDemo();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <DemoBanner />

      {/* Role toggle header */}
      <div className="border-b border-border bg-card/80 backdrop-blur-md px-4 py-2 flex items-center justify-between">
        <Tabs value={activeView} onValueChange={(v) => setActiveView(v as any)}>
          <TabsList className="h-8">
            <TabsTrigger value="admin" className="gap-1.5 text-[11px] px-3 py-1">
              <Shield className="h-3 w-3" /> Admin
            </TabsTrigger>
            <TabsTrigger value="technician" className="gap-1.5 text-[11px] px-3 py-1">
              <ClipboardList className="h-3 w-3" /> Τεχνικός
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <button onClick={handleExit} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors">
          <LogOut className="h-3.5 w-3.5" /> Έξοδος
        </button>
      </div>

      {activeView === "admin" ? (
        <div className="flex min-h-[calc(100vh-80px)]">
          {/* Mobile overlay */}
          {sidebarOpen && (
            <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
          )}

          {/* Sidebar */}
          <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:relative lg:z-auto ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
            <DemoSidebar
              activeSection={adminSection}
              onSectionChange={setAdminSection}
              onClose={() => setSidebarOpen(false)}
              onExit={handleExit}
            />
          </div>

          {/* Main content */}
          <main className="flex-1 min-h-full">
            {/* Mobile top bar */}
            <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 backdrop-blur-sm px-4 py-3 lg:hidden">
              <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 hover:bg-muted transition-colors">
                <Menu className="h-5 w-5 text-foreground" />
              </button>
              <img src={deltaLogoIcon} alt="DeltaNetwork" className="h-7 w-auto object-contain" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-widest">FTTx Demo</span>
            </div>

            <div className="p-4 sm:p-6">
              <div className="mx-auto max-w-7xl">
                {adminSection === "dashboard" ? (
                  <AdminDashboardPanel />
                ) : (
                  <DemoSectionRouter section={adminSection} />
                )}
              </div>
            </div>
          </main>
        </div>
      ) : (
        <div className="px-4 pt-4 pb-20">
          {/* Technician header */}
          <div className="mb-4 flex items-center gap-3">
            <img src={deltaLogoIcon} alt="DeltaNetwork" className="h-8 w-auto object-contain" />
            <div>
              <h1 className="text-lg font-bold text-foreground">DeltaNet FTTH</h1>
              <p className="text-xs text-muted-foreground">{demoProfile.full_name} · {demoProfile.area}</p>
            </div>
          </div>

          <div className="flex items-center justify-end mb-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={hideCancelled} onChange={(e) => setHideCancelled(e.target.checked)} className="rounded border-border" />
              Απόκρυψη ακυρωμένων
            </label>
          </div>
          <TechnicianAssignments
            assignments={demoAssignments.filter(a => hideCancelled ? a.status !== "cancelled" : true)}
            loading={false}
          />
        </div>
      )}
    </div>
  );
};

export default DemoDashboard;
