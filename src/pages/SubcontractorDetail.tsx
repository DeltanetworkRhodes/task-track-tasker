import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface VodafoneArticle {
  id: string;
  code: string;
  description_el: string;
  customer_type: "CBU" | "EBU" | "SoHo";
  unit_price_eur: number;
  is_combo: boolean | null;
  active: boolean;
  sort_order: number | null;
}

interface SubPricing {
  id: string;
  subcontractor_id: string;
  client_code: string;
  service_code: string;
  customer_type: string;
  unit_price_eur: number;
}

export default function SubcontractorDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>(
    {}
  );

  const { data: sub } = useQuery({
    queryKey: ["subcontractor", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subcontractors")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: articles = [] } = useQuery({
    queryKey: ["vodafone_articles_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vodafone_articles")
        .select("*")
        .eq("active", true)
        .order("customer_type")
        .order("sort_order");
      if (error) throw error;
      return (data || []) as VodafoneArticle[];
    },
  });

  const { data: pricing = [] } = useQuery({
    queryKey: ["subcontractor_pricing", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subcontractor_pricing")
        .select("*")
        .eq("subcontractor_id", id!);
      if (error) throw error;
      return (data || []) as SubPricing[];
    },
    enabled: !!id,
  });

  const upsertPriceMutation = useMutation({
    mutationFn: async ({
      service_code,
      customer_type,
      unit_price_eur,
    }: {
      service_code: string;
      customer_type: string;
      unit_price_eur: number;
    }) => {
      const existing = pricing.find(
        (p) =>
          p.service_code === service_code && p.customer_type === customer_type
      );

      if (existing) {
        const { error } = await supabase
          .from("subcontractor_pricing")
          .update({ unit_price_eur })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("subcontractor_pricing")
          .insert({
            subcontractor_id: id!,
            client_code: "VODAFONE",
            service_code,
            customer_type,
            unit_price_eur,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Τιμή αποθηκεύτηκε");
      qc.invalidateQueries({ queryKey: ["subcontractor_pricing", id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const getPriceForArticle = (
    code: string,
    customerType: string
  ): number | undefined => {
    const found = pricing.find(
      (p) => p.service_code === code && p.customer_type === customerType
    );
    return found ? Number(found.unit_price_eur) : undefined;
  };

  const handleSavePrice = (article: VodafoneArticle) => {
    const key = `${article.code}_${article.customer_type}`;
    const value = editingPrices[key];
    if (value === undefined || value === "") return;
    const price = parseFloat(value.replace(",", "."));
    if (isNaN(price) || price < 0) {
      toast.error("Μη έγκυρη τιμή");
      return;
    }
    upsertPriceMutation.mutate({
      service_code: article.code,
      customer_type: article.customer_type,
      unit_price_eur: price,
    });
    setEditingPrices((prev) => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const cbu = articles.filter((a) => a.customer_type === "CBU");
  const ebu = articles.filter((a) => a.customer_type === "EBU");
  const soho = articles.filter((a) => a.customer_type === "SoHo");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/subcontractors")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Υπεργολάβοι
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              👨 {sub?.full_name || "—"}
            </h1>
            <p className="text-xs text-muted-foreground">
              📍 {sub?.primary_region || "—"}
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <Card className="p-4">
          <h2 className="text-base font-semibold text-foreground">
            💵 Τιμοκατάλογος Υπεργολάβου
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Ορίστε τις τιμές που πληρώνετε αυτόν τον υπεργολάβο για κάθε
            υπηρεσία. Αν δεν οριστεί τιμή, θα μένει 0€ μέχρι να την
            συμπληρώσετε.
          </p>
        </Card>

        <Tabs defaultValue="cbu">
          <TabsList>
            <TabsTrigger value="cbu">CBU (Νησιά)</TabsTrigger>
            <TabsTrigger value="ebu">EBU</TabsTrigger>
            <TabsTrigger value="soho">SoHo</TabsTrigger>
          </TabsList>

          {[
            { value: "cbu", label: "CBU", items: cbu },
            { value: "ebu", label: "EBU", items: ebu },
            { value: "soho", label: "SoHo", items: soho },
          ].map((tab) => (
            <TabsContent
              key={tab.value}
              value={tab.value}
              className="space-y-2"
            >
              {tab.items.map((article) => {
                const key = `${article.code}_${article.customer_type}`;
                const currentPrice = getPriceForArticle(
                  article.code,
                  article.customer_type
                );
                const editValue = editingPrices[key];
                const isEditing = key in editingPrices;

                return (
                  <Card key={article.id} className="p-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-bold text-foreground">
                            {article.code}
                          </span>
                          {article.is_combo && (
                            <Badge variant="secondary" className="text-xs">
                              COMBO
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {article.description_el}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-[10px] uppercase text-muted-foreground">
                            Vodafone
                          </p>
                          <p className="text-sm font-semibold text-foreground">
                            {Number(article.unit_price_eur).toFixed(2)}€
                          </p>
                        </div>

                        <span className="text-muted-foreground text-sm">→</span>

                        <div className="flex items-center gap-1">
                          <Input
                            type="text"
                            inputMode="decimal"
                            className="h-9 w-24 text-right"
                            placeholder={
                              currentPrice !== undefined
                                ? currentPrice.toFixed(2)
                                : "0,00"
                            }
                            value={
                              editValue !== undefined
                                ? editValue
                                : currentPrice !== undefined
                                  ? currentPrice.toFixed(2)
                                  : ""
                            }
                            onChange={(e) =>
                              setEditingPrices((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                          />
                          <span className="text-sm text-muted-foreground">
                            €
                          </span>
                        </div>

                        {isEditing && (
                          <Button
                            size="icon"
                            onClick={() => handleSavePrice(article)}
                            disabled={upsertPriceMutation.isPending}
                          >
                            {upsertPriceMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}

              {tab.items.length === 0 && (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  Δεν υπάρχουν articles για {tab.label}
                </Card>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}
