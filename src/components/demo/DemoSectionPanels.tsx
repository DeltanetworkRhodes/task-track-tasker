import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatCard from "@/components/StatCard";
import { statusLabels, constructionStatusLabels } from "@/data/mockData";
import { toast } from "sonner";
import {
  ClipboardList, Wrench, Euro, TrendingUp, Package, FileText,
  BarChart3, CalendarDays, UserCog, Settings, Search, AlertTriangle,
  Check, Clock, Users, Phone, MapPin, Hash, Layers, Eye
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
  { id: "a6", srId: "SR-2025-0106", area: "Κως Πόλη", status: "pending", customerName: "Σ. Γεωργίου", technician: "—", phone: "6955567890", address: "Ιπποκράτους 11", cab: "CAB-310", date: "2025-03-07" },
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

const DEMO_TECHNICIAN_KPIS = [
  { name: "Γ. Αλεξίου", completed: 4, active: 1, avgDays: 8.2, revenue: 8100, profit: 6695, rate: 80 },
  { name: "Ν. Δημητρίου", completed: 0, active: 3, avgDays: 0, revenue: 0, profit: -275, rate: 0 },
];

// ═══ Section Components ═══

const cStatusColors: Record<string, string> = {
  in_progress: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  completed: "bg-green-500/10 text-green-600 border-green-500/20",
  invoiced: "bg-blue-500/10 text-blue-600 border-blue-500/20",
};

export const DemoAssignmentsPanel = () => {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  const tabs = [
    { key: "all", label: "Όλα" },
    { key: "active", label: "Ενεργά" },
    { key: "completed", label: "Ολοκληρωμένα" },
    { key: "cancelled", label: "Ακυρωμένα" },
  ];

  const filtered = DEMO_ASSIGNMENTS_FULL.filter(a => {
    if (search && !a.srId.toLowerCase().includes(search.toLowerCase()) && !a.customerName.toLowerCase().includes(search.toLowerCase()) && !a.area.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === "active") return !["completed", "cancelled"].includes(a.status);
    if (tab === "completed") return a.status === "completed";
    if (tab === "cancelled") return a.status === "cancelled";
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /> Αναθέσεις</h1>
        <button onClick={() => toast.info("Demo Mode — Η δημιουργία δεν είναι διαθέσιμη")} className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">+ Νέα Ανάθεση</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Αναζήτηση SR, πελάτη, περιοχή..." className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">SR ID</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Περιοχή</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden sm:table-cell">Πελάτης</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden md:table-cell">Τεχνικός</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden lg:table-cell">CAB</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Κατάσταση</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => toast.info(`${a.srId} — ${a.customerName}`)}>
                  <td className="px-4 py-3 font-bold text-primary">{a.srId}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.area}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{a.customerName}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{a.technician}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{a.cab}</td>
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
        <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">{filtered.length} εγγραφές</div>
      </div>
    </div>
  );
};

export const DemoConstructionsPanel = () => {
  const totalRevenue = DEMO_CONSTRUCTIONS_FULL.reduce((s, c) => s + c.revenue, 0);
  const totalCost = DEMO_CONSTRUCTIONS_FULL.reduce((s, c) => s + c.materialCost, 0);
  const totalProfit = DEMO_CONSTRUCTIONS_FULL.reduce((s, c) => s + c.profit, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" /> Κατασκευές</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="Σύνολο" value={DEMO_CONSTRUCTIONS_FULL.length} icon={Wrench} />
        <StatCard title="Έσοδα" value={`${totalRevenue.toLocaleString("el-GR")}€`} icon={Euro} />
        <StatCard title="Κόστος" value={`${totalCost.toLocaleString("el-GR")}€`} icon={AlertTriangle} />
        <StatCard title="Κέρδος" value={`${totalProfit.toLocaleString("el-GR")}€`} icon={TrendingUp} accent />
      </div>

      {/* Mobile cards */}
      <div className="block md:hidden space-y-2">
        {DEMO_CONSTRUCTIONS_FULL.map(c => (
          <Card key={c.id} className="cursor-pointer" onClick={() => toast.info(`${c.srId} — Demo Mode`)}>
            <CardContent className="p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-primary text-sm">{c.srId}</span>
                <Badge variant="outline" className={`text-[10px] ${cStatusColors[c.status] || ""}`}>
                  {(constructionStatusLabels as any)[c.status] || c.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5"><Hash className="h-3 w-3" /><span className="font-bold">{c.sesId}</span></div>
                <div className="flex items-center gap-1.5"><Layers className="h-3 w-3" /><span>{c.floors} όροφοι</span></div>
              </div>
              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/30 text-xs">
                <span className="font-bold">{c.revenue > 0 ? `${c.revenue.toLocaleString()}€` : "—"}</span>
                <span className="text-destructive font-bold">-{c.materialCost}€</span>
                <span className={`font-bold ${c.profit >= 0 ? "text-green-600" : "text-destructive"}`}>{c.profit >= 0 ? "+" : ""}{c.profit.toLocaleString()}€</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">SR ID</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">SES ID</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Α/Κ</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">CAB</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Όροφοι</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Κατάσταση</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Έσοδα</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Κόστος</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Κέρδος</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_CONSTRUCTIONS_FULL.map(c => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => toast.info(`${c.srId} — Demo Mode`)}>
                  <td className="px-4 py-3 font-bold text-primary">{c.srId}</td>
                  <td className="px-4 py-3 font-bold">{c.sesId}</td>
                  <td className="px-4 py-3">{c.ak}</td>
                  <td className="px-4 py-3">{c.cab}</td>
                  <td className="px-4 py-3 text-center">{c.floors}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={`text-[10px] ${cStatusColors[c.status] || ""}`}>
                      {(constructionStatusLabels as any)[c.status] || c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">{c.revenue > 0 ? `${c.revenue.toLocaleString()}€` : "—"}</td>
                  <td className="px-4 py-3 text-right font-bold text-destructive">{c.materialCost}€</td>
                  <td className={`px-4 py-3 text-right font-bold ${c.profit >= 0 ? "text-green-600" : "text-destructive"}`}>{c.profit >= 0 ? "+" : ""}{c.profit.toLocaleString()}€</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const DemoMaterialsPanel = () => {
  const [tab, setTab] = useState<"OTE" | "DELTA">("OTE");
  const oteMaterials = DEMO_MATERIALS.filter(m => m.source === "OTE");
  const deltaMaterials = DEMO_MATERIALS.filter(m => m.source === "DELTANETWORK");
  const lowStock = DEMO_MATERIALS.filter(m => m.stock < 100).length;
  const materials = tab === "OTE" ? oteMaterials : deltaMaterials;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Package className="h-5 w-5 text-primary" /> Αποθήκη Υλικών</h1>
        <button onClick={() => toast.info("Demo Mode — Η προσθήκη δεν είναι διαθέσιμη")} className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">+ Νέο Υλικό</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard title="Σύνολο Υλικών" value={DEMO_MATERIALS.length} icon={Package} />
        <StatCard title="OTE" value={oteMaterials.length} icon={Package} />
        <StatCard title="Χαμηλό Απόθεμα" value={lowStock} icon={AlertTriangle} accent />
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab("OTE")} className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${tab === "OTE" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>OTE ({oteMaterials.length})</button>
        <button onClick={() => setTab("DELTA")} className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${tab === "DELTA" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>DELTANETWORK ({deltaMaterials.length})</button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Κωδικός</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Περιγραφή</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Απόθεμα</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Τιμή</th>
              </tr>
            </thead>
            <tbody>
              {materials.map(m => (
                <tr key={m.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-bold text-primary">{m.code}</td>
                  <td className="px-4 py-3 text-foreground">{m.name}</td>
                  <td className="px-4 py-3 text-right font-bold">
                    <span className="inline-flex items-center gap-1">
                      {m.stock < 100 && <AlertTriangle className="h-3 w-3 text-destructive" />}
                      {m.stock} {/^τεμ/i.test(m.unit) ? "τεμάχια" : m.unit}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-muted-foreground">{m.price === 0 ? "—" : `${m.price.toFixed(2)}€`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const DemoWorkPricingPanel = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Τιμοκατάλογος Εργασιών</h1>
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full font-bold">{DEMO_WORK_PRICING.length} εργασίες</span>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Κωδικός</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Περιγραφή</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden sm:table-cell">Κατηγορία</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Μονάδα</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Τιμή Μον.</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_WORK_PRICING.map(w => (
                <tr key={w.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-bold text-primary">{w.code}</td>
                  <td className="px-4 py-3 text-foreground">{w.description}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <Badge variant="outline" className="text-[10px]">{w.category}</Badge>
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{w.unit}</td>
                  <td className="px-4 py-3 text-right font-bold">{w.unitPrice.toFixed(2)}€</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const DemoProfitPanel = () => {
  const totalRevenue = DEMO_PROFIT_PER_SR.reduce((s, p) => s + p.revenue, 0);
  const totalExpenses = DEMO_PROFIT_PER_SR.reduce((s, p) => s + p.expenses, 0);
  const totalProfit = DEMO_PROFIT_PER_SR.reduce((s, p) => s + p.profit, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Κέρδος ανά SR</h1>

      <div className="grid grid-cols-3 gap-3">
        <StatCard title="Συν. Έσοδα" value={`${totalRevenue.toLocaleString("el-GR")}€`} icon={Euro} />
        <StatCard title="Συν. Έξοδα" value={`${totalExpenses.toLocaleString("el-GR")}€`} icon={AlertTriangle} />
        <StatCard title="Καθαρό Κέρδος" value={`${totalProfit.toLocaleString("el-GR")}€`} icon={TrendingUp} accent />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">SR ID</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Έσοδα</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Έξοδα</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Κέρδος</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Margin</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_PROFIT_PER_SR.map(p => (
                <tr key={p.srId} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-bold text-primary">{p.srId}</td>
                  <td className="px-4 py-3 text-right font-bold">{p.revenue.toLocaleString()}€</td>
                  <td className="px-4 py-3 text-right font-bold text-destructive">{p.expenses}€</td>
                  <td className="px-4 py-3 text-right font-bold text-green-600">+{p.profit.toLocaleString()}€</td>
                  <td className="px-4 py-3 text-right font-bold">{Math.round((p.profit / p.revenue) * 100)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 font-bold">
                <td className="px-4 py-3">Σύνολα</td>
                <td className="px-4 py-3 text-right">{totalRevenue.toLocaleString()}€</td>
                <td className="px-4 py-3 text-right text-destructive">{totalExpenses.toLocaleString()}€</td>
                <td className="px-4 py-3 text-right text-green-600">+{totalProfit.toLocaleString()}€</td>
                <td className="px-4 py-3 text-right">{Math.round((totalProfit / totalRevenue) * 100)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export const DemoKPIsPanel = () => {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /> KPIs Τεχνικών</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {DEMO_TECHNICIAN_KPIS.map(t => (
          <Card key={t.name}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{t.name.charAt(0)}</div>
                {t.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-extrabold text-foreground">{t.completed}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Ολοκληρωμένα</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-foreground">{t.active}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Ενεργά</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-foreground">{t.avgDays > 0 ? t.avgDays : "—"}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Μ.Ο. Ημέρες</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/50 flex justify-between text-xs">
                <span className="text-muted-foreground">Έσοδα: <strong className="text-foreground">{t.revenue.toLocaleString()}€</strong></span>
                <span className={`font-bold ${t.profit >= 0 ? "text-green-600" : "text-destructive"}`}>{t.profit >= 0 ? "+" : ""}{t.profit.toLocaleString()}€</span>
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Completion Rate</span>
                  <span className="font-bold">{t.rate}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${t.rate}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export const DemoSurveysPanel = () => {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Search className="h-5 w-5 text-primary" /> Αυτοψίες</h1>

      <div className="grid grid-cols-2 gap-3">
        <StatCard title="Σύνολο" value={DEMO_SURVEYS.length} icon={Search} />
        <StatCard title="Εκκρεμείς" value={DEMO_SURVEYS.filter(s => s.status === "pending").length} icon={Clock} accent />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">SR ID</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Περιοχή</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden sm:table-cell">Τεχνικός</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Κατάσταση</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden sm:table-cell">Ημ/νία</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_SURVEYS.map(s => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-bold text-primary">{s.srId}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.area}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{s.technician}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={`text-[10px] ${s.status === "completed" ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"}`}>
                      {s.status === "completed" ? "Ολοκληρωμένη" : "Εκκρεμής"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{s.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const DemoCalendarPanel = () => {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Ημερολόγιο</h1>

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
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><UserCog className="h-5 w-5 text-primary" /> Χρήστες</h1>
        <button onClick={() => toast.info("Demo Mode — Η δημιουργία δεν είναι διαθέσιμη")} className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">+ Νέος Χρήστης</button>
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
                <Badge variant="outline" className={`text-[10px] ${roleColors[u.role] || ""}`}>{roleLabels[u.role] || u.role}</Badge>
              </div>
              <div className="mt-3 pt-3 border-t border-border/50 flex justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{u.area}</span>
                <span className="flex items-center gap-1"><ClipboardList className="h-3 w-3" />{u.assignments} αναθέσεις</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export const DemoSettingsPanel = () => {
  const settings = [
    { label: "Όνομα Οργανισμού", value: "DELTANETWORK" },
    { label: "Email Ειδοποιήσεων", value: "ops@deltanetwork.gr" },
    { label: "Google Drive Sync", value: "Ενεργό" },
    { label: "Auto-pricing", value: "Ενεργό" },
    { label: "Low Stock Alerts", value: "< 100 τεμάχια" },
    { label: "Πλάνο", value: "Professional" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Settings className="h-5 w-5 text-primary" /> Ρυθμίσεις</h1>

      <Card>
        <CardContent className="p-0">
          {settings.map((s, i) => (
            <div key={i} className={`flex items-center justify-between px-4 py-3.5 ${i < settings.length - 1 ? "border-b border-border/50" : ""}`}>
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <span className="text-sm font-bold text-foreground">{s.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <button onClick={() => toast.info("Demo Mode — Οι ρυθμίσεις δεν αποθηκεύονται")} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
        Αποθήκευση Ρυθμίσεων
      </button>
    </div>
  );
};
