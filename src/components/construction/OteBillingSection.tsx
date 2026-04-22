import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { hapticFeedback } from "@/lib/haptics";
import {
  calculateOteBilling,
  calculateTotal,
  mapBuildingTypeToSize,
  type SRBillingInput,
  type ArticleInfo,
} from "@/lib/oteBillingCalculator";
import {
  ChevronDown,
  Plus,
  Trash2,
  Sparkles,
  Receipt,
  Search,
  Loader2,
  Wand2,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";

interface OteBillingSectionProps {
  assignmentId: string;
  buildingType: string | null;
  floors: number;
  fbSameLevelAsBep: boolean;
  distributionType: SRBillingInput["distribution_type"];
  distributionMeters: number;
  cabToBepDamaged: boolean;
  horizontalMeters: number;
  isAerial: boolean;
  aerialMeters: number;
  isCommercialCenter: boolean;
  fbCount: number;
}

type DbBillingItem = {
  id: string;
  article_id: string;
  article_code: string;
  quantity: number;
  unit_price_eur: number;
  total_eur: number;
  source: "auto" | "manual" | "override";
  notes: string | null;
  ote_articles: {
    code: string;
    title: string;
    category: string;
    price_eur: number;
  } | null;
};

type CatalogArticle = {
  id: string;
  code: string;
  title: string;
  category: string;
  price_eur: number;
  is_active: boolean;
  is_excluded: boolean;
};

const fmtEur = (n: number) =>
  new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  auto: {
    label: "Auto",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  },
  manual: {
    label: "Manual",
    cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  },
  override: {
    label: "Override",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  },
};

export function OteBillingSection({
  assignmentId,
  buildingType,
  floors,
  fbSameLevelAsBep,
  distributionType,
  distributionMeters,
  cabToBepDamaged,
  horizontalMeters,
  isAerial,
  aerialMeters,
  isCommercialCenter,
  fbCount,
}: OteBillingSectionProps) {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { data: role } = useUserRole();
  const isAdmin = role === "admin" || role === "super_admin";
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const { data: billingItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["sr-billing-items", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sr_billing_items" as any)
        .select(
          "id, article_id, article_code, quantity, unit_price_eur, total_eur, source, notes, ote_articles(code, title, category, price_eur)"
        )
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as DbBillingItem[];
    },
    enabled: !!assignmentId,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["ote-articles-active", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ote_articles" as any)
        .select(
          "id, code, title, category, price_eur, is_active, is_excluded"
        )
        .eq("organization_id", organizationId!)
        .eq("is_active", true)
        .eq("is_excluded", false)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as CatalogArticle[];
    },
    enabled: !!organizationId,
  });

  const articlesMap = useMemo(() => {
    const m = new Map<string, ArticleInfo>();
    catalog.forEach((a) =>
      m.set(a.code, { id: a.id, price: Number(a.price_eur), title: a.title })
    );
    return m;
  }, [catalog]);

  const suggestedArticles = useMemo(() => {
    if (!buildingType || articlesMap.size === 0) return [];
    const input: SRBillingInput = {
      building_size: mapBuildingTypeToSize(buildingType),
      floors_count: floors,
      fb_same_level_as_bep: fbSameLevelAsBep,
      distribution_type: distributionType,
      distribution_meters: distributionMeters,
      cab_to_bep_damaged: cabToBepDamaged,
      horizontal_meters: horizontalMeters,
      is_aerial: isAerial,
      aerial_meters: aerialMeters,
      is_commercial_center: isCommercialCenter,
      fb_count: fbCount,
    };
    return calculateOteBilling(input, articlesMap);
  }, [
    buildingType,
    floors,
    fbSameLevelAsBep,
    distributionType,
    distributionMeters,
    cabToBepDamaged,
    horizontalMeters,
    isAerial,
    aerialMeters,
    isCommercialCenter,
    fbCount,
    articlesMap,
  ]);

  const totalEur = useMemo(
    () => billingItems.reduce((s, i) => s + Number(i.total_eur || 0), 0),
    [billingItems]
  );

  const suggestionsTotal = useMemo(
    () => calculateTotal(suggestedArticles),
    [suggestedArticles]
  );

  const applySuggestions = useMutation({
    mutationFn: async () => {
      if (!organizationId || !user) throw new Error("Missing org/user");
      const rows = suggestedArticles
        .map((s) => {
          const art = articlesMap.get(s.code);
          if (!art) return null;
          return {
            assignment_id: assignmentId,
            organization_id: organizationId,
            article_id: art.id,
            article_code: s.code,
            quantity: s.quantity,
            unit_price_eur: s.unit_price,
            source: "auto" as const,
            created_by: user.id,
          };
        })
        .filter(Boolean);
      const { error } = await supabase
        .from("sr_billing_items" as any)
        .upsert(rows as any, {
          onConflict: "assignment_id,article_id",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      hapticFeedback.success();
      toast.success("Εφαρμόστηκαν τα προτεινόμενα άρθρα");
      queryClient.invalidateQueries({
        queryKey: ["sr-billing-items", assignmentId],
      });
    },
    onError: (e: any) => toast.error(e.message || "Αποτυχία εφαρμογής"),
  });

  const addManual = useMutation({
    mutationFn: async (article: CatalogArticle) => {
      if (!organizationId || !user) throw new Error("Missing org/user");
      const { error } = await supabase
        .from("sr_billing_items" as any)
        .upsert(
          {
            assignment_id: assignmentId,
            organization_id: organizationId,
            article_id: article.id,
            article_code: article.code,
            quantity: 1,
            unit_price_eur: Number(article.price_eur),
            source: "manual",
            created_by: user.id,
          },
          { onConflict: "assignment_id,article_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      hapticFeedback.light();
      toast.success("Προστέθηκε");
      queryClient.invalidateQueries({
        queryKey: ["sr-billing-items", assignmentId],
      });
    },
    onError: (e: any) => toast.error(e.message || "Αποτυχία"),
  });

  const updateQty = useMutation({
    mutationFn: async ({ id, qty }: { id: string; qty: number }) => {
      const { error } = await supabase
        .from("sr_billing_items" as any)
        .update({ quantity: Math.max(0.01, qty) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["sr-billing-items", assignmentId],
      });
    },
    onError: (e: any) => toast.error(e.message || "Αποτυχία ενημέρωσης"),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("sr_billing_items" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      hapticFeedback.light();
      toast.success("Αφαιρέθηκε");
      queryClient.invalidateQueries({
        queryKey: ["sr-billing-items", assignmentId],
      });
    },
    onError: (e: any) => toast.error(e.message || "Αποτυχία διαγραφής"),
  });

  const existingCodes = useMemo(
    () => new Set(billingItems.map((i) => i.article_code)),
    [billingItems]
  );

  const filteredCatalog = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return catalog.filter((a) => {
      if (existingCodes.has(a.code)) return false;
      if (!q) return true;
      return (
        a.code.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q)
      );
    });
  }, [catalog, pickerSearch, existingCodes]);

  const hasItems = billingItems.length > 0;
  const canSuggest = suggestedArticles.length > 0 && !!buildingType;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between p-5 hover:bg-muted/40 transition-colors rounded-2xl min-h-[56px]"
      >
        <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-2 pointer-events-none flex-wrap">
          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
          <Receipt className="h-3.5 w-3.5" />
          Τιμολόγηση ΟΤΕ
          {hasItems && (
            <Badge variant="secondary" className="text-[10px] ml-1">
              {billingItems.length} άρθρα
            </Badge>
          )}
          {isAdmin && hasItems && (
            <Badge className="text-[10px] ml-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 font-mono tabular-nums">
              {fmtEur(totalEur)}
            </Badge>
          )}
        </Label>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border/50"
          >
            <div className="p-4 space-y-3">
              {itemsLoading && (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-20 rounded-xl bg-muted/40 animate-pulse"
                    />
                  ))}
                </div>
              )}

              {!itemsLoading && !hasItems && canSuggest && (
                <div className="rounded-xl p-5 text-center bg-gradient-to-br from-primary/5 via-primary/10 to-emerald-500/10 border-2 border-dashed border-primary/30">
                  <Sparkles className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <div className="text-sm font-semibold mb-1">
                    Αυτόματη Πρόταση
                  </div>
                  <div className="text-xs text-muted-foreground mb-4">
                    Βάσει των στοιχείων κατασκευής, προτείνονται{" "}
                    <strong>{suggestedArticles.length} άρθρα</strong>
                    {isAdmin && (
                      <>
                        {" "}
                        ({fmtEur(suggestionsTotal)})
                      </>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => applySuggestions.mutate()}
                    disabled={applySuggestions.isPending}
                    className="min-h-[44px] gap-2"
                  >
                    {applySuggestions.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    Εφαρμογή προτεινόμενων
                  </Button>
                </div>
              )}

              {!itemsLoading && !hasItems && !canSuggest && (
                <div className="rounded-xl p-5 text-center bg-muted/30 border border-dashed border-border">
                  <Info className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                  <div className="text-xs text-muted-foreground">
                    Συμπλήρωσε τύπο κτιρίου & χαρακτηριστικά για αυτόματη
                    πρόταση, ή πρόσθεσε άρθρα χειροκίνητα.
                  </div>
                </div>
              )}

              {!itemsLoading && hasItems && (
                <div className="space-y-2">
                  {billingItems.map((item) => {
                    const srcMeta = SOURCE_BADGE[item.source] || SOURCE_BADGE.manual;
                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-border bg-card p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className="font-mono text-[10px] tabular-nums"
                              >
                                {item.article_code}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${srcMeta.cls}`}
                              >
                                {srcMeta.label}
                              </Badge>
                            </div>
                            <div className="text-sm font-medium mt-1 leading-snug">
                              {item.ote_articles?.title ?? item.article_code}
                            </div>
                          </div>
                          {isAdmin && (
                            <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums text-base shrink-0">
                              {fmtEur(Number(item.total_eur || 0))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-9 w-9"
                              onClick={() =>
                                updateQty.mutate({
                                  id: item.id,
                                  qty: Math.max(
                                    1,
                                    Number(item.quantity) - 1
                                  ),
                                })
                              }
                            >
                              −
                            </Button>
                            <Input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={item.quantity}
                              onChange={(e) =>
                                updateQty.mutate({
                                  id: item.id,
                                  qty: Number(e.target.value) || 1,
                                })
                              }
                              className="h-9 w-16 text-center text-sm font-mono tabular-nums"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-9 w-9"
                              onClick={() =>
                                updateQty.mutate({
                                  id: item.id,
                                  qty: Number(item.quantity) + 1,
                                })
                              }
                            >
                              +
                            </Button>
                            {isAdmin && (
                              <span className="text-[10px] text-muted-foreground tabular-nums ml-1">
                                × {fmtEur(Number(item.unit_price_eur))}
                              </span>
                            )}
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-destructive hover:bg-destructive/10"
                            onClick={() => deleteItem.mutate(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPickerSearch("");
                  setPickerOpen(true);
                }}
                className="w-full min-h-[48px] gap-2 border-dashed"
              >
                <Plus className="h-4 w-4" />
                Προσθήκη άρθρου
              </Button>

              {hasItems && canSuggest && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => applySuggestions.mutate()}
                  disabled={applySuggestions.isPending}
                  className="w-full text-xs gap-2"
                >
                  {applySuggestions.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Επανυπολογισμός προτάσεων
                </Button>
              )}

              {isAdmin && hasItems && (
                <div className="mt-3 p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-primary/10 border border-emerald-500/20 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Σύνολο ΟΤΕ
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {billingItems.length} άρθρα
                    </div>
                  </div>
                  <div className="font-mono font-black text-2xl text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {fmtEur(totalEur)}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent
          side="bottom"
          className="h-[85vh] flex flex-col p-0 rounded-t-2xl"
        >
          <SheetHeader className="px-4 pt-4 pb-2 shrink-0">
            <SheetTitle>Προσθήκη άρθρου ΟΤΕ</SheetTitle>
            <SheetDescription>
              {filteredCatalog.length} διαθέσιμα άρθρα
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Αναζήτηση κωδικού ή τίτλου..."
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="pl-9 h-11"
                autoFocus={false}
              />
            </div>
          </div>
          <ScrollArea className="flex-1 px-4 pb-[env(safe-area-inset-bottom)]">
            <div className="space-y-2 pb-4">
              {filteredCatalog.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  Δεν βρέθηκαν άρθρα
                </div>
              )}
              {filteredCatalog.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    addManual.mutate(a, {
                      onSuccess: () => {
                        setPickerSearch("");
                      },
                    });
                  }}
                  disabled={addManual.isPending}
                  className="w-full text-left rounded-xl border border-border bg-card p-3 hover:bg-muted/40 active:scale-[0.99] transition-all min-h-[64px] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] tabular-nums"
                      >
                        {a.code}
                      </Badge>
                    </div>
                    <div className="text-sm font-medium leading-snug">
                      {a.title}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums text-sm shrink-0">
                      {fmtEur(Number(a.price_eur))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
