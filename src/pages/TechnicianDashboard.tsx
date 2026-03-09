import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { LogOut, ClipboardList, MapPin, Search, X } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import TechnicianAssignments from "@/components/TechnicianAssignments";
import TechnicianMap from "@/components/TechnicianMap";

const statusFilters = [
  { value: "all", label: "Όλα" },
  { value: "pending", label: "Αναμονή", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  { value: "inspection", label: "Αυτοψία", color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  { value: "pre_committed", label: "Προδέσμευση", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  { value: "construction", label: "Κατασκευή", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  { value: "completed", label: "Ολοκληρώθηκε", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  { value: "cancelled", label: "Ακυρωμένο", color: "bg-red-500/10 text-red-600 border-red-500/20" },
];

const TechnicianDashboard = () => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("assignments");
  const [hideCancelled, setHideCancelled] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*")
        .eq("technician_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const filteredAssignments = useMemo(() => {
    let list = (assignments || []).filter(a => hideCancelled ? a.status !== "cancelled" : true);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(a =>
        (a.sr_id && a.sr_id.toLowerCase().includes(q)) ||
        (a.address && a.address.toLowerCase().includes(q)) ||
        (a.area && a.area.toLowerCase().includes(q)) ||
        (a.building_id_hemd && a.building_id_hemd.toLowerCase().includes(q))
      );
    }
    return list;
  }, [assignments, hideCancelled, searchQuery]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">DeltaNet FTTH</h1>
            <p className="text-xs text-muted-foreground">
              {profile?.full_name || user?.email} · {profile?.area || "—"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Έξοδος
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 pt-4 pb-20">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="assignments" className="gap-1.5 text-xs">
            <ClipboardList className="h-3.5 w-3.5" />
            Αναθέσεις
          </TabsTrigger>
          <TabsTrigger value="map" className="gap-1.5 text-xs">
            <MapPin className="h-3.5 w-3.5" />
            Χάρτης
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assignments">
          {/* Search Bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Αναζήτηση SR, Διεύθυνση, Building ID..."
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

          <div className="flex items-center justify-between mb-3">
            {searchQuery && (
              <span className="text-xs text-muted-foreground">
                {filteredAssignments.length} αποτέλεσμα{filteredAssignments.length !== 1 ? "τα" : ""}
              </span>
            )}
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={hideCancelled}
                onChange={(e) => setHideCancelled(e.target.checked)}
                className="rounded border-border"
              />
              Απόκρυψη ακυρωμένων
            </label>
          </div>

          {searchQuery && filteredAssignments.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Δεν βρέθηκαν έργα με αυτά τα στοιχεία</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Δοκιμάστε διαφορετικούς όρους αναζήτησης</p>
            </div>
          ) : (
            <TechnicianAssignments
              assignments={filteredAssignments}
              loading={isLoading}
            />
          )}
        </TabsContent>

        <TabsContent value="map">
          <TechnicianMap assignments={assignments || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TechnicianDashboard;
