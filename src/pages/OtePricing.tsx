import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Search,
  Receipt,
  Pencil,
  ChevronDown,
  Check,
  X as XIcon,
  Loader2,
} from "lucide-react";

// ============================================================
// Types
// ============================================================
type OteCategory =
  | "AUTOPSIA"
  | "SKAMMA_BCP"
  | "EXTENSION"
  | "BEP"
  | "KOI_CABIN_BEP"
  | "HORIZONTAL"
  | "VERTICAL"
  | "CUSTOMER"
  | "SPLITTER"
  | "AERIAL_SPECIAL"
  | "SMART_READINESS"
  | "REPAIR_HEIGHT"
  | "EXCLUDED";

type OteFrequency =
  | "ALWAYS"
  | "CONDITIONAL"
  | "RARE"
  | "ON_DAMAGE"
  | "ON_APPROVAL"
  | "NEVER";

interface OteArticle {
  id: string;
  organization_id: string;
  code: string;
  category: OteCategory;
  title: string;
  official_description: string | null;
  when_to_use: string | null;
  user_annotation: string | null;
  price_eur: number;
  unit: string;
  frequency: OteFrequency;
  is_active: boolean;
  is_excluded: boolean;
  sort_order: number;
}

// ============================================================
// Static config
// ============================================================
const CATEGORIES: { value: OteCategory | "all"; label: string; icon: string }[] = [
  { value: "all", label: "Όλα", icon: "📋" },
  { value: "AUTOPSIA", label: "Αυτοψία", icon: "🔍" },
  { value: "SKAMMA_BCP", label: "Σκάμα & BCP", icon: "🛠️" },
  { value: "EXTENSION", label: "Επέκταση", icon: "🔌" },
  { value: "BEP", label: "BEP", icon: "📡" },
  { value: "KOI_CABIN_BEP", label: "Καμπίνα→BEP", icon: "🔗" },
  { value: "HORIZONTAL", label: "Οριζόντια", icon: "➡️" },
  { value: "VERTICAL", label: "Κατακόρυφη", icon: "⬆️" },
  { value: "CUSTOMER", label: "Πελάτης", icon: "👤" },
  { value: "SPLITTER", label: "Splitter", icon: "⚡" },
  { value: "AERIAL_SPECIAL", label: "Εναέρια", icon: "🛣️" },
  { value: "SMART_READINESS", label: "Smart Readiness", icon: "💡" },
  { value: "REPAIR_HEIGHT", label: "Βλάβες & Ύψος", icon: "🔧" },
  { value: "EXCLUDED", label: "Εξαιρούμενα", icon: "❌" },
];

const FREQUENCIES: {
  value: OteFrequency | "all";
  label: string;
  icon: string;
}[] = [
  { value: "all", label: "Όλες", icon: "✳️" },
  { value: "ALWAYS", label: "Πάντα", icon: "✅" },
  { value: "CONDITIONAL", label: "Υπό συνθήκες", icon: "⚙️" },
  { value: "RARE", label: "Σπάνια", icon: "🔵" },
  { value: "ON_DAMAGE", label: "Σε βλάβη", icon: "🔧" },
  { value: "ON_APPROVAL", label: "Με έγκριση", icon: "🚧" },
  { value: "NEVER", label: "Εξαιρείται", icon: "❌" },
];

const FREQ_STYLES: Record<OteFrequency, string> = {
  ALWAYS: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CONDITIONAL: "bg-amber-50 text-amber-700 border-amber-200",
  RARE: "bg-slate-50 text-slate-600 border-slate-200",
  ON_DAMAGE: "bg-red-50 text-red-700 border-red-200",
  ON_APPROVAL: "bg-orange-50 text-orange-700 border-orange-200",
  NEVER: "bg-slate-100 text-slate-500 border-slate-200 line-through",
};

const UNIT_LABEL: Record<string, string> = {
  SR: "Ανά SR",
  FLOOR: "Ανά όροφο",
  METER: "Ανά μέτρο",
  FIBER: "Ανά ίνα",
};

const formatEur = (n: number) =>
  new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(n);

// ============================================================
// Page
// ============================================================
export default function OtePricing() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<OteCategory | "all">("all");
  const [activeFrequency, setActiveFrequency] = useState<OteFrequency | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<OteArticle | null>(null);
  const [editPrice, setEditPrice] = useState<string>("");
  const [editAnnotation, setEditAnnotation] = useState<string>("");

  // Fetch
  const { data: articles, isLoading } = useQuery({
    queryKey: ["ote-articles", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("ote_articles" as any)
        .select("*")
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as unknown as OteArticle[]) || [];
    },
    enabled: !!organizationId,
  });

  // Stats
  const stats = useMemo(() => {
    const list = articles || [];
    return {
      total: list.length,
      active: list.filter((a) => a.is_active && !a.is_excluded).length,
      excluded: list.filter((a) => a.is_excluded).length,
      categories: new Set(list.map((a) => a.category)).size,
    };
  }, [articles]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = articles || [];
    if (activeCategory !== "all") list = list.filter((a) => a.category === activeCategory);
    if (activeFrequency !== "all") list = list.filter((a) => a.frequency === activeFrequency);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.code.toLowerCase().includes(q) ||
          a.title.toLowerCase().includes(q) ||
          (a.user_annotation || "").toLowerCase().includes(q) ||
          (a.when_to_use || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [articles, activeCategory, activeFrequency, search]);

  // Counts per category for chips
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    (articles || []).forEach((a) => {
      map.set(a.category, (map.get(a.category) || 0) + 1);
    });
    map.set("all", articles?.length || 0);
    return map;
  }, [articles]);

  // Mutations
  const updateArticle = useMutation({
    mutationFn: async (payload: { id: string; patch: Partial<OteArticle> }) => {
      const { error } = await supabase
        .from("ote_articles" as any)
        .update(payload.patch)
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ote-articles", organizationId] });
    },
    onError: (e: any) => {
      toast.error("Αποτυχία ενημέρωσης", { description: e.message });
    },
  });

  const handleToggleActive = (a: OteArticle) => {
    updateArticle.mutate(
      { id: a.id, patch: { is_active: !a.is_active } },
      {
        onSuccess: () =>
          toast.success(a.is_active ? "Άρθρο απενεργοποιήθηκε" : "Άρθρο ενεργοποιήθηκε"),
      },
    );
  };

  const openEdit = (a: OteArticle) => {
    setEditing(a);
    setEditPrice(a.price_eur.toString());
    setEditAnnotation(a.user_annotation || "");
  };

  const saveEdit = () => {
    if (!editing) return;
    const newPrice = parseFloat(editPrice.replace(",", "."));
    if (Number.isNaN(newPrice) || newPrice < 0) {
      toast.error("Μη έγκυρη τιμή");
      return;
    }
    updateArticle.mutate(
      {
        id: editing.id,
        patch: {
          price_eur: newPrice,
          user_annotation: editAnnotation.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast.success("Αποθηκεύτηκε", {
            description: `${editing.code} → ${formatEur(newPrice)}`,
          });
          setEditing(null);
        },
      },
    );
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 pb-12">
        {/* Hero */}
        <div className="px-4 pt-6 pb-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="rounded-3xl bg-gradient-to-br from-teal-600 via-emerald-600 to-emerald-700 text-white p-5 sm:p-7 shadow-xl shadow-emerald-900/10">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-white/15 backdrop-blur grid place-items-center shrink-0">
                  <Receipt className="h-6 w-6 sm:h-7 sm:w-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                    Τιμοκατάλογος ΟΤΕ
                  </h1>
                  <p className="text-emerald-50/90 text-xs sm:text-sm mt-0.5">
                    Διαχείριση {stats.total} άρθρων τιμολόγησης
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4 sm:mt-5">
                <StatPill label="Ενεργά" value={stats.active} />
                <StatPill label="Κατηγορίες" value={stats.categories} />
                <StatPill label="Εξαιρ." value={stats.excluded} />
              </div>

              {/* Search */}
              <div className="relative mt-4">
                <Search className="h-4 w-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Αναζήτηση κωδικού, τίτλου ή σημείωσης…"
                  className="pl-11 h-12 bg-white/95 text-foreground placeholder:text-slate-400 border-0 shadow-md focus-visible:ring-2 focus-visible:ring-white/40"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded-full hover:bg-slate-100 text-slate-500"
                    aria-label="Καθαρισμός"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Filter chips */}
        <div className="sticky top-0 z-10 backdrop-blur bg-white/85 border-b border-slate-200/70">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 space-y-2">
            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1 snap-x scrollbar-none">
              {CATEGORIES.map((c) => {
                const isActive = activeCategory === c.value;
                const count = categoryCounts.get(c.value) || 0;
                return (
                  <button
                    key={c.value}
                    onClick={() => setActiveCategory(c.value)}
                    className={`shrink-0 snap-start min-h-[44px] px-3.5 rounded-xl text-xs font-bold whitespace-nowrap border transition-all active:scale-95 ${
                      isActive
                        ? "bg-gradient-to-r from-teal-500 to-emerald-600 text-white border-transparent shadow-md shadow-emerald-500/30"
                        : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span className="mr-1.5">{c.icon}</span>
                    {c.label}
                    <span
                      className={`ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-md text-[10px] font-black ${
                        isActive ? "bg-white/25" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Frequencies */}
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1 snap-x scrollbar-none">
              {FREQUENCIES.map((f) => {
                const isActive = activeFrequency === f.value;
                return (
                  <button
                    key={f.value}
                    onClick={() => setActiveFrequency(f.value)}
                    className={`shrink-0 snap-start min-h-[36px] px-3 rounded-lg text-[11px] font-semibold whitespace-nowrap border transition-all active:scale-95 ${
                      isActive
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    <span className="mr-1">{f.icon}</span>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* List */}
        <div className="px-4 sm:px-6 lg:px-8 pt-4">
          <div className="max-w-6xl mx-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <div className="text-4xl mb-2">🔍</div>
                <p className="text-sm">Δεν βρέθηκαν άρθρα</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filtered.map((a) => (
                  <ArticleCard
                    key={a.id}
                    article={a}
                    expanded={expandedId === a.id}
                    onToggleExpand={() =>
                      setExpandedId(expandedId === a.id ? null : a.id)
                    }
                    onEdit={() => openEdit(a)}
                    onToggleActive={() => handleToggleActive(a)}
                    pending={updateArticle.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-emerald-600" />
              Επεξεργασία άρθρου
            </DialogTitle>
            <DialogDescription>
              {editing?.code} — {editing?.title}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="edit-price" className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Τιμή (€)
              </Label>
              <Input
                id="edit-price"
                type="text"
                inputMode="decimal"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="mt-1.5 text-2xl font-black tabular-nums h-14"
                placeholder="0.00"
              />
            </div>

            <div>
              <Label htmlFor="edit-annotation" className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Σημείωση (annotation)
              </Label>
              <Textarea
                id="edit-annotation"
                value={editAnnotation}
                onChange={(e) => setEditAnnotation(e.target.value)}
                className="mt-1.5"
                placeholder="π.χ. ΕΜΦΥΣΗΣΗ, FLOOR BOX 0…"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Ακύρωση
            </Button>
            <Button onClick={saveEdit} disabled={updateArticle.isPending}>
              {updateArticle.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Αποθήκευση
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ============================================================
// Sub-components
// ============================================================
function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/15 backdrop-blur px-3 py-2.5 text-center">
      <div className="text-xl sm:text-2xl font-black tabular-nums leading-none">
        {value}
      </div>
      <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-emerald-50/80 mt-1 font-bold">
        {label}
      </div>
    </div>
  );
}

function ArticleCard({
  article,
  expanded,
  onToggleExpand,
  onEdit,
  onToggleActive,
  pending,
}: {
  article: OteArticle;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  pending: boolean;
}) {
  const freq = FREQUENCIES.find((f) => f.value === article.frequency);
  const cat = CATEGORIES.find((c) => c.value === article.category);
  const isInactive = !article.is_active || article.is_excluded;

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-all ${
        isInactive
          ? "bg-slate-50/60 border-slate-200 opacity-75"
          : "bg-white border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md"
      }`}
    >
      {/* Main row */}
      <button
        onClick={onToggleExpand}
        className="w-full text-left px-4 py-3.5 active:bg-slate-50 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-900 text-white text-[10px] font-black tracking-wide font-mono">
                {article.code}
              </span>
              {freq && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${FREQ_STYLES[article.frequency]}`}
                >
                  <span className="mr-1">{freq.icon}</span>
                  {freq.label}
                </span>
              )}
              {article.user_annotation && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200">
                  📝 {article.user_annotation}
                </span>
              )}
            </div>

            <h3 className={`mt-1.5 text-sm sm:text-[15px] font-bold leading-snug ${isInactive ? "text-slate-500" : "text-slate-900"}`}>
              {article.title}
            </h3>

            {article.when_to_use && !expanded && (
              <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                {article.when_to_use}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div
              className={`inline-flex items-center px-2.5 py-1 rounded-lg font-mono font-black text-sm sm:text-base tabular-nums ${
                isInactive
                  ? "bg-slate-100 text-slate-500"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
              }`}
            >
              {formatEur(article.price_eur)}
            </div>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </div>
        </div>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50/50 px-4 py-3 space-y-3">
          {article.when_to_use && (
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                Πότε χρησιμοποιείται
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {article.when_to_use}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Κατηγορία
              </div>
              <div className="font-bold text-slate-800 mt-0.5">
                {cat?.icon} {cat?.label}
              </div>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Μονάδα
              </div>
              <div className="font-bold text-slate-800 mt-0.5">
                {UNIT_LABEL[article.unit] || article.unit}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2 text-xs">
              <Switch
                checked={article.is_active}
                onCheckedChange={onToggleActive}
                disabled={pending || article.is_excluded}
              />
              <span className="font-semibold text-slate-700">
                {article.is_excluded
                  ? "Εξαιρείται"
                  : article.is_active
                    ? "Ενεργό"
                    : "Ανενεργό"}
              </span>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="min-h-[40px]"
            >
              <Pencil className="h-3.5 w-3.5" />
              Επεξεργασία
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
