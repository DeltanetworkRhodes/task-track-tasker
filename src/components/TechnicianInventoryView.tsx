import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Package, ArrowDown, ArrowUp, History, Undo2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { el } from "date-fns/locale";
import ReturnToWarehouseDialog from "@/components/ReturnToWarehouseDialog";

const TechnicianInventoryView = () => {
  const { user } = useAuth();

  const { data: inventory, isLoading } = useQuery({
    queryKey: ["technician-inventory", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("technician_inventory" as any)
        .select("id, material_id, quantity, updated_at")
        .eq("technician_id", user!.id);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  const materialIds = useMemo(() => (inventory || []).map((i: any) => i.material_id), [inventory]);

  const { data: materials } = useQuery({
    queryKey: ["inventory-materials", materialIds],
    queryFn: async () => {
      if (materialIds.length === 0) return [];
      const { data } = await supabase
        .from("materials")
        .select("id, code, name, unit, source")
        .in("id", materialIds);
      return data || [];
    },
    enabled: materialIds.length > 0,
  });

  const { data: history } = useQuery({
    queryKey: ["technician-inventory-history", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("technician_inventory_history" as any)
        .select("id, material_id, change_amount, reason, construction_sr_id, created_at")
        .eq("technician_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  const materialMap = useMemo(() => new Map((materials || []).map(m => [m.id, m])), [materials]);

  const inventoryItems = useMemo(() => {
    return (inventory || [])
      .filter((i: any) => Number(i.quantity) > 0)
      .map((i: any) => ({
        ...i,
        material: materialMap.get(i.material_id),
      }))
      .sort((a: any, b: any) => (a.material?.code || "").localeCompare(b.material?.code || ""));
  }, [inventory, materialMap]);

  const totalItems = inventoryItems.reduce((s: number, i: any) => s + Number(i.quantity), 0);

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Φόρτωση αποθήκης...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <Package className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <p className="text-lg font-extrabold">{inventoryItems.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Είδη</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-accent/10 p-1.5">
              <Package className="h-3.5 w-3.5 text-accent" />
            </div>
            <div>
              <p className="text-lg font-extrabold">{totalItems.toLocaleString('el-GR')}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Τεμάχια</p>
            </div>
          </div>
        </div>
      </div>

      {/* Inventory table */}
      {inventoryItems.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Package className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Δεν έχετε υλικά ακόμα</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Ο διαχειριστής θα σας χρεώσει υλικά</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-2.5 bg-muted/30">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Τα Υλικά μου</h3>
          </div>
          <div className="divide-y divide-border/50">
            {inventoryItems.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono font-bold text-primary">{item.material?.code || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.material?.name || "—"}</p>
                </div>
                <div className="text-right ml-3">
                  <p className="text-sm font-bold">{Number(item.quantity).toLocaleString('el-GR')}</p>
                  <p className="text-[10px] text-muted-foreground">{item.material?.unit || "τεμ."}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent history */}
      {history && history.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-2.5 bg-muted/30 flex items-center gap-2">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Πρόσφατες Κινήσεις</h3>
          </div>
          <div className="divide-y divide-border/50 max-h-[250px] overflow-y-auto">
            {history.map((h: any) => {
              const mat = materialMap.get(h.material_id);
              const isPositive = Number(h.change_amount) > 0;
              return (
                <div key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={`rounded-full p-1 ${isPositive ? 'bg-success/10' : 'bg-destructive/10'}`}>
                    {isPositive ? <ArrowDown className="h-3 w-3 text-success" /> : <ArrowUp className="h-3 w-3 text-destructive" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      <span className="font-mono text-primary">{mat?.code || "—"}</span>
                      {" · "}{h.reason || "—"}
                      {h.construction_sr_id && <span className="text-muted-foreground"> (SR {h.construction_sr_id})</span>}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(h.created_at), { addSuffix: true, locale: el })}
                    </p>
                  </div>
                  <span className={`text-sm font-bold font-mono ${isPositive ? 'text-success' : 'text-destructive'}`}>
                    {isPositive ? '+' : ''}{Number(h.change_amount).toLocaleString('el-GR')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default TechnicianInventoryView;
