import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { useUserRole } from "@/hooks/useUserRole";
import Index from "./pages/Index";
import Assignments from "./pages/Assignments";
import Construction from "./pages/Construction";
import Materials from "./pages/Materials";
import WorkPricing from "./pages/WorkPricing";
import ProfitPerSR from "./pages/ProfitPerSR";
import Surveys from "./pages/Surveys";
import LoginPage from "./pages/LoginPage";
import UserManagement from "./pages/UserManagement";
import TechnicianDashboard from "./pages/TechnicianDashboard";
import PendingApproval from "./pages/PendingApproval";
import ResetPassword from "./pages/ResetPassword";
import InstallApp from "./pages/InstallApp";
import TechnicianKPIs from "./pages/TechnicianKPIs";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import OrgSettings from "./pages/OrgSettings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="text-muted-foreground">Φόρτωση...</div></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const RoleGate = ({ children }: { children: React.ReactNode }) => {
  const { data: role, isLoading } = useUserRole();
  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="text-muted-foreground">Φόρτωση...</div></div>;
  if (!role) return <PendingApproval />;
  if (role === "super_admin") return <Navigate to="/super-admin" replace />;
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { data: role, isLoading } = useUserRole();
  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="text-muted-foreground">Φόρτωση...</div></div>;
  if (role === "technician") return <Navigate to="/technician" replace />;
  if (role === "super_admin") return <Navigate to="/super-admin" replace />;
  return <>{children}</>;
};

const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { data: role, isLoading } = useUserRole();
  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="text-muted-foreground">Φόρτωση...</div></div>;
  if (role !== "super_admin") return <Navigate to="/" replace />;
  return <>{children}</>;
};

const RoleRouter = () => {
  const { data: role, isLoading } = useUserRole();
  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="text-muted-foreground">Φόρτωση...</div></div>;
  if (role === "super_admin") return <Navigate to="/super-admin" replace />;
  if (role === "technician") return <Navigate to="/technician" replace />;
  return <Index />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <OrganizationProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/install" element={<InstallApp />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={<ProtectedRoute><RoleGate><RoleRouter /></RoleGate></ProtectedRoute>} />
              <Route path="/super-admin" element={<ProtectedRoute><SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute></ProtectedRoute>} />
              <Route path="/technician" element={<ProtectedRoute><RoleGate><TechnicianDashboard /></RoleGate></ProtectedRoute>} />
              <Route path="/assignments" element={<ProtectedRoute><RoleGate><AdminRoute><Assignments /></AdminRoute></RoleGate></ProtectedRoute>} />
              <Route path="/surveys" element={<ProtectedRoute><RoleGate><AdminRoute><Surveys /></AdminRoute></RoleGate></ProtectedRoute>} />
              <Route path="/construction" element={<ProtectedRoute><RoleGate><AdminRoute><Construction /></AdminRoute></RoleGate></ProtectedRoute>} />
              <Route path="/materials" element={<ProtectedRoute><RoleGate><AdminRoute><Materials /></AdminRoute></RoleGate></ProtectedRoute>} />
              <Route path="/work-pricing" element={<ProtectedRoute><RoleGate><AdminRoute><WorkPricing /></AdminRoute></RoleGate></ProtectedRoute>} />
              <Route path="/profit" element={<ProtectedRoute><RoleGate><AdminRoute><ProfitPerSR /></AdminRoute></RoleGate></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute><RoleGate><AdminRoute><UserManagement /></AdminRoute></RoleGate></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><RoleGate><AdminRoute><OrgSettings /></AdminRoute></RoleGate></ProtectedRoute>} />
              <Route path="/kpis" element={<ProtectedRoute><RoleGate><AdminRoute><TechnicianKPIs /></AdminRoute></RoleGate></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </OrganizationProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
