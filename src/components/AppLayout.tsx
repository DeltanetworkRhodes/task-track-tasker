import { ReactNode, useState } from "react";
import AppSidebar from "./AppSidebar";
import OfflineBanner from "./OfflineBanner";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useLocationTracking } from "@/hooks/useLocationTracking";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { Menu, AlertTriangle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import deltaLogoIcon from "@/assets/delta-logo-icon.png";

const SuspendedScreen = () => {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <img src={deltaLogoIcon} alt="DeltaNetwork" className="h-16 w-auto mx-auto object-contain" />
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-warning">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold text-foreground">
            Ο λογαριασμός σας έχει ανασταλεί
          </h1>
          <p className="text-sm text-muted-foreground">
            Για επαναφορά επικοινωνήστε:
          </p>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>✉️ info@deltanetwork.app</p>
          </div>
        </div>
        <Button variant="outline" className="gap-2" onClick={signOut}>
          <LogOut className="h-4 w-4" /> Αποσύνδεση
        </Button>
      </div>
    </div>
  );
};

const AppLayout = ({ children }: { children: ReactNode }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { online, pendingCount, pendingSurveyCount, pendingConstructionCount, syncAll } = useOfflineSync();
  useLocationTracking();
  useAuditLog(); // Track page views automatically

  const { organization, isLoading: orgLoading } = useOrganization();

  // Show suspended screen if org is suspended
  if (!orgLoading && organization?.status === "suspended") {
    return <SuspendedScreen />;
  }

  return (
    <div className="flex min-h-screen bg-background safe-top safe-left safe-right">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile unless toggled */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <AppSidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex-1 lg:ml-64 min-h-screen">
        {/* Offline banner */}
        <OfflineBanner online={online} pendingCount={pendingCount} pendingSurveyCount={pendingSurveyCount} pendingConstructionCount={pendingConstructionCount} onSync={syncAll} />
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 backdrop-blur-sm px-4 py-3 lg:hidden safe-top">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 hover:bg-muted transition-colors"
          >
            <Menu className="h-5 w-5 text-foreground" />
          </button>
          <img src={deltaLogoIcon} alt="DeltaNetwork" className="h-7 w-auto object-contain" />
          <span className="text-[9px] text-muted-foreground uppercase tracking-widest">FTTx</span>
        </div>
        <div className="p-4 sm:p-6 bg-grid min-h-[calc(100vh-56px)] lg:min-h-screen ios-safe-bottom">
          <div className="w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
