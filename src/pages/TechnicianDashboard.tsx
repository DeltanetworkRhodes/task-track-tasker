import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, ClipboardList, MapPin } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import TechnicianAssignments from "@/components/TechnicianAssignments";
import TechnicianMap from "@/components/TechnicianMap";

const TechnicianDashboard = () => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("assignments");
  const [hideCancelled, setHideCancelled] = useState(true);

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
          <TechnicianAssignments assignments={assignments || []} loading={isLoading} />
        </TabsContent>

        <TabsContent value="map">
          <TechnicianMap assignments={assignments || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TechnicianDashboard;
