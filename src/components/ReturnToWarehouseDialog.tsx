import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Undo2, Plus, Minus, User } from "lucide-react";

interface ReturnToWarehouseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, skip technician selection and return from this tech */
  technicianId?: string;
  technicianName?: string;
}

const ReturnToWarehouseDialog = ({ open, onOpenChange, technicianId, technicianName }: ReturnToWarehouseDialogProps) => {
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedTechnician, setSelectedTechnician] = useState<string | null>(technicianId || null);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<{ material_id: string; quantity: number }[]>([]);
  const [saving, setSaving] = useState(false);

  const effectiveTechId = technicianId || selectedTechnician;

  // Fetch technicians (only if no technicianId prop)
  const { data: technicians } = useQuery({
    queryKey: ["technicians-for-return", organizationId],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "technician");
      if (!roles?.length) return [];
      const techIds = roles.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, area")
        .eq("organization_id", organizationId!)
        .in("user_id", techIds);
      return profiles || [];
    },
    enabled: open && !!organizationId && !technicianId,
  });

  // Fetch technician's inventory
  const { data: inventory } = useQuery({
    queryKey: ["tech-inventory-for-return", effectiveTechId],
    queryFn: async () => {
      const { data } = await supabase
        .from("technician_inventory" as any)
        .select("id, material_id, quantity")
        .eq("technician_id", effectiveTechId!);
      return (data || []).filter((i: any) => Number(i.quantity) > 0) as any[];
    },
    enabled: open && !!effectiveTechId,
  });

  const materialIds = useMemo(() => (inventory || []).map((i: any) => i.material_id), [inventory]);

  const { data: materials } = useQuery({
    queryKey: ["inventory-materials-return", materialIds],
    queryFn: async () => {
      if (materialIds.length === 0) return [];
      const { data } = await supabase
        .from("materials")
        .select("id, code, name, stock, unit, source")
        .in("id", materialIds);
      return data || [];
    },
    enabled: materialIds.length > 0,
  });

  const invMap = useMemo(() => new Map((inventory || []).map((i: any) => [i.material_id, Number(i.quantity)])), [inventory]);
  const matMap = useMemo(() => new Map((materials || []).map(m => [m.id, m])), [materials]);

  const filteredMaterials = useMemo(() => {
    const mats = (inventory || [])
      .map((i: any) => ({ ...matMap.get(i.material_id), invQty: Number(i.quantity) }))
      .filter((m: any) => m.id);
    if (!search) return mats;
    const q = search.toLowerCase();
    return mats.filter((m: any) => m.code?.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q));
  }, [inventory, matMap, search]);

  const itemMap = useMemo(() => new Map(items.map(i => [i.material_id, i.quantity])), [items]);

  const updateItem = (materialId: string, qty: number) => {
    if (qty <= 0) {
      setItems(prev => prev.filter(i => i.material_id !== materialId));
    } else {
      setItems(prev => {
        const exists = prev.find(i => i.material_id === materialId);
        if (exists) return prev.map(i => i.material_id === materialId ? { ...i, quantity: qty } : i);
        return [...prev, { material_id: materialId, quantity: qty }];
      });
    }
  };

  const handleSave = async () => {
    if (!effectiveTechId || items.length === 0 || !organizationId) return;
    setSaving(true);
    try {
      for (const item of items) {
        const currentInv = invMap.get(item.material_id) || 0;
        if (item.quantity > currentInv) {
          const mat = matMap.get(item.material_id);
          toast.error(`Ο τεχνικός δεν έχει αρκετά ${mat?.code || "υλικά"} (διαθέσιμα: ${currentInv})`);
          setSaving(false);
          return;
        }
      }

      for (const item of items) {
        const mat = matMap.get(item.material_id);
        const currentInv = invMap.get(item.material_id) || 0;

        // 1. Deduct from technician inventory
        const newInvQty = currentInv - item.quantity;
        await supabase
          .from("technician_inventory" as any)
          .update({ quantity: newInvQty, updated_at: new Date().toISOString() })
          .eq("technician_id", effectiveTechId)
          .eq("material_id", item.material_id);

        // 2. Add back to central warehouse
        const centralStock = Number(mat?.stock || 0);
        await supabase
          .from("materials")
          .update({ stock: centralStock + item.quantity })
          .eq("id", item.material_id);

        // 3. Log history
        await supabase.from("technician_inventory_history" as any).insert({
          technician_id: effectiveTechId,
          material_id: item.material_id,
          organization_id: organizationId,
          change_amount: -item.quantity,
          reason: "Επιστροφή στην αποθήκη",
          changed_by: user?.id,
        });
      }

      toast.success(`Επιστράφηκαν ${items.length} υλικά στην κεντρική αποθήκη`);
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: ["technician-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["tech-inventory-for-return"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-materials-return"] });
      setItems([]);
      if (!technicianId) setSelectedTechnician(null);
      setSearch("");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα επιστροφής");
    } finally {
      setSaving(false);
    }
  };

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const selectedTechNameResolved = technicianName || technicians?.find(t => t.user_id === selectedTechnician)?.full_name || "";

  const handleClose = (v: boolean) => {
    if (!v) {
      setItems([]);
      if (!technicianId) setSelectedTechnician(null);
      setSearch("");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-4 w-4 text-primary" />
            Επιστροφή Υλικών στην Αποθήκη
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Select Technician (only if no technicianId prop) */}
        {!technicianId && !selectedTechnician ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Επιλέξτε τεχνικό:</p>
            <div className="grid gap-2">
              {technicians?.map(t => (
                <button
                  key={t.user_id}
                  onClick={() => setSelectedTechnician(t.user_id)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:bg-muted/50 hover:border-primary/30 transition-all text-left"
                >
                  <div className="rounded-full bg-primary/10 p-2">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t.full_name}</p>
                    {t.area && <p className="text-xs text-muted-foreground">{t.area}</p>}
                  </div>
                </button>
              ))}
              {(!technicians || technicians.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">Δεν βρέθηκαν τεχνικοί</p>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Selected technician header */}
            <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{selectedTechNameResolved}</span>
              </div>
              {!technicianId && (
                <button onClick={() => { setSelectedTechnician(null); setItems([]); }} className="text-xs text-muted-foreground hover:text-foreground">
                  Αλλαγή
                </button>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Αναζήτηση υλικού..."
                className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Materials list */}
            <div className="flex-1 min-h-0 overflow-y-auto max-h-[40vh] rounded-lg border border-border">
              {filteredMaterials.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Ο τεχνικός δεν έχει υλικά</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                    <tr className="border-b border-border">
                      <th className="py-2 px-3 text-left text-[11px] font-semibold text-muted-foreground uppercase">Κωδικός</th>
                      <th className="py-2 px-3 text-left text-[11px] font-semibold text-muted-foreground uppercase">Περιγραφή</th>
                      <th className="py-2 px-3 text-right text-[11px] font-semibold text-muted-foreground uppercase">Έχει</th>
                      <th className="py-2 px-3 text-center text-[11px] font-semibold text-muted-foreground uppercase">Επιστροφή</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaterials.map((m: any) => {
                      const qty = itemMap.get(m.id) || 0;
                      return (
                        <tr key={m.id} className={`border-b border-border/50 transition-colors ${qty > 0 ? 'bg-primary/5' : 'hover:bg-muted/20'}`}>
                          <td className="py-2 px-3 text-xs font-mono font-bold text-primary">{m.code}</td>
                          <td className="py-2 px-3 text-xs">{m.name}</td>
                          <td className="py-2 px-3 text-right text-xs font-mono text-muted-foreground">{m.invQty.toLocaleString('el-GR')}</td>
                          <td className="py-2 px-3">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => updateItem(m.id, Math.max(0, qty - 1))}
                                disabled={qty === 0}
                                className="rounded-md p-1 hover:bg-muted disabled:opacity-30 transition-colors"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <input
                                type="number"
                                value={qty || ""}
                                onChange={e => updateItem(m.id, Math.max(0, Math.min(m.invQty, Number(e.target.value) || 0)))}
                                className="w-16 rounded-md border border-border bg-card text-center text-sm py-1 focus:border-primary focus:outline-none"
                                placeholder="0"
                                min={0}
                                max={m.invQty}
                              />
                              <button
                                onClick={() => updateItem(m.id, Math.min(m.invQty, qty + 1))}
                                disabled={qty >= m.invQty}
                                className="rounded-md p-1 hover:bg-muted disabled:opacity-30 transition-colors"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border pt-3">
              <p className="text-sm text-muted-foreground">
                {items.length} υλικά — <span className="font-bold text-foreground">{totalItems.toLocaleString('el-GR')}</span> τεμάχια
              </p>
              <button
                onClick={handleSave}
                disabled={saving || items.length === 0}
                className="rounded-xl cosmote-gradient px-5 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50"
              >
                {saving ? "Αποθήκευση..." : "Επιστροφή"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ReturnToWarehouseDialog;
