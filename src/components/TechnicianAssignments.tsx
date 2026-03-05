import { MapPin, Phone, Calendar, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const statusLabels: Record<string, string> = {
  pending: "Εκκρεμεί",
  in_progress: "Σε εξέλιξη",
  completed: "Ολοκληρώθηκε",
  cancelled: "Ακυρώθηκε",
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  in_progress: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  completed: "bg-green-500/10 text-green-600 border-green-500/20",
  cancelled: "bg-red-500/10 text-red-600 border-red-500/20",
};

interface Props {
  assignments: any[];
  loading: boolean;
}

const TechnicianAssignments = ({ assignments, loading }: Props) => {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Δεν υπάρχουν αναθέσεις</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {assignments.map((a) => (
        <Card key={a.id} className="p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-sm text-foreground">SR {a.sr_id}</p>
              <p className="text-xs text-muted-foreground">{a.area}</p>
            </div>
            <Badge variant="outline" className={statusColors[a.status] || ""}>
              {statusLabels[a.status] || a.status}
            </Badge>
          </div>

          {a.address && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {a.address}
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {a.customer_name && <span>{a.customer_name}</span>}
            {a.phone && (
              <a href={`tel:${a.phone}`} className="flex items-center gap-1 text-primary">
                <Phone className="h-3 w-3" />
                {a.phone}
              </a>
            )}
          </div>

          {a.comments && (
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{a.comments}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {new Date(a.created_at).toLocaleDateString("el-GR")}
          </div>
        </Card>
      ))}
    </div>
  );
};

export default TechnicianAssignments;
