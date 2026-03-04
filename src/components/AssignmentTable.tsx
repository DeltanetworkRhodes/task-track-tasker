import { useState } from "react";
import { Assignment, statusLabels } from "@/data/mockData";
import { Camera, MessageSquare, ExternalLink, User, MapPin, Phone, Hash, FolderOpen, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

const DetailRow = ({ icon: Icon, label, value }: { icon: any; label: string; value: string | null | undefined }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-0">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</p>
        <p className="text-sm mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
};

const AssignmentTable = ({ assignments }: AssignmentTableProps) => {
  const [selected, setSelected] = useState<any>(null);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">SR ID</th>
              <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Περιοχή</th>
              <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Πελάτης</th>
              <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">CAB</th>
              <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Κατάσταση</th>
              <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Ημ/νία</th>
              <th className="py-3 px-4 text-center font-medium text-muted-foreground text-xs uppercase tracking-wider">Φωτο</th>
              <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Σχόλια</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr
                key={a.id}
                onClick={() => setSelected(a)}
                className="border-b border-border/30 hover:bg-secondary/50 transition-colors cursor-pointer"
              >
                <td className="py-3 px-4 font-mono font-semibold text-primary">{a.srId}</td>
                <td className="py-3 px-4">{a.area}</td>
                <td className="py-3 px-4 text-muted-foreground max-w-[180px] truncate">{(a as any).customerName || '—'}</td>
                <td className="py-3 px-4 font-mono text-xs">{(a as any).cab || '—'}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[a.status] || statusColors.pending}`}>
                    {statusLabels[a.status] || a.status}
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

      {/* Detail Modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-primary" />
              <span className="font-mono">{selected?.srId}</span>
              <span className={`ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[selected?.status as keyof typeof statusColors] || statusColors.pending}`}>
                {statusLabels[selected?.status as keyof typeof statusLabels] || selected?.status}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-0 mt-2">
            <DetailRow icon={MapPin} label="Περιοχή" value={selected?.area} />
            <DetailRow icon={User} label="Πελάτης" value={selected?.customerName} />
            <DetailRow icon={MapPin} label="Διεύθυνση" value={selected?.address} />
            <DetailRow icon={Phone} label="Τηλέφωνο" value={selected?.phone} />
            <DetailRow icon={Hash} label="Καμπίνα (CAB)" value={selected?.cab} />
            <DetailRow icon={MessageSquare} label="Σχόλια" value={selected?.comments} />

            {selected?.photos > 0 && (
              <div className="flex items-start gap-3 py-2.5 border-b border-border/30">
                <Camera className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Φωτογραφίες</p>
                  <p className="text-sm mt-0.5">{selected.photos} αρχεία</p>
                </div>
              </div>
            )}

            {selected?.driveUrl && (
              <a
                href={selected.driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 py-2.5 text-sm text-primary hover:underline"
              >
                <FolderOpen className="h-4 w-4" />
                Άνοιγμα φακέλου Drive
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground/50">
            <span>Πηγή: {selected?.sourceTab || '—'}</span>
            <span>{selected?.date}</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AssignmentTable;
