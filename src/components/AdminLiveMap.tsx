import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const AdminLiveMapInner = lazy(() => import("./AdminLiveMapInner"));

const AdminLiveMap = () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[60vh] text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Φόρτωση χάρτη...</span>
        </div>
      }
    >
      <AdminLiveMapInner />
    </Suspense>
  );
};

export default AdminLiveMap;
