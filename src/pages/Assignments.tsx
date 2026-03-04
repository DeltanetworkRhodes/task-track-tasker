import AppLayout from "@/components/AppLayout";
import AssignmentTable from "@/components/AssignmentTable";
import { mockAssignments } from "@/data/mockData";
import { ClipboardCheck, Plus } from "lucide-react";

const Assignments = () => {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Πυλώνας 1 — Αυτοψίες & Προδεσμεύσεις</h1>
            <p className="text-sm text-muted-foreground mt-1">Διαχείριση αρχικών επισκέψεων και εγγράφων αυτοψίας</p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors glow-primary">
            <Plus className="h-4 w-4" />
            Νέα Αυτοψία
          </button>
        </div>

        <div className="rounded-lg border border-border/50 bg-card">
          <div className="flex items-center gap-2 border-b border-border/50 px-5 py-4">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Όλες οι Αναθέσεις</h2>
            <span className="ml-auto text-xs text-muted-foreground font-mono">{mockAssignments.length} εγγραφές</span>
          </div>
          <AssignmentTable assignments={mockAssignments} />
        </div>
      </div>
    </AppLayout>
  );
};

export default Assignments;
