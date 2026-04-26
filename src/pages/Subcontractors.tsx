import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  MapPin,
  Phone,
  Mail,
  Edit,
  Trash2,
  ArrowLeft,
  Receipt,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Subcontractor {
  id: string;
  full_name: string;
  short_name: string | null;
  phone: string | null;
  email: string | null;
  vat_number: string | null;
  primary_region: string | null;
  notes: string | null;
  active: boolean;
  total_tickets_completed: number | null;
  total_paid_eur: number | null;
}

interface FormState {
  full_name: string;
  short_name: string;
  phone: string;
  email: string;
  vat_number: string;
  primary_region: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  full_name: "",
  short_name: "",
  phone: "",
  email: "",
  vat_number: "",
  primary_region: "",
  notes: "",
};

export default function Subcontractors() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<Subcontractor | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["subcontractors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subcontractors")
        .select("*")
        .eq("active", true)
        .order("full_name");
      if (error) throw error;
      return (data || []) as Subcontractor[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (data: FormState) => {
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

      const payload = {
        ...data,
        organization_id: profile.organization_id,
      };

      if (editing?.id) {
        const { error } = await supabase
          .from("subcontractors")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subcontractors").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Ενημερώθηκε!" : "Προστέθηκε!");
      qc.invalidateQueries({ queryKey: ["subcontractors"] });
      setOpenDialog(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("subcontractors")
        .update({ active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Διαγράφηκε!");
      qc.invalidateQueries({ queryKey: ["subcontractors"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openEdit = (sub: Subcontractor) => {
    setEditing(sub);
    setForm({
      full_name: sub.full_name || "",
      short_name: sub.short_name || "",
      phone: sub.phone || "",
      email: sub.email || "",
      vat_number: sub.vat_number || "",
      primary_region: sub.primary_region || "",
      notes: sub.notes || "",
    });
    setOpenDialog(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpenDialog(true);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/client-selector")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Πίνακες
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Users className="h-5 w-5" />
                Υπεργολάβοι
              </h1>
              <p className="text-xs text-muted-foreground">
                {subs.length} ενεργοί
              </p>
            </div>
          </div>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            Νέος Υπεργολάβος
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="text-muted-foreground">Φόρτωση...</div>
          </div>
        ) : subs.length === 0 ? (
          <Card className="p-10 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground">
              Δεν υπάρχουν υπεργολάβοι
            </h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Πρόσθεσε υπεργολάβο για να ξεκινήσεις τη διαχείριση
            </p>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" />
              Πρόσθεσε τον πρώτο
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subs.map((sub) => (
              <Card key={sub.id} className="p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-foreground truncate">
                      👨 {sub.full_name}
                    </h3>
                    {sub.short_name && (
                      <p className="text-xs text-muted-foreground">
                        "{sub.short_name}"
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(sub)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (
                          confirm(`Διαγραφή του ${sub.full_name};`)
                        )
                          deleteMutation.mutate(sub.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm">
                  {sub.primary_region && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span>{sub.primary_region}</span>
                    </div>
                  )}
                  {sub.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4 shrink-0" />
                      <span>{sub.phone}</span>
                    </div>
                  )}
                  {sub.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4 shrink-0" />
                      <span className="truncate">{sub.email}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Tickets</p>
                    <p className="text-base font-semibold text-foreground">
                      {sub.total_tickets_completed || 0}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Συνολικά</p>
                    <p className="text-base font-semibold text-foreground">
                      {(Number(sub.total_paid_eur) || 0).toLocaleString(
                        "el-GR"
                      )}
                      €
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate(`/subcontractors/${sub.id}`)}
                >
                  <Receipt className="h-4 w-4 mr-2" />
                  Τιμοκατάλογος
                </Button>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Επεξεργασία" : "Νέος Υπεργολάβος"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Ονοματεπώνυμο *</Label>
              <Input
                value={form.full_name}
                onChange={(e) =>
                  setForm({ ...form, full_name: e.target.value })
                }
                placeholder="π.χ. Γιάννης Παπαδόπουλος"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Short name</Label>
              <Input
                value={form.short_name}
                onChange={(e) =>
                  setForm({ ...form, short_name: e.target.value })
                }
                placeholder="π.χ. Γιάννης"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Πρωτεύουσα Περιοχή *</Label>
              <Input
                value={form.primary_region}
                onChange={(e) =>
                  setForm({ ...form, primary_region: e.target.value })
                }
                placeholder="π.χ. Ρόδος"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Τηλέφωνο</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>ΑΦΜ</Label>
                <Input
                  value={form.vat_number}
                  onChange={(e) =>
                    setForm({ ...form, vat_number: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Σημειώσεις</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>
              Ακύρωση
            </Button>
            <Button
              onClick={() => upsertMutation.mutate(form)}
              disabled={
                !form.full_name ||
                !form.primary_region ||
                upsertMutation.isPending
              }
            >
              {editing ? "Ενημέρωση" : "Προσθήκη"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
