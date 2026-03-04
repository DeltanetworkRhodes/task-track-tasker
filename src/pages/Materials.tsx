import AppLayout from "@/components/AppLayout";
import MaterialsList from "@/components/MaterialsList";
import { mockMaterials } from "@/data/mockData";
import { Package, AlertTriangle } from "lucide-react";

const Materials = () => {
  const lowStock = mockMaterials.filter(m => m.stock < 100).length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Αποθήκη Υλικών</h1>
            <p className="text-sm text-muted-foreground mt-1">Διαχείριση αποθεμάτων OTE & DELTANETWORK</p>
          </div>
          {lowStock > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-warning/10 border border-warning/30 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              {lowStock} υλικά σε χαμηλό απόθεμα
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border/50 bg-card">
          <div className="flex items-center gap-2 border-b border-border/50 px-5 py-4">
            <Package className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Κατάλογος Υλικών</h2>
            <span className="ml-auto text-xs text-muted-foreground font-mono">{mockMaterials.length} είδη</span>
          </div>
          <MaterialsList materials={mockMaterials} />
        </div>
      </div>
    </AppLayout>
  );
};

export default Materials;
