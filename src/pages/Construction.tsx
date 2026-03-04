import AppLayout from "@/components/AppLayout";
import ConstructionTable from "@/components/ConstructionTable";
import StatCard from "@/components/StatCard";
import { mockConstructions } from "@/data/mockData";
import { Wrench, TrendingUp, Receipt, DollarSign } from "lucide-react";

const ConstructionPage = () => {
  const totalRevenue = mockConstructions.reduce((s, c) => s + c.revenue, 0);
  const totalCost = mockConstructions.reduce((s, c) => s + c.materialCost, 0);
  const totalProfit = mockConstructions.reduce((s, c) => s + c.profit, 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Πυλώνας 2 — Κατασκευές & Τιμολόγηση</h1>
          <p className="text-sm text-muted-foreground mt-1">Διαχείριση κατασκευών, υλικών και φύλλων απολογισμού</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard title="Συνολικά Έσοδα" value={`${totalRevenue.toLocaleString()}€`} icon={Receipt} />
          <StatCard title="Κόστος Υλικών" value={`${totalCost.toLocaleString()}€`} icon={DollarSign} />
          <StatCard title="Καθαρό Κέρδος" value={`${totalProfit.toLocaleString()}€`} icon={TrendingUp} trend="up" trendValue="+12%" />
        </div>

        <div className="rounded-lg border border-border/50 bg-card">
          <div className="flex items-center gap-2 border-b border-border/50 px-5 py-4">
            <Wrench className="h-4 w-4 text-accent" />
            <h2 className="font-semibold text-sm">Κατασκευές</h2>
            <span className="ml-auto text-xs text-muted-foreground font-mono">{mockConstructions.length} εγγραφές</span>
          </div>
          <ConstructionTable constructions={mockConstructions} />
        </div>
      </div>
    </AppLayout>
  );
};

export default ConstructionPage;
