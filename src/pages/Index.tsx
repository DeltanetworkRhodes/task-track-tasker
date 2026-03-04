import AppLayout from "@/components/AppLayout";
import StatCard from "@/components/StatCard";
import AssignmentTable from "@/components/AssignmentTable";
import ConstructionTable from "@/components/ConstructionTable";
import SyncButton from "@/components/SyncButton";
import { useAssignments, useConstructions } from "@/hooks/useData";
import { mockAssignments, mockConstructions } from "@/data/mockData";
import { ClipboardCheck, Wrench, TrendingUp, Mail, FileText } from "lucide-react";

const Index = () => {
  const { data: dbAssignments } = useAssignments();
  const { data: dbConstructions } = useConstructions();

  // Use DB data if available, otherwise mock
  const hasRealData = (dbAssignments?.length ?? 0) > 0;
  const assignments = hasRealData ? dbAssignments!.map(a => ({
    id: a.id,
    srId: a.sr_id,
    area: a.area,
    status: a.status as any,
    technician: (a as any).profiles?.full_name || '—',
    date: a.created_at.split('T')[0],
    comments: a.comments || '',
    photos: a.photos_count || 0,
  })) : mockAssignments;

  const hasRealConstructions = (dbConstructions?.length ?? 0) > 0;
  const constructions = hasRealConstructions ? dbConstructions!.map(c => ({
    id: c.id,
    srId: c.sr_id,
    sesId: c.ses_id || '',
    ak: c.ak || '',
    cab: c.cab || '',
    floors: c.floors || 0,
    status: c.status as any,
    revenue: Number(c.revenue),
    materialCost: Number(c.material_cost),
    profit: Number(c.profit || 0),
    date: c.created_at.split('T')[0],
  })) : mockConstructions;

  const activeAssignments = assignments.filter(a => a.status !== 'completed').length;
  const completedAssignments = assignments.filter(a => a.status === 'completed').length;
  const totalProfit = constructions.reduce((sum, c) => sum + c.profit, 0);
  const activeConstructions = constructions.filter(c => c.status === 'in_progress').length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Πίνακας Ελέγχου</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Επισκόπηση λειτουργιών FTTH
              {!hasRealData && <span className="ml-2 text-xs opacity-60">(demo data)</span>}
            </p>
          </div>
          <SyncButton />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Ενεργές Αναθέσεις" value={activeAssignments} subtitle={`${completedAssignments} ολοκληρωμένες`} icon={ClipboardCheck} />
          <StatCard title="Κατασκευές σε Εξέλιξη" value={activeConstructions} icon={Wrench} />
          <StatCard title="Καθαρό Κέρδος" value={`${totalProfit.toLocaleString()}€`} subtitle="Σύνολο" icon={TrendingUp} />
          <StatCard title="Αυτοματισμοί" value="—" subtitle="Σύντομα" icon={Mail} />
        </div>

        <div className="rounded-lg border border-border/50 bg-card">
          <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm">Πρόσφατες Αναθέσεις</h2>
            </div>
            <span className="text-xs text-muted-foreground font-mono">{assignments.length} εγγραφές</span>
          </div>
          <AssignmentTable assignments={assignments.slice(0, 5)} />
        </div>

        <div className="rounded-lg border border-border/50 bg-card">
          <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-accent" />
              <h2 className="font-semibold text-sm">Κατασκευές & Τιμολόγηση</h2>
            </div>
            <span className="text-xs text-muted-foreground font-mono">{constructions.length} εγγραφές</span>
          </div>
          <ConstructionTable constructions={constructions} />
        </div>
      </div>
    </AppLayout>
  );
};

export default Index;
