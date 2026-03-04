import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { useMaterials } from "@/hooks/useData";
import { mockMaterials } from "@/data/mockData";
import { Package, AlertTriangle, Search, Plus, Box, ArrowUpDown, Check, X, Pencil, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";

type SortField = 'code' | 'name' | 'stock' | 'price';
type SortDir = 'asc' | 'desc';

interface MaterialItem {
  id: string;
  code: string;
  name: string;
  stock: number;
  unit: string;
  source: 'OTE' | 'DELTANETWORK';
  price: number;
}

const MaterialTable = ({ items, hasRealData, editingId, editValues, onEdit, onSave, onCancel, onEditChange, sortField, sortDir, toggleSort }: {
  items: MaterialItem[];
  hasRealData: boolean;
  editingId: string | null;
  editValues: { stock: string; price: string };
  onEdit: (m: MaterialItem) => void;
  onSave: () => void;
  onCancel: () => void;
  onEditChange: (field: 'stock' | 'price', val: string) => void;
  sortField: SortField;
  sortDir: SortDir;
  toggleSort: (f: SortField) => void;
}) => {
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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <SortHeader field="code" label="Κωδικός" />
            <SortHeader field="name" label="Περιγραφή" />
            <SortHeader field="stock" label="Απόθεμα" align="right" />
            <SortHeader field="price" label="Τιμή" align="right" />
            <th className="py-3 px-4 text-right font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Αξία</th>
            {hasRealData && <th className="py-3 px-2 w-10" />}
          </tr>
        </thead>
        <tbody>
          {items.map((m) => {
            const isEditing = editingId === m.id;
            const value = m.stock * m.price;
            const isLow = m.stock < 100;
            return (
              <tr key={m.id} className={`border-b border-border/50 transition-colors ${isEditing ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                <td className="py-3 px-4 font-mono text-xs font-semibold text-primary">{m.code}</td>
                <td className="py-3 px-4 font-medium">{m.name}</td>
                <td className="py-3 px-4 text-right font-mono">
                  {isEditing ? (
                    <input
                      type="number"
                      value={editValues.stock}
                      onChange={e => onEditChange('stock', e.target.value)}
                      className="w-24 ml-auto rounded-lg border border-primary/30 bg-card px-2 py-1 text-right text-sm font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      autoFocus
                    />
                  ) : (
                    <span className={`inline-flex items-center gap-1.5 ${isLow ? 'text-warning font-semibold' : ''}`}>
                      {isLow && <AlertTriangle className="h-3 w-3" />}
                      {m.stock.toLocaleString('el-GR')} {m.unit}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editValues.price}
                      onChange={e => onEditChange('price', e.target.value)}
                      className="w-20 ml-auto rounded-lg border border-primary/30 bg-card px-2 py-1 text-right text-sm font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  ) : (
                    m.price === 0 ? <span className="text-muted-foreground/40">—</span> : `${m.price.toFixed(2)}€`
                  )}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold">
                  {value === 0 ? <span className="text-muted-foreground/40">—</span> : `${value.toLocaleString('el-GR', { minimumFractionDigits: 2 })}€`}
                </td>
                {hasRealData && (
                  <td className="py-3 px-2 text-right">
                    {isEditing ? (
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={onSave} className="rounded-lg p-1.5 text-success hover:bg-success/10 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={onCancel} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => onEdit(m)} className="rounded-lg p-1.5 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={hasRealData ? 6 : 5} className="py-12 text-center text-muted-foreground text-sm">
                Δεν βρέθηκαν υλικά
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const Materials = () => {
  const { data: dbMaterials, refetch } = useMaterials();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ stock: '', price: '' });
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();

  const [form, setForm] = useState({ code: '', name: '', source: 'OTE' as string, stock: '', unit: 'τεμ.', price: '' });

  const syncFromSheet = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-materials", { body: {} });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: ["work_pricing"] });
      refetch();
      toast.success(`Συγχρονίστηκαν ${data?.synced?.materials || 0} υλικά, ${data?.synced?.work_pricing || 0} εργασίες`);
      if (data?.errors?.length > 0) {
        toast.error(`${data.errors.length} σφάλματα`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const hasRealData = (dbMaterials?.length ?? 0) > 0;
  const materials: MaterialItem[] = hasRealData
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

  const filterAndSort = (items: MaterialItem[]) => {
    let result = items.filter(m =>
      search === '' ||
      m.code.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase())
    );
    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return result;
  };

  const oteItems = useMemo(() => filterAndSort(materials.filter(m => m.source === 'OTE')), [materials, search, sortField, sortDir]);
  const deltaItems = useMemo(() => filterAndSort(materials.filter(m => m.source === 'DELTANETWORK')), [materials, search, sortField, sortDir]);
  const lowStock = materials.filter(m => m.stock < 100).length;
  const oteValue = materials.filter(m => m.source === 'OTE').reduce((s, m) => s + m.stock * m.price, 0);
  const deltaValue = materials.filter(m => m.source === 'DELTANETWORK').reduce((s, m) => s + m.stock * m.price, 0);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const startEdit = (m: MaterialItem) => {
    setEditingId(m.id);
    setEditValues({ stock: String(m.stock), price: String(m.price) });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const { error } = await supabase.from('materials').update({
        stock: Number(editValues.stock) || 0,
        price: Number(editValues.price) || 0,
      }).eq('id', editingId);
      if (error) throw error;
      toast.success('Υλικό ενημερώθηκε');
      setEditingId(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from('materials').insert({
        code: form.code, name: form.name, source: form.source,
        stock: Number(form.stock) || 0, unit: form.unit, price: Number(form.price) || 0,
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

  const sharedTableProps = {
    hasRealData,
    editingId,
    editValues,
    onEdit: startEdit,
    onSave: saveEdit,
    onCancel: cancelEdit,
    onEditChange: (field: 'stock' | 'price', val: string) => setEditValues(v => ({ ...v, [field]: val })),
    sortField,
    sortDir,
    toggleSort,
  };

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
          <div className="flex items-center gap-2">
            <button
              onClick={syncFromSheet}
              disabled={syncing}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin text-primary' : ''}`} />
              {syncing ? 'Sync...' : 'Sync από Sheet'}
            </button>
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
                <p className="text-2xl font-extrabold font-mono">{materials.filter(m => m.source === 'OTE').length}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Υλικά OTE</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent/10 p-2"><Box className="h-4 w-4 text-accent" /></div>
              <div>
                <p className="text-2xl font-extrabold font-mono text-gradient-accent">{materials.filter(m => m.source === 'DELTANETWORK').length}</p>
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

        {/* Search */}
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
        </div>

        {/* OTE Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-primary/5">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-primary" />
              <h2 className="font-bold text-sm">Υλικά OTE</h2>
              <span className="text-[11px] text-muted-foreground font-mono ml-1">({oteItems.length} είδη)</span>
            </div>
            {oteValue > 0 && (
              <span className="text-[11px] text-muted-foreground font-mono">
                Αξία: <span className="font-semibold text-foreground">{oteValue.toLocaleString('el-GR', { minimumFractionDigits: 2 })}€</span>
              </span>
            )}
          </div>
          <MaterialTable items={oteItems} {...sharedTableProps} />
        </div>

        {/* DELTANETWORK Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-accent/5">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-accent" />
              <h2 className="font-bold text-sm">Υλικά DELTANETWORK</h2>
              <span className="text-[11px] text-muted-foreground font-mono ml-1">({deltaItems.length} είδη)</span>
            </div>
            {deltaValue > 0 && (
              <span className="text-[11px] text-muted-foreground font-mono">
                Αξία: <span className="font-semibold text-foreground">{deltaValue.toLocaleString('el-GR', { minimumFractionDigits: 2 })}€</span>
              </span>
            )}
          </div>
          <MaterialTable items={deltaItems} {...sharedTableProps} />
        </div>
      </div>
    </AppLayout>
  );
};

export default Materials;
