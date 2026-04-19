import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { LogOut, ClipboardList, MapPin, Search, X, Package } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import NotificationPermissionCard from "@/components/NotificationPermissionCard";
import TechnicianAssignments from "@/components/TechnicianAssignments";
import TechnicianMap from "@/components/TechnicianMap";
import GpsOnlineToggle from "@/components/GpsOnlineToggle";
import TechnicianInventoryView from "@/components/TechnicianInventoryView";

const statusFilters = [
  { value: "all", label: "Όλα" },
  { value: "pending", label: "Αναμονή", color: "bg-warning/15 text-warning border-warning/30" },
  { value: "inspection", label: "Αυτοψία", color: "bg-primary/15 text-primary border-primary/30" },
  { value: "pre_committed", label: "Προδέσμευση", color: "bg-accent/15 text-accent border-accent/30" },
  { value: "construction", label: "Κατασκευή", color: "bg-success/15 text-success border-success/30" },
];

const TechnicianDashboard = () => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("assignments");
  const [hideCancelled, setHideCancelled] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const hiddenStatuses = ["cancelled", "completed", "submitted", "paid", "rejected"];

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["technician-assignments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // 1) Assignments where user is main technician
      const { data: mainData, error: mainErr } = await supabase
        .from("assignments")
        .select("*")
        .eq("technician_id", user!.id)
        .order("updated_at", { ascending: false });
      if (mainErr) throw mainErr;

      // 2) Assignments where user is in a crew (additional/override)
      const { data: crewRows, error: crewErr } = await supabase
        .from("sr_crew_assignments" as any)
        .select("assignment_id")
        .eq("technician_id", user!.id);
      if (crewErr) throw crewErr;

      const mainIdSet = new Set((mainData || []).map((a) => a.id));
      const crewOnlyIds = Array.from(
        new Set((crewRows || []).map((r: any) => r.assignment_id as string))
      ).filter((id) => !mainIdSet.has(id));

      let crewData: typeof mainData = [];
      if (crewOnlyIds.length > 0) {
        const { data, error } = await supabase
          .from("assignments")
          .select("*")
          .in("id", crewOnlyIds);
        if (error) throw error;
        crewData = data || [];
      }

      const all = [...(mainData || []), ...crewData];
      all.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      return all;
    },
  });

  // Fetch real appointments from `appointments` table (set via Calendar / Call popover)
  // and merge them by sr_id so Dashboard widgets show the correct upcoming time.
  const srIds = useMemo(
    () => Array.from(new Set((assignments || []).map((a) => a.sr_id))).filter(Boolean),
    [assignments]
  );

  const { data: apptMap } = useQuery({
    queryKey: ["technician-appointments", user?.id, srIds.join(",")],
    enabled: !!user && srIds.length > 0,
    queryFn: async () => {
      const nowIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("appointments")
        .select("sr_id, appointment_at")
        .in("sr_id", srIds)
        .gte("appointment_at", nowIso)
        .order("appointment_at", { ascending: true });
      if (error) throw error;
      // Keep earliest upcoming per sr_id
      const map = new Map<string, string>();
      for (const row of data || []) {
        if (!map.has(row.sr_id)) map.set(row.sr_id, row.appointment_at);
      }
      return map;
    },
  });

  // Merge appointments into assignments (overrides assignment.appointment_at when present)
  const enrichedAssignments = useMemo(() => {
    if (!assignments) return assignments;
    return assignments.map((a) => {
      const realAppt = apptMap?.get(a.sr_id);
      return realAppt ? { ...a, appointment_at: realAppt } : a;
    });
  }, [assignments, apptMap]);

  const filteredAssignments = useMemo(() => {
    // Always hide cancelled and completed
    let list = (enrichedAssignments || []).filter(a => !hiddenStatuses.includes(a.status));
    
    // Status filter
    if (statusFilter !== "all") {
      list = list.filter(a => a.status === statusFilter);
    }
    
    // Search
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(a =>
        (a.sr_id && a.sr_id.toLowerCase().includes(q)) ||
        (a.address && a.address.toLowerCase().includes(q)) ||
        (a.area && a.area.toLowerCase().includes(q)) ||
        (a.customer_name && a.customer_name.toLowerCase().includes(q)) ||
        (a.building_id_hemd && a.building_id_hemd.toLowerCase().includes(q))
      );
    }

    // Sort: upcoming appointments first (earliest first), then the rest by updated_at desc
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    const sorted = [...list].sort((a, b) => {
      const aTime = a.appointment_at ? new Date(a.appointment_at).getTime() : null;
      const bTime = b.appointment_at ? new Date(b.appointment_at).getTime() : null;
      const aUpcoming = aTime !== null && aTime > cutoff;
      const bUpcoming = bTime !== null && bTime > cutoff;
      if (aUpcoming && bUpcoming) return aTime! - bTime!;
      if (aUpcoming) return -1;
      if (bUpcoming) return 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    return sorted;
  }, [enrichedAssignments, searchQuery, statusFilter]);

  // Count per status for chips
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const activeList = (enrichedAssignments || []).filter(a => !hiddenStatuses.includes(a.status));
    activeList.forEach(a => {
      counts[a.status] = (counts[a.status] || 0) + 1;
    });
    counts["all"] = activeList.length;
    return counts;
  }, [enrichedAssignments]);

  // Helper
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Καλημέρα" : hour < 17 ? "Καλησπέρα" : "Καλό βράδυ";
  const initials = (profile?.full_name || "?")
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const firstName = profile?.full_name?.split(" ")[0] || "—";

  const PHASE_COLORS: Record<number, string> = {
    1: "bg-warning/20 text-warning border border-warning/30",
    2: "bg-primary/20 text-primary border border-primary/30",
    3: "bg-accent/20 text-accent border border-accent/30",
  };
  const PHASE_LABELS: Record<number, string> = {
    1: "🚜 Χωματουργικά",
    2: "🔧 Οδεύσεις",
    3: "🔬 Κόλληση",
  };

  const activeCount = (enrichedAssignments || []).filter(
    (a) => !hiddenStatuses.includes(a.status)
  ).length;
  const constructionCount = (enrichedAssignments || []).filter(
    (a) => a.status === "construction"
  ).length;
  const todayAppts = (enrichedAssignments || []).filter((a) => {
    if (!a.appointment_at) return false;
    const d = new Date(a.appointment_at);
    const t = new Date();
    return (
      d.getDate() === t.getDate() &&
      d.getMonth() === t.getMonth() &&
      d.getFullYear() === t.getFullYear()
    );
  });
  // Count all upcoming appointments (today + future) for stats
  const upcomingApptsCount = (enrichedAssignments || []).filter((a) => {
    if (!a.appointment_at) return false;
    return new Date(a.appointment_at).getTime() > Date.now() - 6 * 60 * 60 * 1000;
  }).length;

  return (
    <div className="min-h-screen bg-background">
      {/* ── HEADER (Dark Industrial — admin palette) ── */}
      <header className="sticky top-0 z-50 bg-sidebar text-sidebar-foreground border-b border-sidebar-border shadow-xl">
        {/* Top row with subtle gradient */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-sidebar via-sidebar to-sidebar-accent/40">
          <div className="flex items-center gap-3">
            {/* Avatar — teal-to-green gradient ring */}
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-primary to-accent p-[2px] shrink-0 shadow-[0_0_12px_hsl(185_70%_42%/0.4)]">
              <div className="h-full w-full rounded-full bg-sidebar flex items-center justify-center">
                <span className="text-sm font-bold bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent">
                  {initials}
                </span>
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-sidebar-accent-foreground leading-tight">
                {greeting}, {firstName}!
              </p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {profile?.area && (
                  <span className="text-[11px] text-sidebar-foreground/70 flex items-center gap-0.5">
                    <MapPin className="h-3 w-3" />
                    {profile.area}
                  </span>
                )}
                {(profile as any)?.default_phase && (
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      PHASE_COLORS[(profile as any).default_phase as number]
                    }`}
                  >
                    {PHASE_LABELS[(profile as any).default_phase as number]}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <GpsOnlineToggle />
            <NotificationBell />
            <button
              onClick={signOut}
              className="h-9 w-9 rounded-xl border border-sidebar-border bg-sidebar-accent/40 flex items-center justify-center text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 divide-x divide-sidebar-border bg-sidebar-accent/30 border-t border-sidebar-border">
          {[
            { label: "Ενεργά", value: activeCount, color: "text-primary" },
            { label: "Κατασκευή", value: constructionCount, color: "text-accent" },
            { label: "Ραντεβού", value: upcomingApptsCount, color: "text-warning" },
          ].map((s) => (
            <div key={s.label} className="text-center py-2.5">
              <p className={`text-xl font-bold ${s.color} leading-tight`}>
                {s.value}
              </p>
              <p className="text-[10px] text-sidebar-foreground/60 mt-0.5 uppercase tracking-wider">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div className="flex border-t border-sidebar-border bg-sidebar">
          {[
            { id: "assignments", label: "Αναθέσεις", icon: ClipboardList },
            { id: "inventory", label: "Αποθήκη", icon: Package },
            { id: "map", label: "Χάρτης", icon: MapPin },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-all border-b-2 ${
                activeTab === tab.id
                  ? "border-primary text-primary bg-sidebar-accent/40"
                  : "border-transparent text-sidebar-foreground/60 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/20"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── CONTENT ── */}
      <div className="pb-6">
        {activeTab === "assignments" && (
          <div className="px-4 pt-4 space-y-3">
            <NotificationPermissionCard />

            {/* Today banner — gradient teal-to-green */}
            {todayAppts.length > 0 && (
              <div className="bg-gradient-to-br from-primary/10 via-card to-accent/10 border border-accent/30 rounded-2xl p-4 space-y-2 shadow-md">
                <div className="flex items-center gap-2 text-xs font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  <div className="h-2 w-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_hsl(var(--accent))]" />
                  Σήμερα — {todayAppts.length} ραντεβού
                </div>
                {todayAppts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between text-xs bg-card/80 rounded-xl px-3 py-2 border border-border"
                  >
                    <div>
                      <span className="font-bold text-primary">
                        {a.sr_id}
                      </span>
                      {a.address && (
                        <span className="text-muted-foreground ml-2">
                          {a.address.split(",")[0]}
                        </span>
                      )}
                    </div>
                    <span className="font-bold bg-gradient-to-r from-primary to-accent text-primary-foreground text-[10px] px-2 py-1 rounded-lg shadow-sm">
                      {new Date(a.appointment_at!).toLocaleTimeString("el-GR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Αναζήτηση SR, διεύθυνση..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9 h-11 text-sm rounded-xl bg-card border-border"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter chips */}
            <ScrollArea className="w-full">
              <div className="flex gap-2 pb-1">
                {statusFilters
                  .filter(
                    (s) =>
                      s.value === "all" ||
                      statusFilter === s.value ||
                      (statusCounts[s.value] || 0) > 0
                  )
                  .map((s) => {
                    const isActive = statusFilter === s.value;
                    const count = statusCounts[s.value] || 0;
                    return (
                      <button
                        key={s.value}
                        onClick={() => setStatusFilter(s.value)}
                        className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                          isActive
                            ? s.value === "all"
                              ? "bg-primary text-primary-foreground border-primary"
                              : (s.color || "") + " border-current"
                            : "bg-card text-muted-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {s.label}
                        <span
                          className={`text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${
                            isActive ? "bg-white/20" : "bg-muted-foreground/10"
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {filteredAssignments.length === 0 && !isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
                  <ClipboardList className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <p className="font-medium text-foreground text-sm">
                  Δεν βρέθηκαν αναθέσεις
                </p>
                <p className="text-xs text-muted-foreground">Ωραία δουλειά! 🎉</p>
              </div>
            ) : (
              <TechnicianAssignments
                assignments={filteredAssignments}
                loading={isLoading}
              />
            )}
          </div>
        )}

        {activeTab === "inventory" && (
          <div className="px-4 pt-4">
            <TechnicianInventoryView />
          </div>
        )}

        {activeTab === "map" && (
          <div className="pt-0">
            <TechnicianMap assignments={enrichedAssignments || []} />
          </div>
        )}
      </div>
    </div>
  );
};

export default TechnicianDashboard;
