import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppLayout from "@/components/AppLayout";
import { useMaterials, useProfiles } from "@/hooks/useData";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Package, AlertTriangle, Search, Plus, Box, ArrowUpDown, Check, X, Pencil, Upload, FileText, Trash2, Download, History, Truck } from "lucide-react";
import ChargeToTechnicianDialog from "@/components/ChargeToTechnicianDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import XLSX from "xlsx-js-style";
import { formatDistanceToNow } from "date-fns";
import { el } from "date-fns/locale";

type SortField = 'code' | 'name' | 'stock' | 'price';

const headerStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" },
  fill: { fgColor: { rgb: "1F4E79" } },
  border: {
    top: { style: "thin", color: { rgb: "000000" } },
    bottom: { style: "thin", color: { rgb: "000000" } },
    left: { style: "thin", color: { rgb: "000000" } },
    right: { style: "thin", color: { rgb: "000000" } },
  },
  alignment: { horizontal: "center", vertical: "center" },
};

const cellBorder = {
  top: { style: "thin", color: { rgb: "B0B0B0" } },
  bottom: { style: "thin", color: { rgb: "B0B0B0" } },
  left: { style: "thin", color: { rgb: "B0B0B0" } },
  right: { style: "thin", color: { rgb: "B0B0B0" } },
};

const evenRowFill = { fgColor: { rgb: "D6E4F0" } };
const oddRowFill = { fgColor: { rgb: "FFFFFF" } };

const exportToExcel = (items: MaterialItem[], source: string) => {
  const headers = ['ΚΑΥ', 'ΠΕΡΙΓΡΑΦΗ', 'ΜΜ', 'ΠΟΣΟΤΗΤΑ', 'ΠΕΡΙΛΗΨΗ'];
  const ws = XLSX.utils.aoa_to_sheet([headers]);

  // Style header row
  headers.forEach((_, ci) => {
    const cell = XLSX.utils.encode_cell({ r: 0, c: ci });
    ws[cell].s = headerStyle;
  });

  // Add data rows with styling
  items.forEach((m, ri) => {
    const row = [m.code, m.name, m.unit, m.stock || '', ''];
    XLSX.utils.sheet_add_aoa(ws, [row], { origin: ri + 1 });

    const fill = ri % 2 === 0 ? evenRowFill : oddRowFill;
    row.forEach((_, ci) => {
      const cell = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
      if (!ws[cell]) ws[cell] = { v: '', t: 's' };
      ws[cell].s = {
        font: { sz: 10, name: "Calibri" },
        fill,
        border: cellBorder,
        alignment: {
          horizontal: ci === 0 || ci === 2 || ci === 3 ? "center" : "left",
          vertical: "center",
        },
      };
    });
  });

  // Column widths
  ws['!cols'] = [
    { wch: 12 },  // ΚΑΥ
    { wch: 45 },  // ΠΕΡΙΓΡΑΦΗ
    { wch: 6 },   // ΜΜ
    { wch: 12 },  // ΠΟΣΟΤΗΤΑ
    { wch: 60 },  // ΠΕΡΙΛΗΨΗ
  ];

  // Row heights
  ws['!rows'] = [{ hpx: 28 }]; // header taller

  const wb = XLSX.utils.book_new();
  const title = source === 'OTE' ? 'ΑΠΟΘΗΚΗ_ΥΛΙΚΑ_ΟΤΕ_FTTH' : `ΑΠΟΘΗΚΗ_ΥΛΙΚΑ_${source}`;
  XLSX.utils.book_append_sheet(wb, ws, 'Υλικά');
  XLSX.writeFile(wb, `${title}_${new Date().toISOString().slice(0, 10)}.xlsx`);
};
type SortDir = 'asc' | 'desc';

interface MaterialItem {
  id: string;
  code: string;
  name: string;
  stock: number;
  unit: string;
  source: 'OTE' | 'DELTANETWORK';
  price: number;
  low_stock_threshold: number;
}

const MaterialTable = ({ items, hasRealData, editingId, editValues, onEdit, onSave, onCancel, onEditChange, onDelete, onHistory, sortField, sortDir, toggleSort }: {
  items: MaterialItem[];
  hasRealData: boolean;
  editingId: string | null;
  editValues: { stock: string; price: string; name: string; unit: string; low_stock_threshold: string };
  onEdit: (m: MaterialItem) => void;
  onSave: () => void;
  onCancel: () => void;
  onEditChange: (field: 'stock' | 'price' | 'name' | 'unit' | 'low_stock_threshold', val: string) => void;
  onDelete: (m: MaterialItem) => void;
  onHistory: (m: MaterialItem) => void;
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
    <>
      {/* Mobile Card View */}
      <div className="md:hidden divide-y divide-border">
        {items.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Δεν βρέθηκαν υλικά</div>
        ) : items.map((m) => {
          const isEditing = editingId === m.id;
          const value = m.stock * m.price;
          const isLow = m.stock < m.low_stock_threshold;
          return (
            <div key={m.id} className={`p-3 ${isEditing ? 'bg-primary/5' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-primary">{m.code}</span>
                {isLow && <span className="flex items-center gap-1 text-destructive text-[10px] font-bold"><AlertTriangle className="h-3 w-3" /> Χαμηλό</span>}
              </div>
              <p className="text-sm font-medium truncate mb-1.5">{m.name}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold">{m.stock.toLocaleString('el-GR')} {/^τεμ/i.test(m.unit) ? 'τεμ.' : m.unit}</span>
                <span className="text-muted-foreground">{m.price > 0 ? `${m.price.toFixed(2)}€` : '—'}</span>
                <span className="font-bold">{value > 0 ? `${value.toLocaleString('el-GR', { minimumFractionDigits: 2 })}€` : '—'}</span>
              </div>
              {hasRealData && (
                <div className="flex items-center gap-1 justify-end mt-2">
                  <button onClick={() => onHistory(m)} className="rounded-lg p-1.5 text-muted-foreground/50 hover:text-accent-foreground hover:bg-accent/10"><History className="h-3.5 w-3.5" /></button>
                  <button onClick={() => onEdit(m)} className="rounded-lg p-1.5 text-muted-foreground/50 hover:text-primary hover:bg-primary/10"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => onDelete(m)} className="rounded-lg p-1.5 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <SortHeader field="code" label="Κωδικός" />
              <SortHeader field="name" label="Περιγραφή" />
              <SortHeader field="stock" label="Απόθεμα" align="right" />
              <SortHeader field="price" label="Τιμή" align="right" />
              <th className="py-3 px-4 text-right font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Αξία</th>
              <th className="py-3 px-4 text-right font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Όριο</th>
              {hasRealData && <th className="py-3 px-2 w-10" />}
            </tr>
          </thead>
          <tbody>
            {items.map((m) => {
              const isEditing = editingId === m.id;
              const value = m.stock * m.price;
              const isLow = m.stock < m.low_stock_threshold;
              return (
                <tr key={m.id} className={`border-b border-border/50 transition-colors ${isEditing ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                  <td className="py-3 px-4 text-xs font-bold text-primary">{m.code}</td>
                  <td className="py-3 px-4 font-medium">
                    {isEditing ? (
                      <input type="text" value={editValues.name} onChange={e => onEditChange('name', e.target.value)} className="w-full rounded-lg border border-primary/30 bg-card px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    ) : m.name}
                  </td>
                  <td className="py-3 px-4 text-right font-bold">
                    {isEditing ? (
                      <div className="flex items-center gap-1 justify-end">
                        <input type="number" value={editValues.stock} onChange={e => onEditChange('stock', e.target.value)} className="w-20 rounded-lg border border-primary/30 bg-card px-2 py-1 text-right text-sm font-bold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" autoFocus />
                        <input type="text" value={editValues.unit} onChange={e => onEditChange('unit', e.target.value)} className="w-16 rounded-lg border border-primary/30 bg-card px-1 py-1 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                      </div>
                    ) : (
                      <span className={`inline-flex items-center gap-1.5 ${isLow ? 'text-destructive font-semibold' : ''}`}>
                        {isLow && <AlertTriangle className="h-3 w-3" />}
                        {m.stock.toLocaleString('el-GR')} {/^τεμ/i.test(m.unit) ? 'τεμάχια' : m.unit}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-muted-foreground">
                    {isEditing ? (
                      <input type="number" step="0.01" value={editValues.price} onChange={e => onEditChange('price', e.target.value)} className="w-20 ml-auto rounded-lg border border-primary/30 bg-card px-2 py-1 text-right text-sm font-bold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    ) : (m.price === 0 ? <span className="text-muted-foreground/40">—</span> : `${m.price.toFixed(2)}€`)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold">
                    {value === 0 ? <span className="text-muted-foreground/40">—</span> : `${value.toLocaleString('el-GR', { minimumFractionDigits: 2 })}€`}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-xs">
                    {isEditing ? (
                      <input type="number" value={editValues.low_stock_threshold} onChange={e => onEditChange('low_stock_threshold', e.target.value)} className="w-16 ml-auto rounded-lg border border-primary/30 bg-card px-2 py-1 text-right text-sm font-bold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    ) : (<span className="text-muted-foreground">{m.low_stock_threshold}</span>)}
                  </td>
                  {hasRealData && (
                    <td className="py-3 px-2 text-right">
                      {isEditing ? (
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={onSave} className="rounded-lg p-1.5 text-success hover:bg-success/10 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={onCancel} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-0.5 justify-end">
                          <button onClick={() => onHistory(m)} className="rounded-lg p-1.5 text-muted-foreground/50 hover:text-accent-foreground hover:bg-accent/10 transition-colors" title="Ιστορικό"><History className="h-3.5 w-3.5" /></button>
                          <button onClick={() => onEdit(m)} className="rounded-lg p-1.5 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => onDelete(m)} className="rounded-lg p-1.5 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={hasRealData ? 7 : 6} className="py-12 text-center text-muted-foreground text-sm">Δεν βρέθηκαν υλικά</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

const Materials = () => {
  const { data: dbMaterials, refetch } = useMaterials();
  const { organization } = useOrganization();
  const orgName = organization?.name || 'DELTANETWORK';
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ stock: '', price: '', name: '', unit: '', low_stock_threshold: '' });
  const [deleteTarget, setDeleteTarget] = useState<MaterialItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [previewData, setPreviewData] = useState<{ source: string; materials: { code: string; name: string; quantity: number; unit: string }[] } | null>(null);
  const [confirmingUpload, setConfirmingUpload] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const queryClient = useQueryClient();

  const [form, setForm] = useState({ code: '', name: '', source: 'OTE' as string, stock: '', unit: 'τεμ.', price: '' });
  const [historyMaterial, setHistoryMaterial] = useState<MaterialItem | null>(null);
  const { data: profiles } = useProfiles();

  const { data: stockHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["stock_history", historyMaterial?.id],
    queryFn: async () => {
      if (!historyMaterial) return [];
      const { data, error } = await supabase
        .from("material_stock_history" as any)
        .select("*")
        .eq("material_id", historyMaterial.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!historyMaterial,
  });

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>, uploadSource: 'OTE' | 'DELTANETWORK') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
    if (pdfFiles.length === 0) {
      toast.error('Μόνο PDF αρχεία');
      return;
    }
    
    setUploading(true);
    setUploadResult(null);
    const allExtracted: { code: string; name: string; quantity: number; unit: string }[] = [];
    
    try {
      for (let i = 0; i < pdfFiles.length; i++) {
        toast.info(`Ανάγνωση PDF ${i + 1}/${pdfFiles.length} (${uploadSource})...`);
        const formData = new FormData();
        formData.append('file', pdfFiles[i]);
        formData.append('source', uploadSource);
        
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-delivery-note`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: formData,
          }
        );
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Failed: ${pdfFiles[i].name}`);
        
        if (data.extracted) allExtracted.push(...data.extracted);
      }
      
      if (allExtracted.length === 0) {
        toast.info('Δεν βρέθηκαν υλικά στα PDF');
        return;
      }

      // Show confirmation dialog instead of saving directly
      setPreviewData({ source: uploadSource, materials: allExtracted });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleConfirmUpload = async () => {
    if (!previewData) return;
    setConfirmingUpload(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-delivery-note`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            source: previewData.source,
            materials: previewData.materials.filter(m => m.quantity > 0),
            organization_id: organization?.id || null,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save');
      
      setUploadResult(data);
      setPreviewData(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      
      if (data.updated > 0 || data.created > 0) {
        toast.success(`Ενημερώθηκαν ${data.updated} υλικά, δημιουργήθηκαν ${data.created} νέα`);
      }
      if (data.not_found?.length > 0) {
        toast.warning(`${data.not_found.length} κωδικοί δεν αποθηκεύτηκαν`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConfirmingUpload(false);
    }
  };

  const updatePreviewQuantity = (index: number, newQty: number) => {
    if (!previewData) return;
    setPreviewData({
      ...previewData,
      materials: previewData.materials.map((m, i) => i === index ? { ...m, quantity: newQty } : m),
    });
  };

  const removePreviewItem = (index: number) => {
    if (!previewData) return;
    setPreviewData({
      ...previewData,
      materials: previewData.materials.filter((_, i) => i !== index),
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from('materials').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Υλικό διαγράφηκε');
      setDeleteTarget(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const materials: MaterialItem[] = dbMaterials
    ? dbMaterials.map(m => ({
        id: m.id,
        code: m.code,
        name: m.name,
        stock: Number(m.stock),
        unit: m.unit,
        source: m.source as 'OTE' | 'DELTANETWORK',
        price: Number(m.price),
        low_stock_threshold: Number((m as any).low_stock_threshold ?? 100),
      }))
    : [];

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
  const lowStock = materials.filter(m => m.stock < m.low_stock_threshold).length;
  const oteValue = materials.filter(m => m.source === 'OTE').reduce((s, m) => s + m.stock * m.price, 0);
  const deltaValue = materials.filter(m => m.source === 'DELTANETWORK').reduce((s, m) => s + m.stock * m.price, 0);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const startEdit = (m: MaterialItem) => {
    setEditingId(m.id);
    setEditValues({ stock: String(m.stock), price: String(m.price), name: m.name, unit: m.unit, low_stock_threshold: String(m.low_stock_threshold) });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const { error } = await supabase.from('materials').update({
        stock: Number(editValues.stock) || 0,
        price: Number(editValues.price) || 0,
        name: editValues.name.trim(),
        unit: editValues.unit.trim(),
        low_stock_threshold: Number(editValues.low_stock_threshold) || 100,
      } as any).eq('id', editingId);
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
        organization_id: organization?.id || null,
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
    hasRealData: (dbMaterials?.length ?? 0) > 0,
    editingId,
    editValues,
    onEdit: startEdit,
    onSave: saveEdit,
    onCancel: cancelEdit,
    onEditChange: (field: 'stock' | 'price' | 'name' | 'unit' | 'low_stock_threshold', val: string) => setEditValues(v => ({ ...v, [field]: val })),
    onDelete: (m: MaterialItem) => setDeleteTarget(m),
    onHistory: (m: MaterialItem) => setHistoryMaterial(m),
    sortField,
    sortDir,
    toggleSort,
  };

  return (
    <AppLayout>
      <div className="space-y-6 w-full">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Αποθήκη Υλικών</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Διαχείριση αποθεμάτων OTE & {orgName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className={`flex items-center gap-1.5 rounded-xl border-2 border-primary/40 bg-primary/8 px-3 py-2 text-xs sm:text-sm font-bold text-primary hover:bg-primary/15 hover:border-primary/60 transition-all cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              <Upload className={`h-3.5 w-3.5 ${uploading ? 'animate-pulse' : ''}`} />
              {uploading ? 'PDF...' : 'Δελτίο OTE'}
              <input type="file" accept=".pdf" multiple onChange={(e) => handlePdfUpload(e, 'OTE')} className="hidden" disabled={uploading} />
            </label>
            <label className={`flex items-center gap-1.5 rounded-xl border-2 border-accent/40 bg-accent/8 px-3 py-2 text-xs sm:text-sm font-bold text-accent hover:bg-accent/15 hover:border-accent/60 transition-all cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              <Upload className={`h-3.5 w-3.5 ${uploading ? 'animate-pulse' : ''}`} />
              {uploading ? 'PDF...' : `Δελτίο ${orgName}`}
              <input type="file" accept=".pdf" multiple onChange={(e) => handlePdfUpload(e, 'DELTANETWORK')} className="hidden" disabled={uploading} />
            </label>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <button className="flex items-center gap-1.5 rounded-xl cosmote-gradient px-3 py-2 text-xs sm:text-sm font-bold text-white shadow-lg shadow-primary/20 hover:opacity-90 transition-all">
                  <Plus className="h-3.5 w-3.5" />
                  Νέο Υλικό
                </button>
              </DialogTrigger>
            <button
              onClick={() => setChargeOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border-2 border-primary/30 bg-card px-3 py-2 text-xs sm:text-sm font-bold text-primary hover:bg-primary/10 transition-all"
            >
              <Truck className="h-3.5 w-3.5" />
              Χρέωση σε Τεχνικό
            </button>
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
                      <option value="DELTANETWORK">{orgName}</option>
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
                <p className="text-2xl font-extrabold text-gradient-primary">{materials.length}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Συνολικά Είδη</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2"><Box className="h-4 w-4 text-primary" /></div>
              <div>
                <p className="text-2xl font-extrabold">{materials.filter(m => m.source === 'OTE').length}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Υλικά OTE</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent/10 p-2"><Box className="h-4 w-4 text-accent" /></div>
              <div>
                <p className="text-2xl font-extrabold text-gradient-accent">{materials.filter(m => m.source === 'DELTANETWORK').length}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Υλικά {orgName}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${lowStock > 0 ? 'bg-warning/10' : 'bg-success/10'}`}>
                <AlertTriangle className={`h-4 w-4 ${lowStock > 0 ? 'text-warning' : 'text-success'}`} />
              </div>
              <div>
                <p className="text-2xl font-extrabold">{lowStock}</p>
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

        {/* Upload Result */}
        {uploadResult && uploadResult.extracted?.length > 0 && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="font-bold text-sm">Αποτελέσματα Δελτίου Αποστολής</h3>
              </div>
              <button onClick={() => setUploadResult(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg bg-card p-3 text-center">
                <p className="text-lg font-bold text-primary">{uploadResult.extracted.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Υλικά στο PDF</p>
              </div>
              <div className="rounded-lg bg-card p-3 text-center">
                <p className="text-lg font-bold text-accent">{uploadResult.updated}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Ενημερώθηκαν</p>
              </div>
              <div className="rounded-lg bg-card p-3 text-center">
                <p className="text-lg font-bold text-destructive">{uploadResult.not_found?.length || 0}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Δεν βρέθηκαν</p>
              </div>
            </div>
            {uploadResult.not_found?.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Μη αναγνωρισμένοι κωδικοί: <span className="font-bold">{uploadResult.not_found.join(', ')}</span>
              </p>
            )}
          </div>
        )}

        {/* Tabs OTE / DELTANETWORK */}
        <Tabs defaultValue="ote" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="ote" className="gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              OTE <span className="text-[11px] text-muted-foreground font-mono ml-1">({oteItems.length})</span>
            </TabsTrigger>
            <TabsTrigger value="delta" className="gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-accent" />
              {orgName} <span className="text-[11px] text-muted-foreground font-mono ml-1">({deltaItems.length})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ote">
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-primary/5">
              <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-primary" />
                  <h2 className="font-bold text-sm">Υλικά OTE</h2>
                  <span className="text-[11px] text-muted-foreground font-mono ml-1">({oteItems.length} είδη)</span>
                </div>
                <div className="flex items-center gap-3">
                  {oteValue > 0 && (
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Αξία: <span className="font-semibold text-foreground">{oteValue.toLocaleString('el-GR', { minimumFractionDigits: 2 })}€</span>
                    </span>
                  )}
                  <button onClick={() => exportToExcel(oteItems, 'OTE')} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <Download className="h-3 w-3" /> Export
                  </button>
                </div>
              </div>
              <MaterialTable items={oteItems} {...sharedTableProps} />
            </div>
          </TabsContent>

          <TabsContent value="delta">
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-accent/5">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-accent" />
                  <h2 className="font-bold text-sm">Υλικά {orgName}</h2>
                  <span className="text-[11px] text-muted-foreground font-mono ml-1">({deltaItems.length} είδη)</span>
                </div>
                <div className="flex items-center gap-3">
                  {deltaValue > 0 && (
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Αξία: <span className="font-semibold text-foreground">{deltaValue.toLocaleString('el-GR', { minimumFractionDigits: 2 })}€</span>
                    </span>
                  )}
                  <button onClick={() => exportToExcel(deltaItems, 'DELTANETWORK')} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <Download className="h-3 w-3" /> Export
                  </button>
                </div>
              </div>
              <MaterialTable items={deltaItems} {...sharedTableProps} />
            </div>
          </TabsContent>
        </Tabs>

        {/* Delivery Note Preview/Confirmation Dialog */}
        <Dialog open={!!previewData} onOpenChange={(open) => !open && setPreviewData(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh]">
            <div className="flex h-[70vh] min-h-0 flex-col">
              <div className="pb-2">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Επιβεβαίωση Δελτίου Αποστολής — {previewData?.source}
                  </DialogTitle>
                  <DialogDescription>
                    Ελέγξτε τα υλικά και τις ποσότητες πριν την αποθήκευση. Μπορείτε να τροποποιήσετε ποσότητες ή να αφαιρέσετε γραμμές.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-muted/80 backdrop-blur-sm">
                      <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Κωδικός</th>
                      <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Περιγραφή</th>
                      <th className="py-2.5 px-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Ποσότητα</th>
                      <th className="py-2.5 px-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Μονάδα</th>
                      <th className="py-2.5 px-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {previewData?.materials.map((item, idx) => (
                      <tr key={idx} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-3 text-xs font-bold text-primary font-mono">{item.code}</td>
                        <td className="py-2.5 px-3 text-sm">{item.name}</td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updatePreviewQuantity(idx, Number(e.target.value) || 0)}
                            className="w-24 rounded-lg border border-border bg-card px-2 py-1 text-right text-sm font-bold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-center text-xs text-muted-foreground">{item.unit}</td>
                        <td className="py-2.5 px-1">
                          <button
                            onClick={() => removePreviewItem(idx)}
                            className="rounded-lg p-1.5 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Αφαίρεση"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(!previewData?.materials || previewData.materials.length === 0) && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">Δεν υπάρχουν υλικά</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <p className="text-sm text-muted-foreground">
                  {previewData?.materials.length || 0} υλικά — Σύνολο: <span className="font-bold text-foreground">{(previewData?.materials || []).reduce((s, m) => s + m.quantity, 0).toLocaleString('el-GR')}</span> τεμάχια
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewData(null)}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    Ακύρωση
                  </button>
                  {(previewData?.materials?.length || 0) > 0 && (
                    <button
                      onClick={handleConfirmUpload}
                      disabled={confirmingUpload}
                      className="rounded-xl cosmote-gradient px-5 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50"
                    >
                      {confirmingUpload ? 'Αποθήκευση...' : 'Επιβεβαίωση & Αποθήκευση'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Διαγραφή Υλικού</AlertDialogTitle>
              <AlertDialogDescription>
                Θέλετε να διαγράψετε το υλικό <strong>{deleteTarget?.code}</strong> — {deleteTarget?.name};
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Ακύρωση</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Διαγραφή</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Stock History Dialog */}
        <Dialog open={!!historyMaterial} onOpenChange={(open) => !open && setHistoryMaterial(null)}>
          <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Ιστορικό Αποθέματος
              </DialogTitle>
              {historyMaterial && (
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-mono text-primary font-semibold">{historyMaterial.code}</span> — {historyMaterial.name}
                </p>
              )}
            </DialogHeader>
            <div className="overflow-y-auto flex-1 -mx-6 px-6">
              {historyLoading ? (
                <div className="py-8 text-center text-muted-foreground text-sm">Φόρτωση...</div>
              ) : !stockHistory || stockHistory.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  Δεν υπάρχει ιστορικό αλλαγών ακόμα
                </div>
              ) : (
                <div className="relative pl-6 space-y-0">
                  {/* Timeline line */}
                  <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
                  {(stockHistory as any[]).map((entry: any, i: number) => {
                    const change = Number(entry.change_amount);
                    const isPositive = change > 0;
                    const changedByProfile = profiles?.find(p => p.user_id === entry.changed_by);
                    return (
                      <div key={entry.id} className="relative pb-4">
                        {/* Timeline dot */}
                        <div className={`absolute -left-6 top-1.5 h-[14px] w-[14px] rounded-full border-2 ${
                          isPositive ? 'bg-success/20 border-success' : 'bg-destructive/20 border-destructive'
                        }`} />
                        <div className="rounded-lg border border-border bg-card p-3">
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-bold font-mono ${isPositive ? 'text-success' : 'text-destructive'}`}>
                              {isPositive ? '+' : ''}{change.toLocaleString('el-GR')}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true, locale: el })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span className="font-mono">{Number(entry.old_stock).toLocaleString('el-GR')}</span>
                            <span>→</span>
                            <span className="font-mono font-semibold text-foreground">{Number(entry.new_stock).toLocaleString('el-GR')}</span>
                          </div>
                          {(entry.reason || changedByProfile) && (
                            <div className="mt-1.5 text-[11px] text-muted-foreground">
                              {changedByProfile && <span>από {changedByProfile.full_name}</span>}
                              {entry.reason && <span className="ml-1">— {entry.reason}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default Materials;
