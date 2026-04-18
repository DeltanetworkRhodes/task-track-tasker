import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const isToday = (date: Date) => {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

const PHASE_COLORS: Record<1 | 2 | 3, string> = {
  1: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  2: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  3: "bg-green-500/15 text-green-700 border-green-500/30",
};

const PHASE_LABELS: Record<1 | 2 | 3, string> = {
  1: "🚜 Χωματουργικά",
  2: "🔧 Οδεύσεις",
  3: "🔬 Κόλληση",
};


const statusFilters = [
  { value: "all", label: "Όλα" },
  { value: "pending", label: "Αναμονή", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  { value: "inspection", label: "Αυτοψία", color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  { value: "pre_committed", label: "Προδέσμευση", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  { value: "construction", label: "Κατασκευή", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
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

  // Fetch crew assignment IDs for this technician
  const { data: crewAssignmentIds } = useQuery({
    queryKey: ["my-crew-assignment-ids", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sr_crew_assignments" as any)
        .select("assignment_id")
        .eq("technician_id", user!.id);
      if (error) throw error;
      return [...new Set((data || []).map((d: any) => d.assignment_id))] as string[];
    },
    enabled: !!user,
  });

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["technician-assignments", user?.id, crewAssignmentIds],
    queryFn: async () => {
      // Get assignments where user is main technician
      const { data: mainData, error: mainErr } = await supabase
        .from("assignments")
        .select("*")
        .eq("technician_id", user!.id)
        .order("updated_at", { ascending: false });
      if (mainErr) throw mainErr;

      // Get assignments where user has crew assignments but is not main tech
      const crewOnlyIds = (crewAssignmentIds || []).filter(
        (id) => !(mainData || []).some((a) => a.id === id)
      );

      let crewData: typeof mainData = [];
      if (crewOnlyIds.length > 0) {
        const { data, error } = await supabase
          .from("assignments")
          .select("*")
          .in("id", crewOnlyIds)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        crewData = data || [];
      }

      // Merge and sort by updated_at desc
      const all = [...(mainData || []), ...crewData];
      all.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      return all;
    },
    enabled: !!user && crewAssignmentIds !== undefined,
  });

  const filteredAssignments = useMemo(() => {
    // Always hide cancelled and completed
    let list = (assignments || []).filter(a => !hiddenStatuses.includes(a.status));
    
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
    return list;
  }, [assignments, searchQuery, statusFilter]);

  // Count per status for chips
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const activeList = (assignments || []).filter(a => !hiddenStatuses.includes(a.status));
    activeList.forEach(a => {
      counts[a.status] = (counts[a.status] || 0) + 1;
    });
    counts["all"] = activeList.length;
    return counts;
  }, [assignments]);

  // SRs with appointment today
  const todayAppointments = useMemo(
    () =>
      (assignments || []).filter(
        (a) => a.appointment_at && isToday(new Date(a.appointment_at))
      ),
    [assignments]
  );

  // Greeting based on time
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Καλημέρα" : hour < 17 ? "Καλησπέρα" : "Καλό βράδυ";
  const initials = (profile?.full_name || "?")
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
              <span className="text-sm font-bold text-primary">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground leading-tight truncate">
                {greeting}, {profile?.full_name?.split(" ")[0] || "—"}!
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {profile?.area && (
                  <span className="text-[10px] text-muted-foreground">📍 {profile.area}</span>
                )}
                {profile?.default_phase && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                      PHASE_COLORS[profile.default_phase as 1 | 2 | 3]
                    }`}
                  >
                    {PHASE_LABELS[profile.default_phase as 1 | 2 | 3]}
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
              className="p-2 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
              aria-label="Έξοδος"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="flex border-t border-border/50 divide-x divide-border/50">
          {[
            {
              label: "Ενεργά",
              value:
                assignments?.filter(
                  (a) => !["cancelled", "completed", "submitted", "paid", "rejected"].includes(a.status)
                ).length || 0,
              color: "text-primary",
            },
            {
              label: "Κατασκευή",
              value: assignments?.filter((a) => a.status === "construction").length || 0,
              color: "text-purple-600",
            },
            {
              label: "Αυτοψία",
              value: assignments?.filter((a) => a.status === "inspection").length || 0,
              color: "text-orange-600",
            },
          ].map((stat) => (
            <div key={stat.label} className="flex-1 text-center py-2">
              <p className={`text-base font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </header>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 pt-4 pb-20">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="assignments" className="gap-1.5 text-xs">
            <ClipboardList className="h-3.5 w-3.5" />
            Αναθέσεις
          </TabsTrigger>
          <TabsTrigger value="inventory" className="gap-1.5 text-xs">
            <Package className="h-3.5 w-3.5" />
            Αποθήκη
          </TabsTrigger>
          <TabsTrigger value="map" className="gap-1.5 text-xs">
            <MapPin className="h-3.5 w-3.5" />
            Χάρτης
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assignments">
          <NotificationPermissionCard />

          {/* Today's appointments banner */}
          {todayAppointments.length > 0 && (
            <div className="mb-4 p-3 rounded-xl border-2 border-green-500/30 bg-green-500/5 space-y-2">
              <p className="text-xs font-bold text-green-700 flex items-center gap-1.5">
                📅 Σήμερα — {todayAppointments.length} ραντεβού
              </p>
              {todayAppointments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between text-xs bg-background rounded-lg px-3 py-2 border border-green-500/20"
                >
                  <div>
                    <span className="font-bold text-primary">{a.sr_id}</span>
                    <span className="text-muted-foreground ml-2">
                      {new Date(a.appointment_at!).toLocaleTimeString("el-GR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <span className="text-muted-foreground truncate ml-2 max-w-[120px]">
                    {a.address}
                  </span>
                </div>
              ))}
            </div>
          )}
          {/* Search Bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Αναζήτηση SR, Διεύθυνση, Όνομα, Building ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 h-10 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Status Filter Chips */}
          <ScrollArea className="w-full mb-3">
            <div className="flex gap-2 pb-2">
              {statusFilters
                .filter(s => s.value === "all" || statusFilter === s.value || (statusCounts[s.value] || 0) > 0)
                .map(s => {
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
                            : s.color + " border-current font-bold ring-1 ring-current/30"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {s.label}
                      <span className={`text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${
                        isActive ? "bg-background/20" : "bg-muted-foreground/10"
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          <div className="flex items-center mb-3">
            {searchQuery && (
              <span className="text-xs text-muted-foreground">
                {filteredAssignments.length} αποτέλεσμα{filteredAssignments.length !== 1 ? "τα" : ""}
              </span>
            )}
          </div>

          {(searchQuery || statusFilter !== "all") && filteredAssignments.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Δεν βρέθηκαν έργα με αυτά τα κριτήρια</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Δοκιμάστε διαφορετικούς όρους ή φίλτρα</p>
            </div>
          ) : (
            <TechnicianAssignments
              assignments={filteredAssignments}
              loading={isLoading}
            />
          )}
        </TabsContent>

        <TabsContent value="inventory">
          <TechnicianInventoryView />
        </TabsContent>

        <TabsContent value="map">
          <TechnicianMap assignments={assignments || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TechnicianDashboard;
