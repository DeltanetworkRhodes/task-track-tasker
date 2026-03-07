import { Construction, constructionStatusLabels } from "@/data/mockData";
import { Euro, TrendingUp, Layers, Hash } from "lucide-react";

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
    <>
      {/* Mobile Card View */}
      <div className="block md:hidden space-y-2 p-2">
        {constructions.map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-card p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-primary text-sm">{c.srId}</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${statusColors[c.status]}`}>
                {constructionStatusLabels[c.status]}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs">
              {c.sesId && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Hash className="h-3 w-3 shrink-0" />
                  <span className="font-bold">{c.sesId}</span>
                </div>
              )}
              {c.cab && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="text-[10px] uppercase text-muted-foreground/60">CAB</span>
                  <span className="font-bold">{c.cab}</span>
                </div>
              )}
              {c.floors > 0 && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Layers className="h-3 w-3 shrink-0" />
                  <span>{c.floors} όροφοι</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/30 text-xs">
              <div className="flex items-center gap-1.5">
                <Euro className="h-3 w-3 text-primary" />
                <span className="font-bold">{c.revenue > 0 ? `${c.revenue.toLocaleString()}€` : '—'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-destructive">
                <span className="font-bold">-{c.materialCost}€</span>
              </div>
              <div className={`flex items-center gap-1.5 font-bold ${c.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                <TrendingUp className="h-3 w-3" />
                {c.profit >= 0 ? '+' : ''}{c.profit.toLocaleString()}€
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
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
                <td className="py-3 px-4 text-right font-bold">{c.revenue > 0 ? `${c.revenue.toLocaleString()}€` : '—'}</td>
                <td className="py-3 px-4 text-right font-bold text-destructive">{c.materialCost}€</td>
                <td className={`py-3 px-4 text-right font-bold ${c.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {c.profit >= 0 ? '+' : ''}{c.profit.toLocaleString()}€
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default ConstructionTable;
