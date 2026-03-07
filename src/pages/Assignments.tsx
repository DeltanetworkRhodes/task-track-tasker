import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import AssignmentTable from "@/components/AssignmentTable";
import CreateAssignmentDialog from "@/components/CreateAssignmentDialog";
import SyncButton from "@/components/SyncButton";
import { useAssignments } from "@/hooks/useData";
import { statusLabels } from "@/data/mockData";
import { ClipboardCheck, Filter, Search, Plus, UserX, CheckCircle2, XCircle, ListChecks, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const tabs = [
  { key: "active", label: "Ενεργές", icon: ListChecks },
  { key: "unassigned", label: "Χωρίς Ανάθεση", icon: UserX },
  { key: "completed", label: "Ολοκληρωμένες", icon: CheckCircle2 },
  { key: "cancelled", label: "Ακυρωμένες", icon: XCircle },
  { key: "all", label: "Όλες", icon: ClipboardCheck },
] as const;

const Assignments = () => {
  const { data: dbAssignments, isLoading } = useAssignments();
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("active");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const assignments = dbAssignments
    ? dbAssignments.map((a) => ({
        id: a.id,
        srId: a.sr_id,
        area: a.area,
        status: a.status as any,
        technician: "—",
        technicianId: a.technician_id || null,
        customerName: (a as any).customer_name || "",
        address: (a as any).address || "",
        cab: (a as any).cab || "",
        phone: (a as any).phone || "",
        sourceTab: (a as any).source_tab || "",
        date: a.created_at.split("T")[0],
        comments: a.comments || "",
        photos: a.photos_count || 0,
        driveUrl: a.drive_folder_url || "",
        driveEgrafaUrl: (a as any).drive_egrafa_url || "",
        drivePromeletiUrl: (a as any).drive_promeleti_url || "",
      }))
    : [];

  const areas = [...new Set(assignments.map((a) => a.area))].sort();
  const sources = [...new Set(assignments.map((a: any) => a.sourceTab).filter(Boolean))].sort();

  // Tab counts
  const tabCounts = useMemo(() => ({
    active: assignments.filter(a => a.status !== "cancelled" && a.status !== "completed").length,
    unassigned: assignments.filter(a => !(a as any).technicianId).length,
    completed: assignments.filter(a => a.status === "completed").length,
    cancelled: assignments.filter(a => a.status === "cancelled").length,
    all: assignments.length,
  }), [assignments]);

  const filtered = assignments.filter((a) => {
    const q = search.toLowerCase();
    if (activeTab === "active" && (a.status === "cancelled" || a.status === "completed")) return false;
    if (activeTab === "cancelled" && a.status !== "cancelled") return false;
    if (activeTab === "completed" && a.status !== "completed") return false;
    if (activeTab === "unassigned" && (a as any).technicianId) return false;
    if (areaFilter !== "all" && a.area !== areaFilter) return false;
    if (sourceFilter !== "all" && (a as any).sourceTab !== sourceFilter) return false;
    if (q && !a.srId.toLowerCase().includes(q) && !(a as any).customerName?.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <AppLayout>
      <div className="space-y-5 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Πυλώνας 1 — Αυτοψίες & Προδεσμεύσεις</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Διαχείριση αρχικών επισκέψεων και εγγράφων αυτοψίας
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Νέα Ανάθεση</span>
              <span className="sm:hidden">Νέα</span>
            </Button>
            <SyncButton />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            const count = tabCounts[tab.key as keyof typeof tabCounts];
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all shrink-0 ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <tab.icon className="h-3.5 w-3.5 shrink-0" />
                {tab.label}
                <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-muted-foreground"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Αναζήτηση SR ID ή πελάτη..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-card pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-muted-foreground/60 transition-all"
            />
          </div>
          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="all">Όλες οι περιοχές</option>
            {areas.map((area) => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
          {sources.length > 0 && (
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="all">Όλες οι πηγές</option>
              {sources.map((src) => (
                <option key={src} value={src}>{src}</option>
              ))}
            </select>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 sm:px-5 py-3 sm:py-4">
            <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
            <h2 className="font-bold text-sm">
              {tabs.find(t => t.key === activeTab)?.label || "Αναθέσεις"}
            </h2>
            <span className="ml-auto text-[10px] sm:text-xs text-muted-foreground font-bold bg-muted px-2 py-0.5 rounded-full">
              {filtered.length} / {assignments.length}
            </span>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-3">
                  <Skeleton className="h-4 w-20 rounded-lg" />
                  <Skeleton className="h-4 w-16 rounded-lg" />
                  <Skeleton className="h-4 w-32 rounded-lg flex-1" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-4 w-16 rounded-lg" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Δεν βρέθηκαν αναθέσεις σε αυτή τη κατηγορία</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <AssignmentTable assignments={filtered} />
            </div>
          )}
        </div>

        <CreateAssignmentDialog open={showCreate} onOpenChange={setShowCreate} />
      </div>
    </AppLayout>
  );
};

export default Assignments;
