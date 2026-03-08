import { useState } from "react";
import { useDemo } from "@/contexts/DemoContext";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, ClipboardList, MapPin, AlertTriangle } from "lucide-react";
import TechnicianAssignments from "@/components/TechnicianAssignments";

const DemoBanner = () => (
  <div className="bg-yellow-500 text-yellow-950 text-center text-xs font-bold py-2 px-4 flex items-center justify-center gap-2">
    <AlertTriangle className="h-3.5 w-3.5" />
    Περιβάλλον Επίδειξης — Οι αλλαγές δεν αποθηκεύονται
    <AlertTriangle className="h-3.5 w-3.5" />
  </div>
);

const DemoDashboard = () => {
  const { exitDemo, demoAssignments, demoProfile } = useDemo();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("assignments");
  const [hideCancelled, setHideCancelled] = useState(true);

  const handleExit = () => {
    exitDemo();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <DemoBanner />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">DeltaNet FTTH</h1>
            <p className="text-xs text-muted-foreground">
              {demoProfile.full_name} · {demoProfile.area}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExit}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Έξοδος Demo
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 pt-4 pb-20">
        <TabsList className="grid w-full grid-cols-1 mb-4">
          <TabsTrigger value="assignments" className="gap-1.5 text-xs">
            <ClipboardList className="h-3.5 w-3.5" />
            Αναθέσεις
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assignments">
          <div className="flex items-center justify-end mb-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={hideCancelled}
                onChange={(e) => setHideCancelled(e.target.checked)}
                className="rounded border-border"
              />
              Απόκρυψη ακυρωμένων
            </label>
          </div>
          <TechnicianAssignments
            assignments={demoAssignments.filter(a => hideCancelled ? a.status !== "cancelled" : true)}
            loading={false}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DemoDashboard;
