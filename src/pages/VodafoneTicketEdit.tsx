import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Save,
  Trash2,
  Loader2,
  Plus,
  Minus,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SelectedService {
  article_id: string;
  service_code: string;
  description: string;
  quantity: number;
  unit_price_vodafone: number;
  unit_price_subcontractor: number;
  is_part_of_combo: boolean;
  combo_label: string | null;
}

interface Article {
  id: string;
  code: string;
  description_el: string;
  category: string;
  customer_type: string;
  zone: string;
  unit_price_eur: number;
  is_combo: boolean;
  combo_includes: string[] | null;
  sort_order: number | null;
}

type CustomerType = "CBU" | "EBU" | "SoHo";
type ZoneType = "ISLANDS" | "REST_OF_GREECE";
type StatusType =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "failed";

export default function VodafoneTicketEdit() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    ticket_id: "",
    customer_type: "CBU" as CustomerType,
    zone: "ISLANDS" as ZoneType,
    customer_name: "",
    customer_phone: "",
    customer_address: "",
    region: "",
    subcontractor_id: "",
    status: "pending" as StatusType,
    is_same_day: false,
    notes: "",
  });

  const [selectedServices, setSelectedServices] = useState<SelectedService[]>(
    []
  );
  const [comboNoticeShown, setComboNoticeShown] = useState<string[]>([]);

  const { data: existing, isLoading: loadingTicket } = useQuery({
    queryKey: ["vodafone_ticket", id],
    queryFn: async () => {
      if (isNew) return null;
      const { data, error } = await supabase
        .from("vodafone_tickets")
        .select("*, services:vodafone_ticket_services(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !isNew,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        ticket_id: existing.ticket_id,
        customer_type: existing.customer_type as CustomerType,
        zone: existing.zone as ZoneType,
        customer_name: existing.customer_name || "",
        customer_phone: existing.customer_phone || "",
        customer_address: existing.customer_address || "",
        region: existing.region,
        subcontractor_id: existing.subcontractor_id || "",
        status: existing.status as StatusType,
        is_same_day: existing.is_same_day,
        notes: existing.notes || "",
      });
      setSelectedServices(
        ((existing.services as any[]) || []).map((s) => ({
          article_id: s.article_id,
          service_code: s.service_code,
          description: s.description,
          quantity: s.quantity,
          unit_price_vodafone: Number(s.unit_price_vodafone),
          unit_price_subcontractor: Number(s.unit_price_subcontractor),
          is_part_of_combo: !!s.is_part_of_combo,
          combo_label: s.combo_label,
        }))
      );
    }
  }, [existing]);

  // Suggest a default ticket id when creating
  useEffect(() => {
    if (isNew && !form.ticket_id) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);
      setForm((f) => ({ ...f, ticket_id: `TKT-VF-${yyyy}-${rand}` }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew]);

  const { data: subs = [] } = useQuery({
    queryKey: ["subcontractors_list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subcontractors")
        .select("id, full_name, short_name, primary_region")
        .eq("active", true)
        .order("full_name");
      return data || [];
    },
  });

  const { data: articles = [] } = useQuery({
    queryKey: ["vf_articles", form.customer_type],
    queryFn: async () => {
      const { data } = await supabase
        .from("vodafone_articles")
        .select("*")
        .eq("customer_type", form.customer_type)
        .eq("active", true)
        .order("sort_order");
      return (data || []) as Article[];
    },
  });

  const { data: subPricing = [] } = useQuery({
    queryKey: ["sub_pricing", form.subcontractor_id, form.customer_type],
    queryFn: async () => {
      if (!form.subcontractor_id) return [];
      const { data } = await supabase
        .from("subcontractor_pricing")
        .select("*")
        .eq("subcontractor_id", form.subcontractor_id)
        .eq("client_code", "VODAFONE");
      return (data || []) as Array<{
        service_code: string;
        customer_type: string;
        unit_price_eur: number;
      }>;
    },
    enabled: !!form.subcontractor_id,
  });

  const lookupSubPrice = (code: string): number => {
    const found = subPricing.find(
      (p) =>
        p.service_code === code &&
        (p.customer_type === form.customer_type || p.customer_type === "ALL")
    );
    return found ? Number(found.unit_price_eur) : 0;
  };

  // Combo auto-detection (informational only)
  useEffect(() => {
    if (selectedServices.length < 2) return;
    const codes = selectedServices.map((s) => s.service_code);
    const matchedCombos = articles.filter(
      (a) =>
        a.is_combo &&
        a.combo_includes &&
        a.combo_includes.length > 0 &&
        a.combo_includes.every((c) => codes.includes(c)) &&
        !codes.includes(a.code)
    );
    matchedCombos.forEach((combo) => {
      if (!comboNoticeShown.includes(combo.code)) {
        toast.info(
          `✨ Εντοπίστηκε combo: ${combo.code} = ${Number(
            combo.unit_price_eur
          ).toFixed(2)}€`,
          {
            description: `Επίλεξε το ${combo.code} αντί για ${combo.combo_includes!.join(
              " + "
            )} για καλύτερη τιμή.`,
          }
        );
        setComboNoticeShown((prev) => [...prev, combo.code]);
      }
    });
  }, [selectedServices, articles, comboNoticeShown]);

  const toggleService = (article: Article) => {
    setSelectedServices((prev) => {
      const exists = prev.find((s) => s.article_id === article.id);
      if (exists) return prev.filter((s) => s.article_id !== article.id);
      return [
        ...prev,
        {
          article_id: article.id,
          service_code: article.code,
          description: article.description_el,
          quantity: 1,
          unit_price_vodafone: Number(article.unit_price_eur),
          unit_price_subcontractor: lookupSubPrice(article.code),
          is_part_of_combo: !!article.is_combo,
          combo_label: article.is_combo ? article.code : null,
        },
      ];
    });
  };

  const isSelected = (articleId: string) =>
    selectedServices.some((s) => s.article_id === articleId);

  const updateQty = (articleId: string, delta: number) => {
    setSelectedServices((prev) =>
      prev.map((s) =>
        s.article_id === articleId
          ? { ...s, quantity: Math.max(1, s.quantity + delta) }
          : s
      )
    );
  };

  const totals = useMemo(() => {
    const voda = selectedServices.reduce(
      (sum, s) => sum + s.quantity * s.unit_price_vodafone,
      0
    );
    const sub = selectedServices.reduce(
      (sum, s) => sum + s.quantity * s.unit_price_subcontractor,
      0
    );
    return { voda, sub, margin: voda - sub };
  }, [selectedServices]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Δεν είστε συνδεδεμένος");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.organization_id) {
        throw new Error("Δεν βρέθηκε organization. Επικοινωνήστε με admin.");
      }

      let ticketDbId = id as string | undefined;

      const ticketData: any = {
        organization_id: profile.organization_id,
        ticket_id: form.ticket_id,
        customer_type: form.customer_type,
        zone: form.zone,
        customer_name: form.customer_name || null,
        customer_phone: form.customer_phone || null,
        customer_address: form.customer_address || null,
        region: form.region,
        subcontractor_id: form.subcontractor_id || null,
        status: form.status,
        is_same_day: form.is_same_day,
        notes: form.notes || null,
      };
      if (form.status === "completed" && !existing?.completed_at) {
        ticketData.completed_at = new Date().toISOString();
      }

      if (isNew) {
        const { data, error } = await supabase
          .from("vodafone_tickets")
          .insert(ticketData)
          .select()
          .single();
        if (error) throw error;
        ticketDbId = data.id;
      } else {
        const { error } = await supabase
          .from("vodafone_tickets")
          .update(ticketData)
          .eq("id", id!);
        if (error) throw error;
      }

      await supabase
        .from("vodafone_ticket_services")
        .delete()
        .eq("ticket_id", ticketDbId!);

      if (selectedServices.length > 0) {
        const { error: svcError } = await supabase
          .from("vodafone_ticket_services")
          .insert(
            selectedServices.map((s) => ({
              ticket_id: ticketDbId!,
              article_id: s.article_id,
              service_code: s.service_code,
              description: s.description,
              quantity: s.quantity,
              unit_price_vodafone: s.unit_price_vodafone,
              unit_price_subcontractor: s.unit_price_subcontractor,
              is_part_of_combo: s.is_part_of_combo,
              combo_label: s.combo_label,
            }))
          );
        if (svcError) throw svcError;
      }

      return ticketDbId!;
    },
    onSuccess: (ticketDbId) => {
      toast.success(isNew ? "Δημιουργήθηκε!" : "Ενημερώθηκε!");
      qc.invalidateQueries({ queryKey: ["vodafone_tickets"] });
      qc.invalidateQueries({ queryKey: ["vodafone_ticket", ticketDbId] });
      qc.invalidateQueries({ queryKey: ["vf_dashboard_stats"] });
      qc.invalidateQueries({ queryKey: ["vf_month_stats"] });
      navigate("/vodafone/tickets");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("vodafone_tickets")
        .delete()
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Διαγράφηκε");
      qc.invalidateQueries({ queryKey: ["vodafone_tickets"] });
      navigate("/vodafone/tickets");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const grouped = useMemo(() => {
    const g: Record<string, Article[]> = {
      installation: [],
      support: [],
      auxiliary: [],
      addon: [],
      combo: [],
    };
    articles.forEach((a) => {
      if (g[a.category]) g[a.category].push(a);
      else (g.installation ??= []).push(a);
    });
    return g;
  }, [articles]);

  const categoryLabels: Record<string, string> = {
    installation: "🔧 Installation",
    support: "🛠️ Support",
    auxiliary: "⚙️ Auxiliary",
    addon: "➕ Add-on",
    combo: "✨ Combo",
  };

  const firstNonEmptyCat =
    Object.entries(grouped).find(([, items]) => items.length > 0)?.[0] ||
    "installation";

  if (loadingTicket) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/vodafone/tickets")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Πίσω
            </Button>
            <h1 className="text-lg font-bold text-foreground">
              {isNew ? "🎫 Νέο Ticket" : `🎫 ${form.ticket_id}`}
            </h1>
          </div>
          <div className="flex gap-2">
            {!isNew && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm("Διαγραφή ticket;")) deleteMutation.mutate();
                }}
              >
                <Trash2 className="h-4 w-4 mr-1 text-destructive" />
                Διαγραφή
              </Button>
            )}
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={
                !form.ticket_id || !form.region || saveMutation.isPending
              }
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              {isNew ? "Δημιουργία" : "Αποθήκευση"}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        {/* Ticket info */}
        <Card className="p-4 space-y-4">
          <h2 className="font-semibold">📋 Στοιχεία Ραντεβού</h2>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ticket ID *</Label>
              <Input
                value={form.ticket_id}
                onChange={(e) =>
                  setForm({ ...form, ticket_id: e.target.value })
                }
                placeholder="TKT-VF-2026-..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm({ ...form, status: v as StatusType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">⏳ Αναμονή</SelectItem>
                  <SelectItem value="in_progress">🔄 Σε εξέλιξη</SelectItem>
                  <SelectItem value="completed">✅ Ολοκληρωμένο</SelectItem>
                  <SelectItem value="cancelled">❌ Ακυρωμένο</SelectItem>
                  <SelectItem value="failed">⚠️ Απέτυχε</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Customer Type *</Label>
              <Select
                value={form.customer_type}
                onValueChange={(v) =>
                  setForm({ ...form, customer_type: v as CustomerType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CBU">CBU (Οικιακοί)</SelectItem>
                  <SelectItem value="EBU">EBU (Επιχειρήσεις)</SelectItem>
                  <SelectItem value="SoHo">SoHo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Zone *</Label>
              <Select
                value={form.zone}
                onValueChange={(v) =>
                  setForm({ ...form, zone: v as ZoneType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ISLANDS">🏝️ Νησιά</SelectItem>
                  <SelectItem value="REST_OF_GREECE">
                    🏔️ Λοιπή Ελλάδα
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Όνομα Πελάτη</Label>
              <Input
                value={form.customer_name}
                onChange={(e) =>
                  setForm({ ...form, customer_name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Τηλέφωνο</Label>
              <Input
                value={form.customer_phone}
                onChange={(e) =>
                  setForm({ ...form, customer_phone: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Διεύθυνση</Label>
              <Input
                value={form.customer_address}
                onChange={(e) =>
                  setForm({ ...form, customer_address: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Περιοχή *</Label>
              <Input
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                placeholder="π.χ. Ρόδος"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Υπεργολάβος</Label>
            <Select
              value={form.subcontractor_id || "none"}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  subcontractor_id: v === "none" ? "" : v,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Επίλεξε..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Χωρίς υπεργολάβο —</SelectItem>
                {subs.map(
                  (s: {
                    id: string;
                    full_name: string;
                    short_name: string | null;
                    primary_region: string | null;
                  }) => (
                    <SelectItem key={s.id} value={s.id}>
                      👨 {s.short_name || s.full_name}
                      {s.primary_region ? ` • 📍 ${s.primary_region}` : ""}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Σημειώσεις</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>
        </Card>

        {/* Services */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold">
              🔧 Υπηρεσίες ({selectedServices.length})
            </h2>
            {!form.subcontractor_id && (
              <Badge variant="secondary">
                ⚠️ Επίλεξε υπεργολάβο για auto-pricing
              </Badge>
            )}
          </div>

          <Tabs defaultValue={firstNonEmptyCat} key={form.customer_type}>
            <TabsList className="w-full overflow-x-auto justify-start">
              {Object.entries(grouped).map(
                ([cat, items]) =>
                  items.length > 0 && (
                    <TabsTrigger key={cat} value={cat}>
                      {categoryLabels[cat] || cat} ({items.length})
                    </TabsTrigger>
                  )
              )}
            </TabsList>

            {Object.entries(grouped).map(([cat, items]) => (
              <TabsContent
                key={cat}
                value={cat}
                className="space-y-2 mt-3"
              >
                {items.map((article) => {
                  const selected = isSelected(article.id);
                  const sel = selectedServices.find(
                    (s) => s.article_id === article.id
                  );
                  const subPrice = lookupSubPrice(article.code);

                  return (
                    <Card
                      key={article.id}
                      className={`p-3 cursor-pointer transition-all ${
                        selected
                          ? "border-red-500 bg-red-500/5"
                          : "hover:border-muted-foreground/30"
                      }`}
                      onClick={() => toggleService(article)}
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                            selected
                              ? "bg-red-500 border-red-500"
                              : "border-muted-foreground/30"
                          }`}
                        >
                          {selected && (
                            <Check className="w-3.5 h-3.5 text-white" />
                          )}
                        </div>

                        <div className="flex-1 min-w-[150px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="outline"
                              className="font-mono text-xs"
                            >
                              {article.code}
                            </Badge>
                            {article.is_combo && (
                              <Badge className="text-xs bg-purple-500 hover:bg-purple-600">
                                COMBO
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm mt-0.5">
                            {article.description_el}
                          </p>
                        </div>

                        {selected && (
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="icon"
                              variant="outline"
                              className="w-7 h-7"
                              onClick={() => updateQty(article.id, -1)}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-8 text-center font-bold tabular-nums">
                              {sel?.quantity ?? 1}
                            </span>
                            <Button
                              size="icon"
                              variant="outline"
                              className="w-7 h-7"
                              onClick={() => updateQty(article.id, 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        )}

                        <div className="text-right">
                          <div className="text-sm font-bold tabular-nums">
                            {Number(article.unit_price_eur).toFixed(2)}€
                          </div>
                          {form.subcontractor_id && (
                            <div className="text-xs text-orange-600 tabular-nums">
                              → {subPrice.toFixed(2)}€
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
                {items.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-6">
                    Δεν υπάρχουν articles
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </Card>

        {/* Totals */}
        <Card className="p-4 bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20 sticky bottom-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-muted-foreground">💰 Vodafone</div>
              <div className="text-2xl font-bold tabular-nums">
                {totals.voda.toFixed(2)}€
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                💼 Υπεργολάβος
              </div>
              <div className="text-2xl font-bold tabular-nums text-orange-600">
                {totals.sub.toFixed(2)}€
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">📈 Margin</div>
              <div
                className={`text-2xl font-bold tabular-nums ${
                  totals.margin >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {totals.margin >= 0 ? "+" : ""}
                {totals.margin.toFixed(2)}€
              </div>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
