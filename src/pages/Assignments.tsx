import { useState, useMemo, lazy, Suspense } from "react";
import AppLayout from "@/components/AppLayout";
import AssignmentTable from "@/components/AssignmentTable";
import CreateAssignmentDialog from "@/components/CreateAssignmentDialog";
import AssignmentsImport from "@/components/AssignmentsImport";
import SyncButton from "@/components/SyncButton";
import ConstructionProgressTab from "@/components/ConstructionProgressTab";
import { useAssignments } from "@/hooks/useData";
import { useUserRole } from "@/hooks/useUserRole";
import { statusLabels } from "@/data/mockData";
import { ClipboardCheck, Filter, Search, Plus, UserX, CheckCircle2, XCircle, ListChecks, AlertCircle, Radio, FileSpreadsheet, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const AdminLiveMap = lazy(() => import("@/components/AdminLiveMap"));

const tabs = [
  { key: "active", label: "Ενεργές", icon: ListChecks },
  { key: "construction", label: "Κατασκευές", icon: HardHat },
  { key: "unassigned", label: "Χωρίς Ανάθεση", icon: UserX },
  { key: "cancelled", label: "Ακυρωμένες", icon: XCircle },
  { key: "all", label: "Όλες", icon: ClipboardCheck },
] as const;

const Assignments = () => {
  const { data: dbAssignments, isLoading } = useAssignments();
  const { data: userRole } = useUserRole();
  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [callFilter, setCallFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("active");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
        callStatus: (a as any).call_status || "not_called",
        callNotes: (a as any).call_notes || "",
        lastCalledAt: (a as any).last_called_at || null,
        callCount: (a as any).call_count || 0,
        appointmentAt: (a as any).appointment_at || null,
        // New fields
        workType: (a as any).work_type || "",
        requestCategory: (a as any).request_category || "",
        floor: (a as any).floor || "",
        municipality: (a as any).municipality || "",
        customerMobile: (a as any).customer_mobile || "",
        customerLandline: (a as any).customer_landline || "",
        customerEmail: (a as any).customer_email || "",
        managerName: (a as any).manager_name || "",
        managerMobile: (a as any).manager_mobile || "",
        managerEmail: (a as any).manager_email || "",
        buildingId: (a as any).building_id_hemd || "",
        latitude: (a as any).latitude || null,
        longitude: (a as any).longitude || null,
      }))
    : [];

  const areas = [...new Set(assignments.map((a) => a.area))].sort();
  const sources = [...new Set(assignments.map((a: any) => a.sourceTab).filter(Boolean))].sort();

  // Tab counts — only pending + cancelled in this page
  const pendingOnly = assignments.filter(a => a.status === "pending");
  const tabCounts = useMemo(() => ({
    active: pendingOnly.length,
    unassigned: pendingOnly.filter(a => !(a as any).technicianId).length,
    cancelled: assignments.filter(a => a.status === "cancelled").length,
    all: pendingOnly.length + assignments.filter(a => a.status === "cancelled").length,
  }), [assignments]);

  const filtered = assignments.filter((a) => {
    const q = search.toLowerCase();
    // Only show pending + cancelled in this page
    const allowedStatuses = ["pending", "cancelled"];
    if (!allowedStatuses.includes(a.status)) return false;
    if (activeTab === "active" && a.status !== "pending") return false;
    if (activeTab === "cancelled" && a.status !== "cancelled") return false;
    if (activeTab === "unassigned" && ((a as any).technicianId || a.status === "cancelled")) return false;
    if (areaFilter !== "all" && a.area !== areaFilter) return false;
    if (sourceFilter !== "all" && (a as any).sourceTab !== sourceFilter) return false;
    if (callFilter !== "all") {
      const cs = (a as any).callStatus || "not_called";
      if (callFilter === "not_called" && cs !== "not_called") return false;
      if (callFilter === "callback" && cs !== "no_answer" && cs !== "sms_sent") return false;
      if (callFilter === "scheduled" && cs !== "scheduled") return false;
    }
    if (q && !a.srId.toLowerCase().includes(q) && !(a as any).customerName?.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <AppLayout>
      <div className="space-y-5 w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Πυλώνας 1 — Αυτοψίες & Προδεσμεύσεις</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Διαχείριση αρχικών επισκέψεων και εγγράφων αυτοψίας
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowImport(true)}>
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden sm:inline">Εισαγωγή Excel</span>
            </Button>
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
          {isAdmin && (
            <button
              onClick={() => setActiveTab("livemap")}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all shrink-0 ${
                activeTab === "livemap"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Radio className="h-3.5 w-3.5 shrink-0" />
              Live Map
            </button>
          )}
        </div>

        {activeTab === "livemap" ? (
          <Suspense fallback={<div className="p-12 text-center"><Skeleton className="h-[60vh] w-full rounded-xl" /></div>}>
            <AdminLiveMap />
          </Suspense>
        ) : (
          <>
            {/* Filters row */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="relative flex-1 min-w-0 max-w-xs">
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

            {/* Call Filter Chips */}
            {isAdmin && (
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                {[
                  { key: "all", label: "Όλες" },
                  { key: "not_called", label: "Δεν κλήθηκαν 🔴" },
                  { key: "callback", label: "Επανάκληση ⚠️" },
                  { key: "scheduled", label: "Ραντεβού ✅" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setCallFilter(f.key)}
                    className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      callFilter === f.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

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
                <div>
                  <AssignmentTable
                    assignments={filtered}
                    selectedIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                  />
                </div>
              )}
            </div>
          </>
        )}

        <CreateAssignmentDialog open={showCreate} onOpenChange={setShowCreate} />
        <AssignmentsImport open={showImport} onOpenChange={setShowImport} />
      </div>
    </AppLayout>
  );
};

export default Assignments;
