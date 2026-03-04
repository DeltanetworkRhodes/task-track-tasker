import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { useMaterials } from "@/hooks/useData";
import { mockMaterials } from "@/data/mockData";
import { Package, AlertTriangle, Search, Plus, Box, ArrowUpDown, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type SortField = 'code' | 'name' | 'stock' | 'price';
type SortDir = 'asc' | 'desc';

const Materials = () => {
  const { data: dbMaterials, refetch } = useMaterials();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<'all' | 'OTE' | 'DELTANETWORK'>('all');
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({ code: '', name: '', source: 'OTE' as string, stock: '', unit: 'τεμ.', price: '' });

  const hasRealData = (dbMaterials?.length ?? 0) > 0;
  const materials = hasRealData
    ? dbMaterials!.map(m => ({
        id: m.id,
        code: m.code,
        name: m.name,
        stock: Number(m.stock),
        unit: m.unit,
        source: m.source as 'OTE' | 'DELTANETWORK',
        price: Number(m.price),
      }))
    : mockMaterials;

  const filtered = useMemo(() => {
    let result = materials.filter(m => {
      const matchesSearch = search === '' ||
        m.code.toLowerCase().includes(search.toLowerCase()) ||
        m.name.toLowerCase().includes(search.toLowerCase());
      const matchesSource = sourceFilter === 'all' || m.source === sourceFilter;
      return matchesSearch && matchesSource;
    });
    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return result;
  }, [materials, search, sourceFilter, sortField, sortDir]);

  const oteItems = materials.filter(m => m.source === 'OTE');
  const deltaItems = materials.filter(m => m.source === 'DELTANETWORK');
  const lowStock = materials.filter(m => m.stock < 100).length;
  const totalValue = materials.reduce((sum, m) => sum + m.stock * m.price, 0);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from('materials').insert({
        code: form.code,
        name: form.name,
        source: form.source,
        stock: Number(form.stock) || 0,
        unit: form.unit,
        price: Number(form.price) || 0,
      });
      if (error) throw error;
      toast.success('Υλικό προστέθηκε');
      setForm({ code: '', name: '', source: 'OTE', stock: '', unit: 'τεμ.', price: '' });
      setAddOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const SortHeader = ({ field, label, align = 'left' }: { field: SortField; label: string; align?: string }) => (
    <th
      className={`py-3 px-4 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => toggleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortField === field ? 'text-primary' : 'opacity-30'}`} />
      </span>
    </th>
  );

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Αποθήκη Υλικών</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Διαχείριση αποθεμάτων OTE & DELTANETWORK
              {!hasRealData && <span className="ml-2 text-[11px] rounded-full bg-warning/10 text-warning px-2 py-0.5 font-medium">demo</span>}
            </p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-2 rounded-xl cosmote-gradient px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:opacity-90 transition-all">
                <Plus className="h-4 w-4" />
                Νέο Υλικό
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Προσθήκη Υλικού</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Κωδικός</label>
                    <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} required className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Πηγή</label>
                    <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:border-primary focus:outline-none">
                      <option value="OTE">OTE</option>
                      <option value="DELTANETWORK">DELTANETWORK</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Περιγραφή</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Απόθεμα</label>
                    <input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Μονάδα</label>
                    <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Τιμή (€)</label>
                    <input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                </div>
                <button type="submit" disabled={saving} className="w-full rounded-xl cosmote-gradient px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50">
                  {saving ? 'Αποθήκευση...' : 'Προσθήκη'}
                </button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2"><Package className="h-4 w-4 text-primary" /></div>
              <div>
                <p className="text-2xl font-extrabold font-mono text-gradient-primary">{materials.length}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Συνολικά Είδη</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2"><Box className="h-4 w-4 text-primary" /></div>
              <div>
                <p className="text-2xl font-extrabold font-mono">{oteItems.length}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Υλικά OTE</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent/10 p-2"><Box className="h-4 w-4 text-accent" /></div>
              <div>
                <p className="text-2xl font-extrabold font-mono text-gradient-accent">{deltaItems.length}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Υλικά Delta</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${lowStock > 0 ? 'bg-warning/10' : 'bg-success/10'}`}>
                <AlertTriangle className={`h-4 w-4 ${lowStock > 0 ? 'text-warning' : 'text-success'}`} />
              </div>
              <div>
                <p className="text-2xl font-extrabold font-mono">{lowStock}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Χαμηλό Απόθεμα</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Αναζήτηση κωδικού ή περιγραφής..."
              className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <div className="flex rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            {(['all', 'OTE', 'DELTANETWORK'] as const).map(src => (
              <button
                key={src}
                onClick={() => setSourceFilter(src)}
                className={`px-4 py-2.5 text-xs font-semibold transition-all ${
                  sourceFilter === src
                    ? 'cosmote-gradient text-white'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {src === 'all' ? 'Όλα' : src}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground font-mono ml-auto">{filtered.length} αποτελέσματα</span>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <SortHeader field="code" label="Κωδικός" />
                  <SortHeader field="name" label="Περιγραφή" />
                  <th className="py-3 px-4 text-left font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Πηγή</th>
                  <SortHeader field="stock" label="Απόθεμα" align="right" />
                  <SortHeader field="price" label="Τιμή" align="right" />
                  <th className="py-3 px-4 text-right font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Αξία</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const value = m.stock * m.price;
                  const isLow = m.stock < 100;
                  return (
                    <tr key={m.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-primary">{m.code}</td>
                      <td className="py-3 px-4 font-medium">{m.name}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          m.source === 'OTE'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-accent/10 text-accent'
                        }`}>
                          {m.source}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        <span className={`inline-flex items-center gap-1.5 ${isLow ? 'text-warning font-semibold' : ''}`}>
                          {isLow && <AlertTriangle className="h-3 w-3" />}
                          {m.stock.toLocaleString('el-GR')} {m.unit}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                        {m.price === 0 ? <span className="text-muted-foreground/40">—</span> : `${m.price.toFixed(2)}€`}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold">
                        {value === 0 ? <span className="text-muted-foreground/40">—</span> : `${value.toLocaleString('el-GR', { minimumFractionDigits: 2 })}€`}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">
                      Δεν βρέθηκαν υλικά
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Total Value */}
        {totalValue > 0 && (
          <div className="flex justify-end">
            <div className="rounded-xl border border-border bg-card px-5 py-3 shadow-sm">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-3">Συνολική Αξία Αποθέματος</span>
              <span className="text-lg font-extrabold font-mono text-gradient-primary">{totalValue.toLocaleString('el-GR', { minimumFractionDigits: 2 })}€</span>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Materials;
