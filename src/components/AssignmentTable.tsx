import { Assignment, statusLabels } from "@/data/mockData";
import { Camera, MessageSquare } from "lucide-react";

const statusColors: Record<Assignment['status'], string> = {
  pending: 'bg-muted text-muted-foreground',
  inspection: 'bg-warning/15 text-warning',
  pre_committed: 'bg-primary/15 text-primary',
  construction: 'bg-accent/15 text-accent',
  completed: 'bg-success/15 text-success',
};

interface AssignmentTableProps {
  assignments: Assignment[];
}

const AssignmentTable = ({ assignments }: AssignmentTableProps) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50">
            <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">SR ID</th>
            <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Περιοχή</th>
            <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Τεχνικός</th>
            <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Κατάσταση</th>
            <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Ημ/νία</th>
            <th className="py-3 px-4 text-center font-medium text-muted-foreground text-xs uppercase tracking-wider">Φωτο</th>
            <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Σχόλια</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => (
            <tr key={a.id} className="border-b border-border/30 hover:bg-secondary/50 transition-colors cursor-pointer">
              <td className="py-3 px-4 font-mono font-semibold text-primary">{a.srId}</td>
              <td className="py-3 px-4">{a.area}</td>
              <td className="py-3 px-4 text-muted-foreground">{a.technician}</td>
              <td className="py-3 px-4">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[a.status]}`}>
                  {statusLabels[a.status]}
                </span>
              </td>
              <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{a.date}</td>
              <td className="py-3 px-4 text-center">
                {a.photos > 0 && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Camera className="h-3.5 w-3.5" />
                    <span className="text-xs">{a.photos}</span>
                  </span>
                )}
              </td>
              <td className="py-3 px-4 text-xs text-muted-foreground max-w-[200px] truncate">
                {a.comments && (
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3 w-3 flex-shrink-0" />
                    {a.comments}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AssignmentTable;
