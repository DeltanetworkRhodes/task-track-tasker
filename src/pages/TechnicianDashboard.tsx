import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import NextUpHero from "@/components/technician/NextUpHero";
import OutlierBanner from "@/components/technician/OutlierBanner";
import FreshnessIndicator from "@/components/technician/FreshnessIndicator";
import AmbientCanvas from "@/components/technician/AmbientCanvas";

const FILTERS_STORAGE_KEY = "tech-dashboard-filters-v1";

const statusFilters = [
  { value: "all", label: "Όλα" },
  { value: "pending", label: "Αναμονή", color: "bg-warning/15 text-warning border-warning/30" },
  { value: "inspection", label: "Αυτοψία", color: "bg-primary/15 text-primary border-primary/30" },
  { value: "pre_committed", label: "Προδέσμευση", color: "bg-accent/15 text-accent border-accent/30" },
  { value: "construction", label: "Κατασκευή", color: "bg-success/15 text-success border-success/30" },
];

const TechnicianDashboard = () => {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();

  // Persisted filter state (Fuselab: filters survive across navigation/reload)
  const persisted = (() => {
    try {
      const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  const [activeTab, setActiveTab] = useState<string>(persisted?.activeTab ?? "assignments");
  const [hideCancelled, setHideCancelled] = useState(true);
  const [searchQuery, setSearchQuery] = useState<string>(persisted?.searchQuery ?? "");
  const [statusFilter, setStatusFilter] = useState<string>(persisted?.statusFilter ?? "all");
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({ activeTab, searchQuery, statusFilter })
      );
    } catch {
      /* noop */
    }
  }, [activeTab, searchQuery, statusFilter]);

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

  // ── Hero list: ΜΟΝΟ SRs με ραντεβού (upcoming, sorted earliest first) ──
  const heroList = useMemo(() => {
    const list = (enrichedAssignments || []).filter(
      (a) => !hiddenStatuses.includes(a.status)
    );
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    return list
      .filter((a) => a.appointment_at && new Date(a.appointment_at).getTime() > cutoff)
      .sort(
        (a, b) =>
          new Date(a.appointment_at!).getTime() -
          new Date(b.appointment_at!).getTime()
      );
  }, [enrichedAssignments]);

  const nextUp = heroList[0] || null;

  const outliers = useMemo(() => {
    const list = (enrichedAssignments || []).filter(
      (a) => !hiddenStatuses.includes(a.status)
    );
    const now = Date.now();
    const sevenDays = 7 * 24 * 3600 * 1000;
    const missedCutoff = 30 * 60 * 1000;
    const missed = list.filter(
      (a) =>
        a.appointment_at &&
        now - new Date(a.appointment_at).getTime() > missedCutoff &&
        ["pending", "inspection", "pre_committed"].includes(a.status)
    );
    const stale = list.filter(
      (a) =>
        now - new Date(a.updated_at).getTime() > sevenDays &&
        !missed.find((m) => m.id === a.id)
    );
    return { missed, stale };
  }, [enrichedAssignments]);

  useEffect(() => {
    if (!isLoading && enrichedAssignments) setLastSyncedAt(Date.now());
  }, [isLoading, enrichedAssignments]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["technician-assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["technician-appointments"] }),
      ]);
      setLastSyncedAt(Date.now());
    } finally {
      setIsRefreshing(false);
    }
  };

  const openAssignment = (a: any) => {
    setActiveTab("assignments");
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-sr-id="${a.sr_id}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  // Minutes until next appointment — drives ambient urgency layer
  const minutesUntilNext = nextUp?.appointment_at
    ? Math.round((new Date(nextUp.appointment_at).getTime() - Date.now()) / 60000)
    : null;

  return (
    <div className="relative min-h-screen bg-background">
      {/* ── Ambient atmosphere: grain + grid + 3-layer glow ── */}
      <AmbientCanvas
        minutesUntilNext={minutesUntilNext}
        status={nextUp?.status}
      />

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
          ].map((s, i) => (
            <motion.div
              key={s.label}
              className="text-center py-2.5"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.p
                key={s.value}
                className={`text-xl font-bold ${s.color} leading-tight tabular-nums`}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 22 }}
              >
                {s.value}
              </motion.p>
              <p className="text-[10px] text-sidebar-foreground/60 mt-0.5 uppercase tracking-wider">
                {s.label}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Tab bar */}
        <div className="flex border-t border-sidebar-border bg-sidebar relative">
          {[
            { id: "assignments", label: "Αναθέσεις", icon: ClipboardList },
            { id: "inventory", label: "Αποθήκη", icon: Package },
            { id: "map", label: "Χάρτης", icon: MapPin },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-primary"
                  : "text-sidebar-foreground/60 hover:text-sidebar-accent-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="tech-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary via-accent to-primary"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="tech-tab-bg"
                  className="absolute inset-0 bg-sidebar-accent/40 -z-0"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </header>

      {/* ── CONTENT (relative so it sits above ambient canvas) ── */}
      <div className="relative z-10 pb-6">
        <AnimatePresence mode="wait">
          {activeTab === "assignments" && (
            <motion.div
              key="assignments"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="px-4 pt-4 space-y-3"
            >
              <NotificationPermissionCard />

              {/* Freshness indicator (Fuselab: data freshness) */}
              <FreshnessIndicator
                lastUpdatedAt={lastSyncedAt}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
              />

              {/* Next Up hero — Linear × iOS, tap-to-cycle */}
              <NextUpHero assignments={heroList} onOpen={openAssignment} />

              {/* Outliers banner (Fuselab: surface outliers) */}
              <OutlierBanner
                staleAssignments={outliers.stale}
                missedAppointments={outliers.missed}
                onOpen={openAssignment}
              />


              {/* Today banner — gradient teal-to-green */}
              {todayAppts.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="bg-gradient-to-br from-primary/10 via-card to-accent/10 border border-accent/30 rounded-2xl p-4 space-y-2 shadow-md"
                >
                  <div className="flex items-center gap-2 text-xs font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    <div className="h-2 w-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_hsl(var(--accent))]" />
                    Σήμερα — {todayAppts.length} ραντεβού
                  </div>
                  {todayAppts.map((a, i) => (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.05 }}
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
                    </motion.div>
                  ))}
                </motion.div>
              )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Αναζήτηση SR, διεύθυνση..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 h-12 text-sm rounded-2xl bg-card border-border/60 shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter chips — modern pill style */}
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
                        className={`relative flex-shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                          isActive
                            ? s.value === "all"
                              ? "bg-gradient-to-r from-primary to-accent text-primary-foreground border-transparent shadow-md"
                              : (s.color || "") + " shadow-sm"
                            : "bg-card text-muted-foreground border-border/60 hover:bg-muted hover:border-border"
                        }`}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="filter-active-glow"
                            className="absolute inset-0 rounded-full ring-2 ring-primary/30"
                            transition={{ type: "spring", stiffness: 380, damping: 30 }}
                          />
                        )}
                        <span className="relative">{s.label}</span>
                        <span
                          className={`relative text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center ${
                            isActive
                              ? "bg-background/30 text-current"
                              : "bg-muted text-muted-foreground"
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
            </motion.div>
          )}

          {activeTab === "inventory" && (
            <motion.div
              key="inventory"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
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
    </div>
  );
};

export default TechnicianDashboard;
