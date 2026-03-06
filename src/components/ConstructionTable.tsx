import { Construction, constructionStatusLabels } from "@/data/mockData";

const statusColors: Record<Construction['status'], string> = {
  in_progress: 'bg-warning/15 text-warning',
  completed: 'bg-success/15 text-success',
  invoiced: 'bg-primary/15 text-primary',
};

interface ConstructionTableProps {
  constructions: Construction[];
}

const ConstructionTable = ({ constructions }: ConstructionTableProps) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50">
            <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">SR ID</th>
            <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">SES ID</th>
            <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Α/Κ</th>
            <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">CAB</th>
            <th className="py-3 px-4 text-center font-medium text-muted-foreground text-xs uppercase tracking-wider">Όροφοι</th>
            <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Κατάσταση</th>
            <th className="py-3 px-4 text-right font-medium text-muted-foreground text-xs uppercase tracking-wider">Έσοδα</th>
            <th className="py-3 px-4 text-right font-medium text-muted-foreground text-xs uppercase tracking-wider">Κόστος</th>
            <th className="py-3 px-4 text-right font-medium text-muted-foreground text-xs uppercase tracking-wider">Κέρδος</th>
          </tr>
        </thead>
        <tbody>
          {constructions.map((c) => (
            <tr key={c.id} className="border-b border-border/30 hover:bg-secondary/50 transition-colors cursor-pointer">
              <td className="py-3 px-4 font-bold text-primary">{c.srId}</td>
              <td className="py-3 px-4 font-bold text-xs">{c.sesId}</td>
              <td className="py-3 px-4 font-bold text-xs">{c.ak}</td>
              <td className="py-3 px-4 font-bold text-xs">{c.cab}</td>
              <td className="py-3 px-4 text-center">{c.floors}</td>
              <td className="py-3 px-4">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[c.status]}`}>
                  {constructionStatusLabels[c.status]}
                </span>
              </td>
              <td className="py-3 px-4 text-right font-mono">{c.revenue > 0 ? `${c.revenue.toLocaleString()}€` : '—'}</td>
              <td className="py-3 px-4 text-right font-mono text-destructive">{c.materialCost}€</td>
              <td className={`py-3 px-4 text-right font-mono font-semibold ${c.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                {c.profit >= 0 ? '+' : ''}{c.profit.toLocaleString()}€
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ConstructionTable;
