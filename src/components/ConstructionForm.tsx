import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Plus, Trash2, Loader2, CheckCircle, HardHat, Package, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface WorkItem {
  work_pricing_id: string;
  code: string;
  description: string;
  unit: string;
  unit_price: number;
  quantity: number;
}

interface MaterialItem {
  material_id: string;
  code: string;
  name: string;
  unit: string;
  price: number;
  source: string;
  quantity: number;
}

interface Props {
  assignment: any;
  onComplete: () => void;
}

const ConstructionForm = ({ assignment, onComplete }: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Form state
  const [sesId, setSesId] = useState("");
  const [ak, setAk] = useState("");
  const [cab, setCab] = useState(assignment.cab || "");
  const [floors, setFloors] = useState("0");

  // Work items
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [workSearch, setWorkSearch] = useState("");
  const [showWorkDropdown, setShowWorkDropdown] = useState(false);

  // Materials
  const [materialItems, setMaterialItems] = useState<MaterialItem[]>([]);
  const [materialSearch, setMaterialSearch] = useState("");
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Fetch work pricing
  const { data: workPricing } = useQuery({
    queryKey: ["work_pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_pricing")
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Fetch materials
  const { data: materials } = useQuery({
    queryKey: ["materials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Filter work items
  const filteredWorks = useMemo(() => {
    if (!workPricing || !workSearch.trim()) return [];
    const q = workSearch.toLowerCase();
    return workPricing
      .filter(
        (w) =>
          !workItems.some((wi) => wi.work_pricing_id === w.id) &&
          (w.code.toLowerCase().includes(q) || w.description.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [workPricing, workSearch, workItems]);

  // Filter materials
  const filteredMaterials = useMemo(() => {
    if (!materials || !materialSearch.trim()) return [];
    const q = materialSearch.toLowerCase();
    return materials
      .filter(
        (m) =>
          !materialItems.some((mi) => mi.material_id === m.id) &&
          (m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [materials, materialSearch, materialItems]);

  // Add work item
  const addWork = (w: any) => {
    setWorkItems((prev) => [
      ...prev,
      {
        work_pricing_id: w.id,
        code: w.code,
        description: w.description,
        unit: w.unit,
        unit_price: w.unit_price,
        quantity: 1,
      },
    ]);
    setWorkSearch("");
    setShowWorkDropdown(false);
  };

  // Add material
  const addMaterial = (m: any) => {
    setMaterialItems((prev) => [
      ...prev,
      {
        material_id: m.id,
        code: m.code,
        name: m.name,
        unit: m.unit,
        price: m.price,
        source: m.source,
        quantity: 1,
      },
    ]);
    setMaterialSearch("");
    setShowMaterialDropdown(false);
  };

  // Update quantity
  const updateWorkQty = (index: number, qty: number) => {
    setWorkItems((prev) => prev.map((w, i) => (i === index ? { ...w, quantity: qty } : w)));
  };
  const updateMaterialQty = (index: number, qty: number) => {
    setMaterialItems((prev) => prev.map((m, i) => (i === index ? { ...m, quantity: qty } : m)));
  };

  // Remove
  const removeWork = (index: number) => setWorkItems((prev) => prev.filter((_, i) => i !== index));
  const removeMaterial = (index: number) => setMaterialItems((prev) => prev.filter((_, i) => i !== index));

  // Totals
  const totalRevenue = workItems.reduce((sum, w) => sum + w.unit_price * w.quantity, 0);
  const deltanetMaterials = materialItems.filter((m) => m.source === "DELTANETWORK");
  const oteMaterials = materialItems.filter((m) => m.source === "OTE");
  const totalMaterialCost = deltanetMaterials.reduce((sum, m) => sum + m.price * m.quantity, 0);

  const handleSubmit = async () => {
    if (!cab.trim()) {
      toast.error("Η Καμπίνα (CAB) είναι υποχρεωτική");
      return;
    }
    if (workItems.length === 0) {
      toast.error("Προσθέστε τουλάχιστον μία εργασία");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create construction record
      const { data: construction, error: constError } = await supabase
        .from("constructions")
        .insert({
          sr_id: assignment.sr_id,
          assignment_id: assignment.id,
          ses_id: sesId.trim() || null,
          ak: ak.trim() || null,
          cab: cab.trim(),
          floors: parseInt(floors) || 0,
          revenue: totalRevenue,
          material_cost: totalMaterialCost,
          profit: totalRevenue - totalMaterialCost,
          status: "completed",
        })
        .select("id")
        .single();
      if (constError) throw constError;

      // 2. Insert work items
      if (workItems.length > 0) {
        const { error: worksError } = await supabase.from("construction_works").insert(
          workItems.map((w) => ({
            construction_id: construction.id,
            work_pricing_id: w.work_pricing_id,
            quantity: w.quantity,
            unit_price: w.unit_price,
            subtotal: w.unit_price * w.quantity,
          }))
        );
        if (worksError) console.error("Works insert error:", worksError);
      }

      // 3. Insert material items
      if (materialItems.length > 0) {
        const { error: matsError } = await supabase.from("construction_materials").insert(
          materialItems.map((m) => ({
            construction_id: construction.id,
            material_id: m.material_id,
            quantity: m.quantity,
            source: m.source,
          }))
        );
        if (matsError) console.error("Materials insert error:", matsError);
      }

      // 4. Deduct DELTANETWORK materials from stock via edge function
      if (deltanetMaterials.length > 0) {
        const { error: deductErr } = await supabase.functions.invoke("deduct-stock", {
          body: {
            construction_id: construction.id,
            materials: deltanetMaterials.map((m) => ({
              material_id: m.material_id,
              quantity: m.quantity,
              source: m.source,
            })),
          },
        });
        if (deductErr) console.error("Stock deduction error:", deductErr);
      }

      // 5. Update assignment status to completed and cab
      const { error: assignError } = await supabase
        .from("assignments")
        .update({ status: "completed", cab: cab.trim() })
        .eq("id", assignment.id);
      if (assignError) console.error("Assignment update error:", assignError);

      toast.success("Η κατασκευή καταχωρήθηκε επιτυχώς!");
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["constructions"] });

      setTimeout(() => onComplete(), 2000);
    } catch (err: any) {
      console.error(err);
      toast.error("Σφάλμα: " + (err.message || "Δοκιμάστε ξανά"));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
        <h2 className="text-lg font-bold text-foreground">Η κατασκευή καταχωρήθηκε!</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Έσοδα: {totalRevenue.toFixed(2)}€ · Κόστος υλικών: {totalMaterialCost.toFixed(2)}€
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
        <HardHat className="h-5 w-5" />
        Φόρμα Κατασκευής
      </h2>

      {/* Technical Details */}
      <Card className="p-4 space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Τεχνικά Στοιχεία
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">SES ID</Label>
            <Input value={sesId} onChange={(e) => setSesId(e.target.value)} placeholder="SES..." className="text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Α/Κ</Label>
            <Input value={ak} onChange={(e) => setAk(e.target.value)} placeholder="Α/Κ..." className="text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Καμπίνα (CAB) <span className="text-destructive">*</span></Label>
            <Input value={cab} onChange={(e) => setCab(e.target.value)} placeholder="π.χ. G151" className="text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Όροφοι</Label>
            <Input value={floors} onChange={(e) => setFloors(e.target.value)} type="number" min="0" className="text-sm mt-1" />
          </div>
        </div>
      </Card>

      {/* Work Items */}
      <Card className="p-4 space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5" />
          Εργασίες <span className="text-destructive">*</span>
        </Label>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={workSearch}
            onChange={(e) => {
              setWorkSearch(e.target.value);
              setShowWorkDropdown(true);
            }}
            onFocus={() => setShowWorkDropdown(true)}
            placeholder="Αναζήτηση κωδικού ή περιγραφής..."
            className="pl-8 text-sm"
          />
          {showWorkDropdown && filteredWorks.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filteredWorks.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => addWork(w)}
                  className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b border-border/30 last:border-0"
                >
                  <span className="text-xs font-mono text-primary">{w.code}</span>
                  <span className="text-xs text-muted-foreground ml-2">{w.description}</span>
                  <span className="text-xs font-semibold text-foreground ml-auto float-right">{w.unit_price}€/{w.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected work items */}
        {workItems.length > 0 && (
          <div className="space-y-2">
            {workItems.map((w, i) => (
              <div key={i} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-primary">{w.code}</p>
                  <p className="text-xs text-muted-foreground truncate">{w.description}</p>
                </div>
                <Input
                  type="number"
                  min="1"
                  value={w.quantity}
                  onChange={(e) => updateWorkQty(i, parseFloat(e.target.value) || 1)}
                  className="w-16 h-7 text-xs text-center"
                />
                <span className="text-xs text-muted-foreground w-8">{w.unit}</span>
                <span className="text-xs font-semibold w-16 text-right">
                  {(w.unit_price * w.quantity).toFixed(2)}€
                </span>
                <button type="button" onClick={() => removeWork(i)} className="text-destructive/60 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="flex justify-end pt-1">
              <Badge variant="outline" className="text-xs font-semibold">
                Σύνολο εργασιών: {totalRevenue.toFixed(2)}€
              </Badge>
            </div>
          </div>
        )}
      </Card>

      {/* Materials */}
      <Card className="p-4 space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5" />
          Υλικά
        </Label>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={materialSearch}
            onChange={(e) => {
              setMaterialSearch(e.target.value);
              setShowMaterialDropdown(true);
            }}
            onFocus={() => setShowMaterialDropdown(true)}
            placeholder="Αναζήτηση κωδικού ή ονόματος υλικού..."
            className="pl-8 text-sm"
          />
          {showMaterialDropdown && filteredMaterials.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filteredMaterials.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => addMaterial(m)}
                  className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b border-border/30 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${m.source === "OTE" ? "border-blue-500/30 text-blue-600" : "border-orange-500/30 text-orange-600"}`}>
                      {m.source}
                    </Badge>
                    <span className="text-xs font-mono">{m.code}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{m.name}</p>
                  {m.source === "DELTANETWORK" && (
                    <span className="text-xs font-semibold text-foreground">{m.price}€/{m.unit}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected materials grouped by source */}
        {materialItems.length > 0 && (
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-8">
              <TabsTrigger value="all" className="text-xs">Όλα ({materialItems.length})</TabsTrigger>
              <TabsTrigger value="ote" className="text-xs">ΟΤΕ ({oteMaterials.length})</TabsTrigger>
              <TabsTrigger value="delta" className="text-xs">Delta ({deltanetMaterials.length})</TabsTrigger>
            </TabsList>

            {["all", "ote", "delta"].map((tab) => {
              const items =
                tab === "ote" ? oteMaterials : tab === "delta" ? deltanetMaterials : materialItems;
              return (
                <TabsContent key={tab} value={tab} className="space-y-2 mt-2">
                  {items.map((m) => {
                    const globalIndex = materialItems.findIndex((mi) => mi.material_id === m.material_id);
                    return (
                      <div key={m.material_id} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className={`text-[9px] px-1.5 ${m.source === "OTE" ? "border-blue-500/30 text-blue-600" : "border-orange-500/30 text-orange-600"}`}>
                              {m.source === "OTE" ? "ΟΤΕ" : "ΔΝ"}
                            </Badge>
                            <span className="text-xs font-mono">{m.code}</span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{m.name}</p>
                        </div>
                        <Input
                          type="number"
                          min="1"
                          value={m.quantity}
                          onChange={(e) => updateMaterialQty(globalIndex, parseFloat(e.target.value) || 1)}
                          className="w-16 h-7 text-xs text-center"
                        />
                        <span className="text-xs text-muted-foreground w-10">{m.unit}</span>
                        {m.source === "DELTANETWORK" && (
                          <span className="text-xs font-semibold w-16 text-right">
                            {(m.price * m.quantity).toFixed(2)}€
                          </span>
                        )}
                        <button type="button" onClick={() => removeMaterial(globalIndex)} className="text-destructive/60 hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </TabsContent>
              );
            })}
          </Tabs>
        )}

        {deltanetMaterials.length > 0 && (
          <div className="flex justify-end pt-1">
            <Badge variant="outline" className="text-xs font-semibold border-orange-500/30 text-orange-600">
              Κόστος υλικών ΔΝ: {totalMaterialCost.toFixed(2)}€
            </Badge>
          </div>
        )}
      </Card>

      {/* Summary */}
      {(workItems.length > 0 || materialItems.length > 0) && (
        <Card className="p-4 space-y-2 border-primary/20">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Σύνοψη</Label>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold text-primary">{totalRevenue.toFixed(2)}€</p>
              <p className="text-[10px] text-muted-foreground">Έσοδα</p>
            </div>
            <div>
              <p className="text-lg font-bold text-orange-600">{totalMaterialCost.toFixed(2)}€</p>
              <p className="text-[10px] text-muted-foreground">Κόστος Υλικών</p>
            </div>
            <div>
              <p className="text-lg font-bold text-green-600">{(totalRevenue - totalMaterialCost).toFixed(2)}€</p>
              <p className="text-[10px] text-muted-foreground">Κέρδος</p>
            </div>
          </div>
        </Card>
      )}

      {/* Submit */}
      <Button onClick={handleSubmit} disabled={submitting} className="w-full py-6 text-sm font-bold gap-2">
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Υποβολή...
          </>
        ) : (
          <>
            <HardHat className="h-4 w-4" />
            Υποβολή Κατασκευής
          </>
        )}
      </Button>
    </div>
  );
};

export default ConstructionForm;
