import { useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";

const useProfitPerSR = () =>
  useQuery({
    queryKey: ["profit_per_sr"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profit_per_sr")
        .select("*")
        .order("sr_id", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

const ProfitPerSR = () => {
  const { data: records, isLoading } = useProfitPerSR();

  const stats = useMemo(() => {
    if (!records?.length) return { totalRevenue: 0, totalExpenses: 0, totalProfit: 0, avgProfit: 0, profitable: 0, losing: 0 };
    const totalRevenue = records.reduce((s, r) => s + Number(r.revenue), 0);
    const totalExpenses = records.reduce((s, r) => s + Number(r.expenses), 0);
    const totalProfit = records.reduce((s, r) => s + Number(r.profit), 0);
    const profitable = records.filter(r => Number(r.profit) > 0).length;
    return {
      totalRevenue, totalExpenses, totalProfit,
      avgProfit: totalProfit / records.length,
      profitable,
      losing: records.length - profitable,
    };
  }, [records]);

  const chartData = useMemo(() => {
    if (!records) return [];
    return records.map(r => ({
      sr_id: r.sr_id,
      Έσοδα: Number(r.revenue),
      Έξοδα: Number(r.expenses),
      Κέρδος: Number(r.profit),
    }));
  }, [records]);

  const fmt = (n: number) => n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€';

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px]">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Κέρδος ανά SR</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ανάλυση εσόδων & εξόδων ανά Service Request — {records?.length ?? 0} εγγραφές
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent/10 p-2"><TrendingUp className="h-4 w-4 text-accent" /></div>
              <div>
                <p className="text-xl font-extrabold font-mono text-accent">{fmt(stats.totalRevenue)}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Συνολικά Έσοδα</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-destructive/10 p-2"><TrendingDown className="h-4 w-4 text-destructive" /></div>
              <div>
                <p className="text-xl font-extrabold font-mono text-destructive">{fmt(stats.totalExpenses)}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Συνολικά Έξοδα</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2"><DollarSign className="h-4 w-4 text-primary" /></div>
              <div>
                <p className={`text-xl font-extrabold font-mono ${stats.totalProfit >= 0 ? 'text-accent' : 'text-destructive'}`}>{fmt(stats.totalProfit)}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Καθαρό Κέρδος</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2"><DollarSign className="h-4 w-4 text-primary" /></div>
              <div>
                <p className="text-xl font-extrabold font-mono">{fmt(stats.avgProfit)}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Μέσο Κέρδος/SR</p>
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-bold text-sm mb-4">Έσοδα vs Έξοδα ανά SR</h2>
          {isLoading ? (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">Φόρτωση...</div>
          ) : chartData.length === 0 ? (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
              Δεν υπάρχουν δεδομένα — πάτα "Sync από Sheet" στην Αποθήκη
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="sr_id" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}€`} />
                <Tooltip
                  formatter={(value: number) => [`${value.toFixed(2)}€`]}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '13px' }} />
                <Bar dataKey="Έσοδα" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Έξοδα" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Profit chart */}
        {chartData.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="font-bold text-sm mb-4">Κέρδος ανά SR</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="sr_id" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}€`} />
                <Tooltip
                  formatter={(value: number) => [`${value.toFixed(2)}€`]}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                />
                <Bar dataKey="Κέρδος" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.Κέρδος >= 0 ? 'hsl(var(--accent))' : 'hsl(var(--destructive))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-3 px-4 text-left font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">SR ID</th>
                  <th className="py-3 px-4 text-right font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Έσοδα</th>
                  <th className="py-3 px-4 text-right font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Έξοδα</th>
                  <th className="py-3 px-4 text-right font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Κέρδος</th>
                  <th className="py-3 px-4 text-right font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Margin</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">Φόρτωση...</td></tr>
                ) : (records || []).map(r => {
                  const revenue = Number(r.revenue);
                  const expenses = Number(r.expenses);
                  const profit = Number(r.profit);
                  const margin = revenue > 0 ? (profit / revenue * 100) : 0;
                  return (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-primary">{r.sr_id}</td>
                      <td className="py-3 px-4 text-right font-mono text-accent">{fmt(revenue)}</td>
                      <td className="py-3 px-4 text-right font-mono text-destructive">{fmt(expenses)}</td>
                      <td className={`py-3 px-4 text-right font-mono font-bold ${profit >= 0 ? 'text-accent' : 'text-destructive'}`}>{fmt(profit)}</td>
                      <td className={`py-3 px-4 text-right font-mono text-xs ${margin >= 0 ? 'text-accent' : 'text-destructive'}`}>{margin.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default ProfitPerSR;
