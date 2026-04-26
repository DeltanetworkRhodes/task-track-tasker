import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useEnabledClients, type ClientCode } from "@/hooks/useEnabledClients";

interface ClientGateProps {
  client: ClientCode;
  children: ReactNode;
}

export function ClientGate({ client, children }: ClientGateProps) {
  const { data: enabled, isLoading } = useEnabledClients();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Φόρτωση...</div>
      </div>
    );
  }

  if (!enabled?.includes(client)) {
    return <Navigate to="/client-selector" replace />;
  }

  return <>{children}</>;
}
