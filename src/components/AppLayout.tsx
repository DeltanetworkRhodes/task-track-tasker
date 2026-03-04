import { ReactNode } from "react";
import AppSidebar from "./AppSidebar";

const AppLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-60 flex-1 p-6 bg-grid min-h-screen">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
