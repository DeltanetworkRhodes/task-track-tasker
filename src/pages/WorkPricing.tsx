import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { useWorkPricing } from "@/hooks/useData";
import { Search, ArrowUpDown, FileText, Plus, Pencil, Check, X, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";

type SortField = 'code' | 'description' | 'unit_price' | 'category';
type SortDir = 'asc' | 'desc';

interface WorkItem {
  id: string;
  code: string;
  description: string;
  category: string | null;
  unit: string;
  unit_price: number;
}

const WorkPricing = () => {
  const { data: workPricing, isLoading } = useWorkPricing();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // CRUD state
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ code: '', description: '', category: '', unit: '', unit_price: '' });
  const [deleteTarget, setDeleteTarget] = useState<WorkItem | null>(null);
  const [form, setForm] = useState({ code: '', description: '', category: '', unit: 'τεμ.', unit_price: '' });

  const categories = useMemo(() => {
    if (!workPricing) return [];
    const cats = [...new Set(workPricing.map(w => w.category).filter(Boolean))];
    return cats.sort();
  }, [workPricing]);

  const filtered = useMemo(() => {
    if (!workPricing) return [];
    let result = workPricing.filter(w => {
      const matchSearch = search === '' ||
        w.code.toLowerCase().includes(search.toLowerCase()) ||
        w.description.toLowerCase().includes(search.toLowerCase());
      const matchCategory = selectedCategory === 'all' || w.category === selectedCategory;
      return matchSearch && matchCategory;
    });
    result.sort((a, b) => {
      const aVal = a[sortField] ?? '';
      const bVal = b[sortField] ?? '';
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (Number(aVal) - Number(bVal)) : (Number(bVal) - Number(aVal));
    });
    return result;
  }, [workPricing, search, sortField, sortDir, selectedCategory]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from('work_pricing').insert({
        code: form.code.trim(),
        description: form.description.trim(),
        category: form.category.trim() || null,
        unit: form.unit.trim() || 'τεμ.',
        unit_price: Number(form.unit_price) || 0,
      });
      if (error) throw error;
      toast.success('Εργασία προστέθηκε');
      setForm({ code: '', description: '', category: '', unit: 'τεμ.', unit_price: '' });
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["work_pricing"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (w: WorkItem) => {
    setEditingId(w.id);
    setEditValues({
      code: w.code,
      description: w.description,
      category: w.category || '',
      unit: w.unit,
      unit_price: String(w.unit_price),
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const { error } = await supabase.from('work_pricing').update({
        code: editValues.code.trim(),
        description: editValues.description.trim(),
        category: editValues.category.trim() || null,
        unit: editValues.unit.trim(),
        unit_price: Number(editValues.unit_price) || 0,
      }).eq('id', editingId);
      if (error) throw error;
      toast.success('Εργασία ενημερώθηκε');
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["work_pricing"] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from('work_pricing').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Εργασία διαγράφηκε');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["work_pricing"] });
    } catch (err: any) {
      toast.error(err.message);
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
      <div className="space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Τιμοκατάλογος Εργασιών</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Διαχείριση τιμών εργασιών — {filtered.length} εγγραφές
            </p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-2 rounded-xl cosmote-gradient px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:opacity-90 transition-all self-start sm:self-auto">
                <Plus className="h-4 w-4" />
                Νέα Εργασία
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Προσθήκη Εργασίας</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Κωδικός</label>
                    <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} required className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Κατηγορία</label>
                    <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="π.χ. BCP, Αυτοψία" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Περιγραφή</label>
                  <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Μονάδα</label>
                    <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Τιμή Μονάδας (€)</label>
                    <input type="number" step="0.01" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                </div>
                <button type="submit" disabled={saving} className="w-full rounded-xl cosmote-gradient px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50">
                  {saving ? 'Αποθήκευση...' : 'Προσθήκη'}
                </button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2"><FileText className="h-4 w-4 text-primary" /></div>
              <div>
                <p className="text-2xl font-extrabold font-mono">{workPricing?.length ?? 0}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Συνολικές Εργασίες</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent/10 p-2"><FileText className="h-4 w-4 text-accent" /></div>
              <div>
                <p className="text-2xl font-extrabold font-mono">{categories.length}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Κατηγορίες</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2"><FileText className="h-4 w-4 text-primary" /></div>
              <div>
                <p className="text-2xl font-extrabold font-mono">
                  {workPricing ? (workPricing.reduce((s, w) => s + Number(w.unit_price), 0) / Math.max(workPricing.length, 1)).toFixed(2) : '0'}€
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Μέση Τιμή</p>
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
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
          >
            <option value="all">Όλες οι κατηγορίες</option>
            {categories.map(c => (
              <option key={c} value={c!}>{c}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <SortHeader field="code" label="Κωδικός" />
                  <SortHeader field="description" label="Περιγραφή" />
                  <SortHeader field="category" label="Κατηγορία" />
                  <th className="py-3 px-4 text-center font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Μονάδα</th>
                  <SortHeader field="unit_price" label="Τιμή Μονάδας" align="right" />
                  <th className="py-3 px-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">Φόρτωση...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">Δεν βρέθηκαν εργασίες</td></tr>
                ) : filtered.map(w => {
                  const isEditing = editingId === w.id;
                  return (
                    <tr key={w.id} className={`border-b border-border/50 transition-colors ${isEditing ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-primary">
                        {isEditing ? (
                          <input type="text" value={editValues.code} onChange={e => setEditValues(v => ({ ...v, code: e.target.value }))} className="w-24 rounded-lg border border-primary/30 bg-card px-2 py-1 text-sm font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        ) : w.code}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {isEditing ? (
                          <input type="text" value={editValues.description} onChange={e => setEditValues(v => ({ ...v, description: e.target.value }))} className="w-full rounded-lg border border-primary/30 bg-card px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        ) : w.description}
                      </td>
                      <td className="py-3 px-4">
                        {isEditing ? (
                          <input type="text" value={editValues.category} onChange={e => setEditValues(v => ({ ...v, category: e.target.value }))} className="w-28 rounded-lg border border-primary/30 bg-card px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        ) : w.category ? (
                          <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">{w.category}</span>
                        ) : '—'}
                      </td>
                      <td className="py-3 px-4 text-center text-muted-foreground">
                        {isEditing ? (
                          <input type="text" value={editValues.unit} onChange={e => setEditValues(v => ({ ...v, unit: e.target.value }))} className="w-16 mx-auto rounded-lg border border-primary/30 bg-card px-2 py-1 text-sm text-center focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        ) : w.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold">
                        {isEditing ? (
                          <input type="number" step="0.01" value={editValues.unit_price} onChange={e => setEditValues(v => ({ ...v, unit_price: e.target.value }))} className="w-24 ml-auto rounded-lg border border-primary/30 bg-card px-2 py-1 text-right text-sm font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        ) : `${Number(w.unit_price).toFixed(2)}€`}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {isEditing ? (
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={saveEdit} className="rounded-lg p-1.5 text-success hover:bg-success/10 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                            <button onClick={() => setEditingId(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-0.5 justify-end">
                            <button onClick={() => startEdit(w as WorkItem)} className="rounded-lg p-1.5 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => setDeleteTarget(w as WorkItem)} className="rounded-lg p-1.5 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Διαγραφή Εργασίας</AlertDialogTitle>
              <AlertDialogDescription>
                Θέλετε να διαγράψετε την εργασία <strong>{deleteTarget?.code}</strong> — {deleteTarget?.description};
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Ακύρωση</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Διαγραφή</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
};

export default WorkPricing;
