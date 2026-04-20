import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import AppLayout from "@/components/AppLayout";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, Trash2, ShieldCheck, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

const AVAILABLE_CATEGORIES = [
  { key: "SKAMA", label: "Σκάμα", icon: "⛏️" },
  { key: "ODEFSI", label: "Όδευση", icon: "🛤️" },
  { key: "BCP", label: "BCP", icon: "📦" },
  { key: "BEP", label: "BEP", icon: "🔌" },
  { key: "BMO", label: "BMO", icon: "📡" },
  { key: "FB", label: "Floor Box", icon: "📋" },
  { key: "KAMPINA", label: "Καμπίνα", icon: "🏗️" },
  { key: "G_FASI", label: "Γ' Φάση", icon: "✨" },
];

const PHASE_LABELS: Record<number, string> = {
  1: "🚜 Φάση 1 — Χωματουργικά",
  2: "🔧 Φάση 2 — Οδεύσεις",
  3: "🔬 Φάση 3 — Κόλληση",
};

export default function PhotoRequirements() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const [selectedPhase, setSelectedPhase] = useState<"1" | "2" | "3">("3");
  const [addOpen, setAddOpen] = useState(false);
  const [newCategoryKey, setNewCategoryKey] = useState<string>("BEP");
  const [newMinCount, setNewMinCount] = useState<number>(1);
  const [newRequired, setNewRequired] = useState<boolean>(true);

  const phase = parseInt(selectedPhase, 10);

  const { data: requirements, isLoading } = useQuery({
    queryKey: ["photo-requirements-admin", organizationId, phase],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("photo_requirements")
        .select("*")
        .eq("organization_id", organizationId!)
        .eq("phase", phase)
        .is("building_type", null)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase
        .from("photo_requirements")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photo-requirements-admin"] });
      qc.invalidateQueries({ queryKey: ["photo-requirements"] });
      toast.success("Αποθηκεύτηκε");
    },
    onError: (err: any) => toast.error(err.message || "Σφάλμα"),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const cat = AVAILABLE_CATEGORIES.find((c) => c.key === newCategoryKey);
      if (!cat) throw new Error("Άγνωστη κατηγορία");
      const sortMax = (requirements || []).reduce(
        (m, r: any) => Math.max(m, r.sort_order || 0),
        0
      );
      const { error } = await supabase.from("photo_requirements").insert({
        organization_id: organizationId,
        phase,
        building_type: null,
        category_key: cat.key,
        category_label: cat.label,
        category_icon: cat.icon,
        min_count: newMinCount,
        is_required: newRequired,
        sort_order: sortMax + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photo-requirements-admin"] });
      qc.invalidateQueries({ queryKey: ["photo-requirements"] });
      toast.success("Προστέθηκε");
      setAddOpen(false);
      setNewMinCount(1);
      setNewRequired(true);
    },
    onError: (err: any) => toast.error(err.message || "Σφάλμα"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("photo_requirements")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photo-requirements-admin"] });
      qc.invalidateQueries({ queryKey: ["photo-requirements"] });
      toast.success("Διαγράφηκε");
    },
  });

  const requiredCount = (requirements || []).filter((r: any) => r.is_required).length;
  const optionalCount = (requirements || []).filter((r: any) => !r.is_required).length;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Έλεγχος Φωτογραφιών
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Όρισε ποιες φωτογραφίες απαιτούνται για την ολοκλήρωση κάθε φάσης
          </p>
        </div>

        {/* Info banner */}
        <Card className="p-4 bg-primary/5 border-primary/20">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">Πώς λειτουργεί</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ο τεχνικός δεν θα μπορεί να ολοκληρώσει τη φάση αν δεν έχει ανεβάσει τις
                υποχρεωτικές φωτογραφίες. Έτσι αποτρέπονται επανεπισκέψεις και εξασφαλίζεται η
                ποιότητα από την πρώτη φορά. Οι admins μπορούν να κάνουν παράκαμψη με αιτιολογία
                (καταγράφεται στο audit log).
              </p>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs value={selectedPhase} onValueChange={(v) => setSelectedPhase(v as "1" | "2" | "3")}>
          <TabsList className="grid grid-cols-3 w-full">
            {[1, 2, 3].map((p) => (
              <TabsTrigger key={p} value={String(p)}>
                {PHASE_LABELS[p]}
              </TabsTrigger>
            ))}
          </TabsList>

          {[1, 2, 3].map((p) => (
            <TabsContent key={p} value={String(p)} className="mt-4">
              <Card className="overflow-hidden">
                {/* Summary header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-destructive" />
                      <span className="font-semibold">{requiredCount}</span>
                      <span className="text-muted-foreground">υποχρεωτικές</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                      <span className="font-semibold">{optionalCount}</span>
                      <span className="text-muted-foreground">προαιρετικές</span>
                    </span>
                  </div>
                  <Dialog open={addOpen} onOpenChange={setAddOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="default">
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Προσθήκη
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Νέα κατηγορία για {PHASE_LABELS[p]}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <div>
                          <Label>Κατηγορία</Label>
                          <Select value={newCategoryKey} onValueChange={setNewCategoryKey}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AVAILABLE_CATEGORIES.filter(
                                (c) => !(requirements || []).some((r: any) => r.category_key === c.key)
                              ).map((c) => (
                                <SelectItem key={c.key} value={c.key}>
                                  {c.icon} {c.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Ελάχιστος αριθμός φωτογραφιών</Label>
                          <Input
                            type="number"
                            min={0}
                            max={20}
                            value={newMinCount}
                            onChange={(e) => setNewMinCount(parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label htmlFor="new-required">Υποχρεωτικό;</Label>
                          <Switch
                            id="new-required"
                            checked={newRequired}
                            onCheckedChange={setNewRequired}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAddOpen(false)}>
                          Ακύρωση
                        </Button>
                        <Button
                          onClick={() => addMutation.mutate()}
                          disabled={addMutation.isPending}
                        >
                          {addMutation.isPending ? "Προσθήκη..." : "Προσθήκη"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                {/* List */}
                {phase !== p ? null : isLoading ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Φόρτωση...</div>
                ) : (requirements || []).length === 0 ? (
                  <div className="p-8 text-center">
                    <Camera className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Καμία απαίτηση φωτογραφίας για αυτή τη φάση
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {(requirements || []).map((r: any, i: number) => (
                      <motion.div
                        key={r.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                      >
                        <span className="text-2xl">{r.category_icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {r.category_label}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Κωδικός: {r.category_key}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Ελάχ.:</Label>
                          <Input
                            type="number"
                            min={0}
                            max={20}
                            value={r.min_count}
                            onChange={(e) => {
                              const v = parseInt(e.target.value) || 0;
                              updateMutation.mutate({
                                id: r.id,
                                updates: { min_count: v },
                              });
                            }}
                            className="w-16 h-8 text-center"
                          />
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <Label className="text-xs text-muted-foreground">Υποχρ.</Label>
                          <Switch
                            checked={r.is_required}
                            onCheckedChange={(v) =>
                              updateMutation.mutate({
                                id: r.id,
                                updates: { is_required: v },
                              })
                            }
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm(`Διαγραφή κατηγορίας "${r.category_label}";`)) {
                              deleteMutation.mutate(r.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
}
