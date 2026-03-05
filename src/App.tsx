import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import Index from "./pages/Index";
import Assignments from "./pages/Assignments";
import Construction from "./pages/Construction";
import Materials from "./pages/Materials";
import WorkPricing from "./pages/WorkPricing";
import ProfitPerSR from "./pages/ProfitPerSR";
import LoginPage from "./pages/LoginPage";
import TechnicianDashboard from "./pages/TechnicianDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="text-muted-foreground">Φόρτωση...</div></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { data: role, isLoading } = useUserRole();
  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="text-muted-foreground">Φόρτωση...</div></div>;
  if (role === "technician") return <Navigate to="/technician" replace />;
  return <>{children}</>;
};

const RoleRouter = () => {
  const { data: role, isLoading } = useUserRole();
  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="text-muted-foreground">Φόρτωση...</div></div>;
  if (role === "technician") return <Navigate to="/technician" replace />;
  return <Index />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedRoute><RoleRouter /></ProtectedRoute>} />
            <Route path="/technician" element={<ProtectedRoute><TechnicianDashboard /></ProtectedRoute>} />
            <Route path="/assignments" element={<ProtectedRoute><AdminRoute><Assignments /></AdminRoute></ProtectedRoute>} />
            <Route path="/construction" element={<ProtectedRoute><AdminRoute><Construction /></AdminRoute></ProtectedRoute>} />
            <Route path="/materials" element={<ProtectedRoute><AdminRoute><Materials /></AdminRoute></ProtectedRoute>} />
            <Route path="/work-pricing" element={<ProtectedRoute><AdminRoute><WorkPricing /></AdminRoute></ProtectedRoute>} />
            <Route path="/profit" element={<ProtectedRoute><AdminRoute><ProfitPerSR /></AdminRoute></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
