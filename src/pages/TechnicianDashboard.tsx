import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
    <div className="min-h-screen aurora-bg bg-background">
      {/* ── HEADER (Glassmorphism — calm refresh) ── */}
      <header className="sticky top-0 z-40 glass border-b border-border/40 safe-top">
        {/* Top row */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
              className="h-11 w-11 rounded-full bg-gradient-to-br from-primary via-accent to-primary p-[1.5px] shrink-0 shadow-[0_0_20px_hsl(185_70%_50%/0.35)]"
            >
              <div className="h-full w-full rounded-full bg-card/80 backdrop-blur-xl flex items-center justify-center">
                <span className="text-sm font-bold text-gradient-primary">
                  {initials}
                </span>
              </div>
            </motion.div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground/90 leading-tight truncate">
                {greeting}, <span className="text-gradient-primary font-bold">{firstName}</span>
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {profile?.area && (
                  <span className="text-[10.5px] text-muted-foreground flex items-center gap-0.5 font-medium">
                    <MapPin className="h-3 w-3" />
                    {profile.area}
                  </span>
                )}
                {(profile as any)?.default_phase && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md ${
                      PHASE_COLORS[(profile as any).default_phase as number]
                    }`}
                  >
                    {PHASE_LABELS[(profile as any).default_phase as number]}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <GpsOnlineToggle />
            <NotificationBell />
            <button
              onClick={signOut}
              aria-label="Logout"
              className="h-9 w-9 rounded-xl glass flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-card/80 transition-all"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stats — floating glass chips */}
        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          {[
            { label: "Ενεργά", value: activeCount, color: "from-primary/20 to-primary/5", text: "text-primary" },
            { label: "Κατασκευή", value: constructionCount, color: "from-accent/20 to-accent/5", text: "text-accent" },
            { label: "Ραντεβού", value: upcomingApptsCount, color: "from-warning/20 to-warning/5", text: "text-warning" },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className={`relative rounded-2xl p-2.5 bg-gradient-to-br ${s.color} border border-border/40 backdrop-blur-md overflow-hidden`}
            >
              <motion.p
                key={s.value}
                className={`text-xl font-bold ${s.text} leading-none tabular-nums`}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
              >
                {s.value}
              </motion.p>
              <p className="text-[9.5px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">
                {s.label}
              </p>
            </motion.div>
          ))}
        </div>
      </header>

      {/* ── CONTENT ── */}
      <div className="pb-32">
        <AnimatePresence mode="wait">
          {activeTab === "assignments" && (
            <motion.div
              key="assignments"
              initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="px-4 pt-4 space-y-3"
            >
              <NotificationPermissionCard />

              {todayAppts.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="glass-strong rounded-3xl p-4 space-y-2 shadow-[0_8px_30px_-8px_hsl(185_70%_42%/0.25)] relative overflow-hidden"
                >
                  <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br from-accent/40 to-primary/30 blur-3xl pointer-events-none" />
                  <div className="relative flex items-center gap-2 text-xs font-bold">
                    <div className="h-2 w-2 rounded-full bg-accent animate-pulse shadow-[0_0_10px_hsl(var(--accent))]" />
                    <span className="text-gradient-primary">
                      Σήμερα — {todayAppts.length} ραντεβού
                    </span>
                  </div>
                  {todayAppts.map((a, i) => (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.05 }}
                      className="relative flex items-center justify-between text-xs bg-card/70 backdrop-blur-md rounded-2xl px-3 py-2 border border-border/40"
                    >
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-primary text-[12px]">
                          {a.sr_id}
                        </span>
                        {a.address && (
                          <span className="text-muted-foreground ml-2 truncate">
                            {a.address.split(",")[0]}
                          </span>
                        )}
                      </div>
                      <span className="font-mono font-bold bg-gradient-to-r from-primary to-accent text-primary-foreground text-[10.5px] px-2 py-1 rounded-lg shadow-sm tabular-nums shrink-0">
                        {new Date(a.appointment_at!).toLocaleTimeString("el-GR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </span>
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                <Input
                  placeholder="Αναζήτηση SR, διεύθυνση..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10 h-12 text-sm rounded-2xl glass border-border/40 focus-visible:ring-2 focus-visible:ring-primary/40"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted/80 hover:bg-muted-foreground/20 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10"
                  >
                    <X className="h-3.5 w-3.5" />
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
                    .map((s, i) => {
                      const isActive = statusFilter === s.value;
                      const count = statusCounts[s.value] || 0;
                      return (
                        <motion.button
                          key={s.value}
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 + i * 0.04, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                          whileTap={{ scale: 0.94 }}
                          onClick={() => setStatusFilter(s.value)}
                          className={`relative flex-shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold backdrop-blur-md transition-colors ${
                            isActive
                              ? s.value === "all"
                                ? "bg-gradient-to-r from-primary to-accent text-primary-foreground border-transparent shadow-[0_4px_14px_-4px_hsl(185_70%_42%/0.5)]"
                                : (s.color || "") + " shadow-sm"
                              : "glass text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <span className="relative">{s.label}</span>
                          <span
                            className={`relative text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center ${
                              isActive
                                ? "bg-background/30 text-current"
                                : "bg-muted/80 text-muted-foreground"
                            }`}
                          >
                            {count}
                          </span>
                        </motion.button>
                      );
                    })}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>

              {filteredAssignments.length === 0 && !isLoading ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-16 text-center space-y-3 glass rounded-3xl"
                >
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 backdrop-blur-md flex items-center justify-center">
                    <ClipboardList className="h-8 w-8 text-primary/50" />
                  </div>
                  <p className="font-medium text-foreground text-sm">
                    Δεν βρέθηκαν αναθέσεις
                  </p>
                  <p className="text-xs text-muted-foreground">Ωραία δουλειά! 🎉</p>
                </motion.div>
              ) : (
                <TechnicianAssignments
                  assignments={filteredAssignments}
                  loading={isLoading}
                />
              )}
            </motion.div>
          )}

          {activeTab === "inventory" && (
            <motion.div
              key="inventory"
              initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="px-4 pt-4"
            >
              <TechnicianInventoryView />
            </motion.div>
          )}

          {activeTab === "map" && (
            <motion.div
              key="map"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="pt-0"
            >
              <TechnicianMap assignments={enrichedAssignments || []} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── FLOATING BOTTOM DOCK ── */}
      <motion.nav
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 28, delay: 0.15 }}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 ios-safe-bottom"
      >
        <div className="glass-dark dock-shadow rounded-full px-1.5 py-1.5 flex items-center gap-0.5">
          {[
            { id: "assignments", label: "Αναθέσεις", icon: ClipboardList },
            { id: "inventory", label: "Αποθήκη", icon: Package },
            { id: "map", label: "Χάρτης", icon: MapPin },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <motion.button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                whileTap={{ scale: 0.92 }}
                className={`relative flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[12px] font-semibold transition-colors ${
                  isActive
                    ? "text-primary-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-accent-foreground"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="dock-active-bg"
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-accent shadow-[0_4px_14px_-2px_hsl(185_70%_42%/0.6)]"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <tab.icon className="relative h-4 w-4" />
                <span className="relative">{tab.label}</span>
              </motion.button>
            );
          })}
        </div>
      </motion.nav>
    </div>
  );
};

export default TechnicianDashboard;
