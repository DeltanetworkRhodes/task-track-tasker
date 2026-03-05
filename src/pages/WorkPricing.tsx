import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { useWorkPricing } from "@/hooks/useData";
import { Search, ArrowUpDown, FileText } from "lucide-react";

type SortField = 'code' | 'description' | 'unit_price' | 'category';
type SortDir = 'asc' | 'desc';

const WorkPricing = () => {
  const { data: workPricing, isLoading } = useWorkPricing();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

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
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Τιμοκατάλογος Εργασιών</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Τιμές εργασιών OTE — {filtered.length} εγγραφές
          </p>
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
                  {workPricing ? (workPricing.reduce((s, w) => s + Number(w.unit_price), 0) / workPricing.length).toFixed(2) : '0'}€
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
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="py-12 text-center text-muted-foreground text-sm">Φόρτωση...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center text-muted-foreground text-sm">Δεν βρέθηκαν εργασίες</td></tr>
                ) : filtered.map(w => (
                  <tr key={w.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-primary">{w.code}</td>
                    <td className="py-3 px-4 font-medium">{w.description}</td>
                    <td className="py-3 px-4">
                      {w.category ? (
                        <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">{w.category}</span>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-4 text-center text-muted-foreground">{w.unit}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold">{Number(w.unit_price).toFixed(2)}€</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default WorkPricing;
