import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import AssignmentTable from "@/components/AssignmentTable";
import CreateAssignmentDialog from "@/components/CreateAssignmentDialog";
import SyncButton from "@/components/SyncButton";
import { useAssignments } from "@/hooks/useData";
import { mockAssignments } from "@/data/mockData";
import { ClipboardCheck, Filter, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const Assignments = () => {
  const { data: dbAssignments, isLoading } = useAssignments();
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const hasRealData = (dbAssignments?.length ?? 0) > 0;

  const assignments = hasRealData
    ? dbAssignments!.map((a) => ({
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
      }))
    : mockAssignments;

  // Get unique areas and sources for filters
  const areas = [...new Set(assignments.map((a) => a.area))].sort();
  const sources = [...new Set(assignments.map((a: any) => a.sourceTab).filter(Boolean))].sort();

  const filtered = assignments.filter((a) => {
    const q = search.toLowerCase();
    if (statusFilter === "active" && (a.status === "cancelled" || a.status === "completed")) return false;
    if (statusFilter === "cancelled" && a.status !== "cancelled") return false;
    if (statusFilter === "completed" && a.status !== "completed") return false;
    if (statusFilter === "unassigned" && (a as any).technicianId) return false;
    if (areaFilter !== "all" && a.area !== areaFilter) return false;
    if (sourceFilter !== "all" && (a as any).sourceTab !== sourceFilter) return false;
    if (q && !a.srId.toLowerCase().includes(q) && !(a as any).customerName?.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Πυλώνας 1 — Αυτοψίες & Προδεσμεύσεις</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Διαχείριση αρχικών επισκέψεων και εγγράφων αυτοψίας
              {!hasRealData && <span className="ml-2 text-xs opacity-60">(demo data)</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Νέα Ανάθεση
            </Button>
            <SyncButton />
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Αναζήτηση SR ID ή πελάτη..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-md border border-border/50 bg-card pl-8 pr-3 py-1.5 text-xs w-56 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
          </div>
          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="rounded-md border border-border/50 bg-card px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">Όλες οι περιοχές</option>
            {areas.map((area) => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-border/50 bg-card px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="active">Ενεργές</option>
            <option value="all">Όλες</option>
            <option value="cancelled">Ακυρωμένες</option>
          </select>
          {sources.length > 0 && (
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-md border border-border/50 bg-card px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">Όλες οι πηγές</option>
              {sources.map((src) => (
                <option key={src} value={src}>{src}</option>
              ))}
            </select>
          )}
        </div>

        <div className="rounded-lg border border-border/50 bg-card">
          <div className="flex items-center gap-2 border-b border-border/50 px-5 py-4">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Όλες οι Αυτοψίες</h2>
            <span className="ml-auto text-xs text-muted-foreground font-mono">
              {filtered.length} / {assignments.length} εγγραφές
            </span>
          </div>
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Φόρτωση...</div>
          ) : (
            <AssignmentTable assignments={filtered} />
          )}
        </div>

        <CreateAssignmentDialog open={showCreate} onOpenChange={setShowCreate} />
      </div>
    </AppLayout>
  );
};

export default Assignments;
