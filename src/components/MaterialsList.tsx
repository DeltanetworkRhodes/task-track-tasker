import { Material } from "@/data/mockData";
import { AlertTriangle } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";

interface MaterialsListProps {
  materials: Material[];
}

const MaterialsList = ({ materials }: MaterialsListProps) => {
  const { organization } = useOrganization();
  const orgName = organization?.name || 'DELTANETWORK';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50">
            <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Κωδικός</th>
            <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Περιγραφή</th>
            <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Πηγή</th>
            <th className="py-3 px-4 text-right font-medium text-muted-foreground text-xs uppercase tracking-wider">Απόθεμα</th>
            <th className="py-3 px-4 text-right font-medium text-muted-foreground text-xs uppercase tracking-wider">Τιμή</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => (
            <tr key={m.id} className="border-b border-border/30 hover:bg-secondary/50 transition-colors">
              <td className="py-3 px-4 font-bold text-xs text-primary">{m.code}</td>
              <td className="py-3 px-4">{m.name}</td>
              <td className="py-3 px-4">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  m.source === 'OTE' ? 'bg-primary/15 text-primary' : 'bg-accent/15 text-accent'
                }`}>
                  {m.source === 'OTE' ? 'OTE' : orgName}
                </span>
              </td>
              <td className="py-3 px-4 text-right font-bold">
                <span className="inline-flex items-center gap-1">
                  {m.stock < 100 && <AlertTriangle className="h-3 w-3 text-warning" />}
                  {m.stock} {/^τεμ/i.test(m.unit) ? 'τεμάχια' : m.unit}
                </span>
              </td>
              <td className="py-3 px-4 text-right font-bold text-muted-foreground">
                {m.price === 0 ? '—' : `${m.price.toFixed(2)}€`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default MaterialsList;
