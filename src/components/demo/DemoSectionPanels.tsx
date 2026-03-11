import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import StatCard from "@/components/StatCard";
import { statusLabels, constructionStatusLabels } from "@/data/mockData";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  ClipboardList, Wrench, Euro, TrendingUp, Package, FileText,
  BarChart3, CalendarDays, UserCog, Settings, Search, AlertTriangle,
  Check, Clock, Users, Phone, MapPin, Hash, Layers, Eye, Plus,
  ListChecks, UserX, CheckCircle2, XCircle, ClipboardCheck, Filter
} from "lucide-react";

// ═══ Shared mock data ═══

const statusColorClasses: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  inspection: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  pre_committed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  construction: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  completed: "bg-green-500/10 text-green-600 border-green-500/20",
  cancelled: "bg-red-500/10 text-red-600 border-red-500/20",
};

const DEMO_ASSIGNMENTS_FULL = [
  { id: "a1", srId: "SR-2025-0101", area: "Ρόδος Κέντρο", status: "completed", customerName: "Δ. Παπαδόπουλος", technician: "Γ. Αλεξίου", phone: "6971234567", address: "Λεωφ. Ελευθερίας 42", cab: "CAB-045", date: "2025-03-01" },
  { id: "a2", srId: "SR-2025-0102", area: "Ιαλυσός", status: "construction", customerName: "Μ. Κωνσταντίνου", technician: "Ν. Δημητρίου", phone: "6989876543", address: "Οδός Ηρώων 15", cab: "CAB-112", date: "2025-03-02" },
  { id: "a3", srId: "SR-2025-0103", area: "Φαληράκι", status: "completed", customerName: "Α. Ιωάννου", technician: "Γ. Αλεξίου", phone: "6945678901", address: "Πλ. Αγ. Παρασκευής 8", cab: "CAB-089", date: "2025-02-20" },
  { id: "a4", srId: "SR-2025-0104", area: "Κρεμαστή", status: "pre_committed", customerName: "Ε. Νικολάου", technician: "Ν. Δημητρίου", phone: "6932456789", address: "Κεντρική 22", cab: "CAB-067", date: "2025-03-05" },
  { id: "a5", srId: "SR-2025-0105", area: "Λίνδος", status: "inspection", customerName: "Κ. Βασιλείου", technician: "Γ. Αλεξίου", phone: "6978123456", address: "Αρχαία Λίνδος 3", cab: "CAB-201", date: "2025-03-06" },
  { id: "a6", srId: "SR-2025-0106", area: "Κως Πόλη", status: "pending", customerName: "Σ. Γεωργίου", technician: "", phone: "6955567890", address: "Ιπποκράτους 11", cab: "CAB-310", date: "2025-03-07" },
  { id: "a7", srId: "SR-2025-0107", area: "Καρδάμαινα", status: "construction", customerName: "Π. Μαρκόπουλος", technician: "Ν. Δημητρίου", phone: "6944321098", address: "Παραλία 5", cab: "CAB-155", date: "2025-02-28" },
  { id: "a8", srId: "SR-2025-0108", area: "Αρχάγγελος", status: "completed", customerName: "Θ. Καραγιάννης", technician: "Γ. Αλεξίου", phone: "6911223344", address: "Μοναστηρίου 7", cab: "CAB-078", date: "2025-02-15" },
  { id: "a9", srId: "SR-2025-0109", area: "Πεταλούδες", status: "cancelled", customerName: "Λ. Στεφάνου", technician: "Ν. Δημητρίου", phone: "6966778899", address: "Δασική 14", cab: "CAB-044", date: "2025-02-25" },
  { id: "a10", srId: "SR-2025-0110", area: "Κοσκινού", status: "completed", customerName: "Α. Χατζηδάκης", technician: "Γ. Αλεξίου", phone: "6933445566", address: "Πλατεία 1", cab: "CAB-033", date: "2025-01-20" },
];

const DEMO_CONSTRUCTIONS_FULL = [
  { id: "c1", srId: "SR-2025-0101", sesId: "SES-4421", ak: "AK-RHO-12", cab: "CAB-045", floors: 4, status: "completed", revenue: 2180, materialCost: 385, profit: 1795, date: "2025-03-01" },
  { id: "c2", srId: "SR-2025-0102", sesId: "SES-4425", ak: "AK-IAL-03", cab: "CAB-112", floors: 6, status: "in_progress", revenue: 0, materialCost: 180, profit: -180, date: "2025-03-02" },
  { id: "c3", srId: "SR-2025-0103", sesId: "SES-4418", ak: "AK-FAL-07", cab: "CAB-089", floors: 4, status: "invoiced", revenue: 1650, materialCost: 290, profit: 1360, date: "2025-02-20" },
  { id: "c4", srId: "SR-2025-0107", sesId: "SES-4430", ak: "AK-KRD-01", cab: "CAB-155", floors: 2, status: "in_progress", revenue: 0, materialCost: 95, profit: -95, date: "2025-02-28" },
  { id: "c5", srId: "SR-2025-0108", sesId: "SES-4415", ak: "AK-ARC-05", cab: "CAB-078", floors: 5, status: "completed", revenue: 2450, materialCost: 410, profit: 2040, date: "2025-02-15" },
  { id: "c6", srId: "SR-2025-0110", sesId: "SES-4410", ak: "AK-KOS-02", cab: "CAB-033", floors: 3, status: "invoiced", revenue: 1820, materialCost: 320, profit: 1500, date: "2025-01-20" },
];

const DEMO_MATERIALS = [
  { id: "m1", code: "FO-CBL-12", name: "Καλώδιο Οπτικής Ίνας 12F", stock: 2400, unit: "μ.", source: "OTE", price: 0 },
  { id: "m2", code: "FO-CBL-24", name: "Καλώδιο Οπτικής Ίνας 24F", stock: 1800, unit: "μ.", source: "OTE", price: 0 },
  { id: "m3", code: "SPR-20", name: "Σπιράλ Φ20", stock: 340, unit: "μ.", source: "DELTANETWORK", price: 1.20 },
  { id: "m4", code: "SPR-25", name: "Σπιράλ Φ25", stock: 180, unit: "μ.", source: "DELTANETWORK", price: 1.80 },
  { id: "m5", code: "RKR-20", name: "Ρακόρ Φ20", stock: 520, unit: "τεμ.", source: "DELTANETWORK", price: 0.45 },
  { id: "m6", code: "ODF-8", name: "ODF 8 θέσεων", stock: 25, unit: "τεμ.", source: "OTE", price: 0 },
  { id: "m7", code: "SPLC-SC", name: "Splitter SC/APC 1:8", stock: 45, unit: "τεμ.", source: "OTE", price: 0 },
  { id: "m8", code: "CLMP-SS", name: "Στηρίγματα Ανοξείδωτα", stock: 89, unit: "τεμ.", source: "DELTANETWORK", price: 2.30 },
  { id: "m9", code: "FO-CBL-48", name: "Καλώδιο Οπτικής Ίνας 48F", stock: 600, unit: "μ.", source: "OTE", price: 0 },
  { id: "m10", code: "TAPE-WR", name: "Ταινία Προειδ. Τηλεπ.", stock: 1200, unit: "μ.", source: "DELTANETWORK", price: 0.35 },
  { id: "m11", code: "BEP-8", name: "BEP 8 θέσεων", stock: 32, unit: "τεμ.", source: "OTE", price: 0 },
  { id: "m12", code: "FB-4", name: "Floor Box 4 θέσεων", stock: 68, unit: "τεμ.", source: "OTE", price: 0 },
];

const DEMO_WORK_PRICING = [
  { id: "w1", code: "FT-001", description: "Εγκατάσταση BEP", unit: "τεμ.", unitPrice: 85, category: "Εγκατάσταση" },
  { id: "w2", code: "FT-002", description: "Floor Box εγκατάσταση", unit: "τεμ.", unitPrice: 45, category: "Εγκατάσταση" },
  { id: "w3", code: "FT-003", description: "Πόρτα-πόρτα σύνδεση", unit: "τεμ.", unitPrice: 35, category: "Σύνδεση" },
  { id: "w4", code: "FT-004", description: "Εσωτερική όδευση σωλήνα", unit: "μ.", unitPrice: 4.50, category: "Όδευση" },
  { id: "w5", code: "FT-005", description: "Εξωτερική όδευση εναέρια", unit: "μ.", unitPrice: 6.80, category: "Όδευση" },
  { id: "w6", code: "FT-006", description: "Εκσκαφή πεζοδρομίου", unit: "μ.", unitPrice: 18.00, category: "Εκσκαφή" },
  { id: "w7", code: "FT-007", description: "Συγκόλληση ινών (splice)", unit: "τεμ.", unitPrice: 12.00, category: "Συγκόλληση" },
  { id: "w8", code: "FT-008", description: "Μέτρηση OTDR", unit: "τεμ.", unitPrice: 25.00, category: "Μέτρηση" },
  { id: "w9", code: "FT-009", description: "Εγκατάσταση BMO", unit: "τεμ.", unitPrice: 65.00, category: "Εγκατάσταση" },
  { id: "w10", code: "FT-010", description: "Αποκατάσταση πεζοδρομίου", unit: "μ²", unitPrice: 22.00, category: "Εκσκαφή" },
];

const DEMO_PROFIT_PER_SR = [
  { srId: "SR-2025-0101", revenue: 2180, expenses: 385, profit: 1795 },
  { srId: "SR-2025-0103", revenue: 1650, expenses: 290, profit: 1360 },
  { srId: "SR-2025-0108", revenue: 2450, expenses: 410, profit: 2040 },
  { srId: "SR-2025-0110", revenue: 1820, expenses: 320, profit: 1500 },
];

const DEMO_SURVEYS = [
  { id: "s1", srId: "SR-2025-0105", area: "Λίνδος", technician: "Γ. Αλεξίου", status: "pending", date: "2025-03-06" },
  { id: "s2", srId: "SR-2025-0101", area: "Ρόδος Κέντρο", technician: "Γ. Αλεξίου", status: "completed", date: "2025-02-28" },
  { id: "s3", srId: "SR-2025-0103", area: "Φαληράκι", technician: "Γ. Αλεξίου", status: "completed", date: "2025-02-18" },
  { id: "s4", srId: "SR-2025-0108", area: "Αρχάγγελος", technician: "Γ. Αλεξίου", status: "completed", date: "2025-02-12" },
];

const DEMO_CALENDAR_EVENTS = [
  { date: "2025-03-10", srId: "SR-2025-0105", type: "Αυτοψία", area: "Λίνδος" },
  { date: "2025-03-11", srId: "SR-2025-0104", type: "GIS Upload", area: "Κρεμαστή" },
  { date: "2025-03-12", srId: "SR-2025-0102", type: "Κατασκευή", area: "Ιαλυσός" },
  { date: "2025-03-13", srId: "SR-2025-0107", type: "Κατασκευή", area: "Καρδάμαινα" },
  { date: "2025-03-14", srId: "SR-2025-0106", type: "Ανάθεση", area: "Κως Πόλη" },
  { date: "2025-03-17", srId: "SR-2025-0102", type: "Ολοκλήρωση", area: "Ιαλυσός" },
];

const DEMO_USERS = [
  { id: "u1", name: "Γιώργος Αλεξίου", email: "g.alexiou@delta.gr", role: "technician", area: "Ρόδος", assignments: 6 },
  { id: "u2", name: "Νίκος Δημητρίου", email: "n.dimitriou@delta.gr", role: "technician", area: "Κως", assignments: 4 },
  { id: "u3", name: "Μαρία Ελευθερίου", email: "m.eleftheriou@delta.gr", role: "admin", area: "—", assignments: 0 },
  { id: "u4", name: "Δημήτρης Αντωνίου", email: "d.antoniou@delta.gr", role: "technician", area: "Ρόδος", assignments: 0 },
];

const cStatusColors: Record<string, string> = {
  in_progress: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  completed: "bg-green-500/10 text-green-600 border-green-500/20",
  invoiced: "bg-blue-500/10 text-blue-600 border-blue-500/20",
};

// ═══════════════════════════════════════════
//  PANEL 1: Assignments (matches Assignments.tsx)
// ═══════════════════════════════════════════

const assignmentTabs = [
  { key: "active", label: "Ενεργές", icon: ListChecks },
  { key: "unassigned", label: "Χωρίς Ανάθεση", icon: UserX },
  { key: "completed", label: "Ολοκληρωμένες", icon: CheckCircle2 },
  { key: "cancelled", label: "Ακυρωμένες", icon: XCircle },
  { key: "all", label: "Όλες", icon: ClipboardCheck },
] as const;

export const DemoAssignmentsPanel = () => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [areaFilter, setAreaFilter] = useState("all");

  const areas = [...new Set(DEMO_ASSIGNMENTS_FULL.map(a => a.area))].sort();

  const tabCounts = useMemo(() => ({
    active: DEMO_ASSIGNMENTS_FULL.filter(a => !["completed", "cancelled"].includes(a.status)).length,
    unassigned: DEMO_ASSIGNMENTS_FULL.filter(a => !a.technician).length,
    completed: DEMO_ASSIGNMENTS_FULL.filter(a => a.status === "completed").length,
    cancelled: DEMO_ASSIGNMENTS_FULL.filter(a => a.status === "cancelled").length,
    all: DEMO_ASSIGNMENTS_FULL.length,
  }), []);

  const filtered = useMemo(() => {
    return DEMO_ASSIGNMENTS_FULL.filter(a => {
      // Tab filter
      if (activeTab === "active" && ["completed", "cancelled"].includes(a.status)) return false;
      if (activeTab === "unassigned" && a.technician) return false;
      if (activeTab === "completed" && a.status !== "completed") return false;
      if (activeTab === "cancelled" && a.status !== "cancelled") return false;
      // Area filter
      if (areaFilter !== "all" && a.area !== areaFilter) return false;
      // Search
      if (search) {
        const s = search.toLowerCase();
        if (!a.srId.toLowerCase().includes(s) && !a.address.toLowerCase().includes(s) && !a.customerName.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [activeTab, areaFilter, search]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" /> Αναθέσεις
        </h1>
        <Button size="sm" onClick={() => toast.info("Demo mode — οι αλλαγές δεν αποθηκεύονται")}>
          <Plus className="h-4 w-4 mr-1" /> Νέα Ανάθεση
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {assignmentTabs.map(t => (
            <TabsTrigger key={t.key} value={t.key} className="gap-1.5 text-xs">
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] justify-center text-[10px]">
                {tabCounts[t.key]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Search + Area Chips */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Αναζήτηση SR ID ή διεύθυνση..."
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant={areaFilter === "all" ? "default" : "outline"}
          className="h-7 text-xs"
          onClick={() => setAreaFilter("all")}
        >
          Όλες
        </Button>
        {areas.map(area => (
          <Button
            key={area}
            size="sm"
            variant={areaFilter === area ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setAreaFilter(area)}
          >
            {area}
          </Button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">SR ID</TableHead>
              <TableHead className="text-xs">Περιοχή</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Πελάτης</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Τεχνικός</TableHead>
              <TableHead className="text-xs">Κατάσταση</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Ημερομηνία</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                  Δεν βρέθηκαν αναθέσεις
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(a => (
                <TableRow
                  key={a.id}
                  className="cursor-pointer"
                  onClick={() => toast.info(`${a.srId} — ${a.customerName}\n${a.address}`)}
                >
                  <TableCell className="font-bold text-primary text-xs">{a.srId}</TableCell>
                  <TableCell className="text-xs">{a.area}</TableCell>
                  <TableCell className="text-xs hidden sm:table-cell">{a.customerName}</TableCell>
                  <TableCell className="text-xs hidden md:table-cell">{a.technician || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${statusColorClasses[a.status] || ""}`}>
                      {(statusLabels as any)[a.status] || a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{a.date}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
          {filtered.length} εγγραφές
        </div>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════
//  PANEL 2: Constructions (matches Construction.tsx)
// ═══════════════════════════════════════════

export const DemoConstructionsPanel = () => {
  const [tab, setTab] = useState("all");

  const filtered = useMemo(() => {
    if (tab === "in_progress") return DEMO_CONSTRUCTIONS_FULL.filter(c => c.status === "in_progress");
    if (tab === "completed") return DEMO_CONSTRUCTIONS_FULL.filter(c => c.status === "completed");
    if (tab === "invoiced") return DEMO_CONSTRUCTIONS_FULL.filter(c => c.status === "invoiced");
    return DEMO_CONSTRUCTIONS_FULL;
  }, [tab]);

  const totalRevenue = filtered.reduce((s, c) => s + c.revenue, 0);
  const totalCost = filtered.reduce((s, c) => s + c.materialCost, 0);
  const totalProfit = filtered.reduce((s, c) => s + c.profit, 0);

  const tabCounts = {
    all: DEMO_CONSTRUCTIONS_FULL.length,
    in_progress: DEMO_CONSTRUCTIONS_FULL.filter(c => c.status === "in_progress").length,
    completed: DEMO_CONSTRUCTIONS_FULL.filter(c => c.status === "completed").length,
    invoiced: DEMO_CONSTRUCTIONS_FULL.filter(c => c.status === "invoiced").length,
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Wrench className="h-5 w-5 text-primary" /> Κατασκευές
      </h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="Σύνολο" value={filtered.length} icon={Wrench} />
        <StatCard title="Έσοδα" value={`${totalRevenue.toLocaleString("el-GR")}€`} icon={Euro} />
        <StatCard title="Κόστος Υλικών" value={`${totalCost.toLocaleString("el-GR")}€`} icon={AlertTriangle} />
        <StatCard title="Κέρδος" value={`${totalProfit.toLocaleString("el-GR")}€`} icon={TrendingUp} accent />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all" className="text-xs gap-1">
            Όλες <Badge variant="secondary" className="text-[10px] h-5">{tabCounts.all}</Badge>
          </TabsTrigger>
          <TabsTrigger value="in_progress" className="text-xs gap-1">
            Σε Εξέλιξη <Badge variant="secondary" className="text-[10px] h-5">{tabCounts.in_progress}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="text-xs gap-1">
            Ολοκληρωμένες <Badge variant="secondary" className="text-[10px] h-5">{tabCounts.completed}</Badge>
          </TabsTrigger>
          <TabsTrigger value="invoiced" className="text-xs gap-1">
            Τιμολογημένες <Badge variant="secondary" className="text-[10px] h-5">{tabCounts.invoiced}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">SR ID</TableHead>
              <TableHead className="text-xs">SES ID</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Α/Κ</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">CAB</TableHead>
              <TableHead className="text-xs text-center hidden md:table-cell">Όροφοι</TableHead>
              <TableHead className="text-xs text-right">Έσοδα</TableHead>
              <TableHead className="text-xs text-right hidden sm:table-cell">Κόστος</TableHead>
              <TableHead className="text-xs text-right">Κέρδος</TableHead>
              <TableHead className="text-xs">Κατάσταση</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(c => (
              <TableRow
                key={c.id}
                className="cursor-pointer"
                onClick={() => toast.info(`${c.srId} — Demo mode — οι αλλαγές δεν αποθηκεύονται`)}
              >
                <TableCell className="font-bold text-primary text-xs">{c.srId}</TableCell>
                <TableCell className="font-bold text-xs">{c.sesId}</TableCell>
                <TableCell className="text-xs hidden sm:table-cell">{c.ak}</TableCell>
                <TableCell className="text-xs hidden sm:table-cell">{c.cab}</TableCell>
                <TableCell className="text-xs text-center hidden md:table-cell">{c.floors}</TableCell>
                <TableCell className="text-xs text-right font-bold">
                  {c.revenue > 0 ? `${c.revenue.toLocaleString()}€` : "—"}
                </TableCell>
                <TableCell className="text-xs text-right font-bold text-destructive hidden sm:table-cell">
                  {c.materialCost}€
                </TableCell>
                <TableCell className={`text-xs text-right font-bold ${c.profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                  {c.profit >= 0 ? "+" : ""}{c.profit.toLocaleString()}€
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${cStatusColors[c.status] || ""}`}>
                    {(constructionStatusLabels as any)[c.status] || c.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="font-bold">
              <TableCell colSpan={5} className="text-xs">Σύνολα</TableCell>
              <TableCell className="text-xs text-right">{totalRevenue.toLocaleString()}€</TableCell>
              <TableCell className="text-xs text-right text-destructive hidden sm:table-cell">{totalCost.toLocaleString()}€</TableCell>
              <TableCell className={`text-xs text-right ${totalProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
                {totalProfit >= 0 ? "+" : ""}{totalProfit.toLocaleString()}€
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════
//  PANEL 3: Materials (matches Materials.tsx)
// ═══════════════════════════════════════════

export const DemoMaterialsPanel = () => {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("OTE");

  const oteMaterials = DEMO_MATERIALS.filter(m => m.source === "OTE");
  const deltaMaterials = DEMO_MATERIALS.filter(m => m.source === "DELTANETWORK");

  const materials = useMemo(() => {
    const source = tab === "OTE" ? oteMaterials : deltaMaterials;
    if (!search) return source;
    const s = search.toLowerCase();
    return source.filter(m => m.code.toLowerCase().includes(s) || m.name.toLowerCase().includes(s));
  }, [tab, search]);

  const lowStockCount = DEMO_MATERIALS.filter(m => m.stock < 50).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" /> Αποθήκη Υλικών
        </h1>
        <Button size="sm" onClick={() => toast.info("Demo mode — οι αλλαγές δεν αποθηκεύονται")}>
          <Plus className="h-4 w-4 mr-1" /> Νέο Υλικό
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard title="Σύνολο Υλικών" value={DEMO_MATERIALS.length} icon={Package} />
        <StatCard title="OTE" value={oteMaterials.length} icon={Package} />
        <StatCard title="Χαμηλό Απόθεμα" value={lowStockCount} icon={AlertTriangle} accent />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="OTE" className="text-xs gap-1">
            OTE Υλικά <Badge variant="secondary" className="text-[10px] h-5">{oteMaterials.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="DELTA" className="text-xs gap-1">
            DELTANETWORK Υλικά <Badge variant="secondary" className="text-[10px] h-5">{deltaMaterials.length}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Αναζήτηση κωδικού ή ονόματος..."
          className="pl-9"
        />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Κωδικός</TableHead>
              <TableHead className="text-xs">Περιγραφή</TableHead>
              <TableHead className="text-xs text-right">Απόθεμα</TableHead>
              <TableHead className="text-xs text-center hidden sm:table-cell">Μονάδα</TableHead>
              <TableHead className="text-xs text-right">Τιμή</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {materials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                  Δεν βρέθηκαν υλικά
                </TableCell>
              </TableRow>
            ) : (
              materials.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-bold text-primary text-xs">{m.code}</TableCell>
                  <TableCell className="text-xs">{m.name}</TableCell>
                  <TableCell className="text-xs text-right">
                    <span className="inline-flex items-center gap-1.5">
                      {m.stock}
                      {m.stock < 50 && (
                        <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                          Χαμηλό
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-center text-muted-foreground hidden sm:table-cell">{m.unit}</TableCell>
                  <TableCell className="text-xs text-right font-bold">
                    {m.price === 0 ? "—" : `${m.price.toFixed(2)}€`}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════
//  PANEL 4: KPIs (matches TechnicianKPIs.tsx)
// ═══════════════════════════════════════════

export const DemoKPIsPanel = () => {
  // Derive KPI data from assignments + constructions
  const techKpis = useMemo(() => {
    const technicians = [...new Set(DEMO_ASSIGNMENTS_FULL.map(a => a.technician).filter(Boolean))];
    return technicians.map(name => {
      const assignments = DEMO_ASSIGNMENTS_FULL.filter(a => a.technician === name);
      const completed = assignments.filter(a => a.status === "completed").length;
      const active = assignments.filter(a => !["completed", "cancelled"].includes(a.status)).length;
      const techSrIds = new Set(assignments.map(a => a.srId));
      const constructions = DEMO_CONSTRUCTIONS_FULL.filter(c => techSrIds.has(c.srId));
      const totalRevenue = constructions.reduce((s, c) => s + c.revenue, 0);
      const totalProfit = constructions.reduce((s, c) => s + c.profit, 0);
      const avgPerSr = completed > 0 ? Math.round(totalProfit / completed) : 0;
      return { name, completed, active, totalRevenue, totalProfit, avgPerSr, total: assignments.length };
    });
  }, []);

  const chartData = techKpis.map(t => ({
    name: t.name,
    profit: t.totalProfit,
    revenue: t.totalRevenue,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" /> KPIs Τεχνικών
      </h1>

      {/* Stat cards per technician */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {techKpis.map(t => (
          <Card key={t.name}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {t.name.charAt(0)}
                </div>
                {t.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-2xl font-extrabold text-foreground">{t.completed}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Ολοκληρωμένα</p>
                </div>
                <div>
                  <p className={`text-2xl font-extrabold ${t.totalProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
                    {t.totalProfit.toLocaleString()}€
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase">Κέρδος</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-foreground">{t.avgPerSr}€</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Μ.Τιμή/SR</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-foreground">{t.active}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Ενεργές</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Completion Rate</span>
                  <span className="font-bold">{t.total > 0 ? Math.round((t.completed / t.total) * 100) : 0}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${t.total > 0 ? (t.completed / t.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bar Chart: Profit per Technician */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">Κέρδος ανά Τεχνικό</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <Tooltip
                formatter={(value: number) => [`${value.toLocaleString()}€`]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="profit" name="Κέρδος" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    className={entry.profit >= 0 ? "fill-green-500" : "fill-destructive"}
                  />
                ))}
              </Bar>
              <Bar dataKey="revenue" name="Έσοδα" radius={[6, 6, 0, 0]} className="fill-primary/40" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════
//  Remaining panels (unchanged logic, kept as-is)
// ═══════════════════════════════════════════

export const DemoWorkPricingPanel = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> Τιμοκατάλογος Εργασιών
        </h1>
        <Badge variant="secondary" className="text-xs">{DEMO_WORK_PRICING.length} εργασίες</Badge>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Κωδικός</TableHead>
              <TableHead className="text-xs">Περιγραφή</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Κατηγορία</TableHead>
              <TableHead className="text-xs text-center">Μονάδα</TableHead>
              <TableHead className="text-xs text-right">Τιμή Μον.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DEMO_WORK_PRICING.map(w => (
              <TableRow key={w.id}>
                <TableCell className="font-bold text-primary text-xs">{w.code}</TableCell>
                <TableCell className="text-xs">{w.description}</TableCell>
                <TableCell className="text-xs hidden sm:table-cell">
                  <Badge variant="outline" className="text-[10px]">{w.category}</Badge>
                </TableCell>
                <TableCell className="text-xs text-center text-muted-foreground">{w.unit}</TableCell>
                <TableCell className="text-xs text-right font-bold">{w.unitPrice.toFixed(2)}€</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export const DemoProfitPanel = () => {
  const totalRevenue = DEMO_PROFIT_PER_SR.reduce((s, p) => s + p.revenue, 0);
  const totalExpenses = DEMO_PROFIT_PER_SR.reduce((s, p) => s + p.expenses, 0);
  const totalProfit = DEMO_PROFIT_PER_SR.reduce((s, p) => s + p.profit, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" /> Κέρδος ανά SR
      </h1>

      <div className="grid grid-cols-3 gap-3">
        <StatCard title="Συν. Έσοδα" value={`${totalRevenue.toLocaleString("el-GR")}€`} icon={Euro} />
        <StatCard title="Συν. Έξοδα" value={`${totalExpenses.toLocaleString("el-GR")}€`} icon={AlertTriangle} />
        <StatCard title="Καθαρό Κέρδος" value={`${totalProfit.toLocaleString("el-GR")}€`} icon={TrendingUp} accent />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">SR ID</TableHead>
              <TableHead className="text-xs text-right">Έσοδα</TableHead>
              <TableHead className="text-xs text-right">Έξοδα</TableHead>
              <TableHead className="text-xs text-right">Κέρδος</TableHead>
              <TableHead className="text-xs text-right">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DEMO_PROFIT_PER_SR.map(p => (
              <TableRow key={p.srId}>
                <TableCell className="font-bold text-primary text-xs">{p.srId}</TableCell>
                <TableCell className="text-xs text-right font-bold">{p.revenue.toLocaleString()}€</TableCell>
                <TableCell className="text-xs text-right font-bold text-destructive">{p.expenses}€</TableCell>
                <TableCell className="text-xs text-right font-bold text-green-600">+{p.profit.toLocaleString()}€</TableCell>
                <TableCell className="text-xs text-right font-bold">{Math.round((p.profit / p.revenue) * 100)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="font-bold">
              <TableCell className="text-xs">Σύνολα</TableCell>
              <TableCell className="text-xs text-right">{totalRevenue.toLocaleString()}€</TableCell>
              <TableCell className="text-xs text-right text-destructive">{totalExpenses.toLocaleString()}€</TableCell>
              <TableCell className="text-xs text-right text-green-600">+{totalProfit.toLocaleString()}€</TableCell>
              <TableCell className="text-xs text-right">{Math.round((totalProfit / totalRevenue) * 100)}%</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
    </div>
  );
};

export const DemoSurveysPanel = () => {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Search className="h-5 w-5 text-primary" /> Αυτοψίες
      </h1>

      <div className="grid grid-cols-2 gap-3">
        <StatCard title="Σύνολο" value={DEMO_SURVEYS.length} icon={Search} />
        <StatCard title="Εκκρεμείς" value={DEMO_SURVEYS.filter(s => s.status === "pending").length} icon={Clock} accent />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">SR ID</TableHead>
              <TableHead className="text-xs">Περιοχή</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Τεχνικός</TableHead>
              <TableHead className="text-xs">Κατάσταση</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Ημ/νία</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DEMO_SURVEYS.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-bold text-primary text-xs">{s.srId}</TableCell>
                <TableCell className="text-xs">{s.area}</TableCell>
                <TableCell className="text-xs hidden sm:table-cell">{s.technician}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${s.status === "completed" ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"}`}>
                    {s.status === "completed" ? "Ολοκληρωμένη" : "Εκκρεμής"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{s.date}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export const DemoCalendarPanel = () => {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-primary" /> Ημερολόγιο
      </h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DEMO_CALENDAR_EVENTS.map((ev, i) => (
          <Card key={i} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => toast.info(`${ev.srId} — ${ev.type}`)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-primary">{ev.srId}</span>
                <Badge variant="outline" className="text-[10px]">{ev.type}</Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                <span>{ev.date}</span>
                <span className="text-foreground/30">·</span>
                <MapPin className="h-3 w-3" />
                <span>{ev.area}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export const DemoUsersPanel = () => {
  const roleLabels: Record<string, string> = { admin: "Διαχειριστής", technician: "Τεχνικός" };
  const roleColors: Record<string, string> = { admin: "bg-purple-500/10 text-purple-600 border-purple-500/20", technician: "bg-blue-500/10 text-blue-600 border-blue-500/20" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <UserCog className="h-5 w-5 text-primary" /> Χρήστες
        </h1>
        <Button size="sm" onClick={() => toast.info("Demo mode — οι αλλαγές δεν αποθηκεύονται")}>
          <Plus className="h-4 w-4 mr-1" /> Νέος Χρήστης
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DEMO_USERS.map(u => (
          <Card key={u.id}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary shrink-0">
                  {u.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">{u.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${roleColors[u.role] || ""}`}>
                  {roleLabels[u.role] || u.role}
                </Badge>
              </div>
              <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{u.area}</span>
                <span>{u.assignments} αναθέσεις</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export const DemoSettingsPanel = () => {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" /> Ρυθμίσεις
      </h1>
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <Settings className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Οι ρυθμίσεις δεν είναι διαθέσιμες σε Demo Mode</p>
        </CardContent>
      </Card>
    </div>
  );
};
