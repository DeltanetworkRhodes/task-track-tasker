import AppLayout from "@/components/AppLayout";
import StatCard from "@/components/StatCard";
import AssignmentTable from "@/components/AssignmentTable";
import ConstructionTable from "@/components/ConstructionTable";
import { mockAssignments, mockConstructions } from "@/data/mockData";
import { ClipboardCheck, Wrench, TrendingUp, Package, FileText, Mail } from "lucide-react";

const Index = () => {
  const activeAssignments = mockAssignments.filter(a => a.status !== 'completed').length;
  const completedAssignments = mockAssignments.filter(a => a.status === 'completed').length;
  const totalProfit = mockConstructions.reduce((sum, c) => sum + c.profit, 0);
  const activeConstructions = mockConstructions.filter(c => c.status === 'in_progress').length;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Πίνακας Ελέγχου</h1>
          <p className="text-sm text-muted-foreground mt-1">Επισκόπηση λειτουργιών FTTH — Δεκέμβριος 2024</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Ενεργές Αναθέσεις"
            value={activeAssignments}
            subtitle={`${completedAssignments} ολοκληρωμένες`}
            icon={ClipboardCheck}
            trend="up"
            trendValue="+3"
          />
          <StatCard
            title="Κατασκευές σε Εξέλιξη"
            value={activeConstructions}
            icon={Wrench}
            trend="neutral"
            trendValue="0"
          />
          <StatCard
            title="Καθαρό Κέρδος"
            value={`${totalProfit.toLocaleString()}€`}
            subtitle="Μηνιαίο σύνολο"
            icon={TrendingUp}
            trend="up"
            trendValue="+12%"
          />
          <StatCard
            title="Αυτοματισμοί"
            value="24"
            subtitle="PDF & Emails αυτό τον μήνα"
            icon={Mail}
          />
        </div>

        {/* Recent Assignments */}
        <div className="rounded-lg border border-border/50 bg-card">
          <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm">Πρόσφατες Αναθέσεις</h2>
            </div>
            <span className="text-xs text-muted-foreground font-mono">{mockAssignments.length} εγγραφές</span>
          </div>
          <AssignmentTable assignments={mockAssignments.slice(0, 5)} />
        </div>

        {/* Constructions */}
        <div className="rounded-lg border border-border/50 bg-card">
          <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-accent" />
              <h2 className="font-semibold text-sm">Κατασκευές & Τιμολόγηση</h2>
            </div>
            <span className="text-xs text-muted-foreground font-mono">{mockConstructions.length} εγγραφές</span>
          </div>
          <ConstructionTable constructions={mockConstructions} />
        </div>
      </div>
    </AppLayout>
  );
};

export default Index;
