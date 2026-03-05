import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";

const useTechnicians = () => {
  return useQuery({
    queryKey: ["technicians"],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "technician" as any);
      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];
      const techIds = roles.map((r) => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, area")
        .in("user_id", techIds);
      if (profilesError) throw profilesError;
      return profiles || [];
    },
  });
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateAssignmentDialog = ({ open, onOpenChange }: Props) => {
  const queryClient = useQueryClient();
  const { data: technicians } = useTechnicians();
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    sr_id: "",
    area: "ΡΟΔΟΣ",
    customer_name: "",
    address: "",
    phone: "",
    cab: "",
    comments: "",
    technician_id: "__none__",
  });

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const resetForm = () => {
    setForm({
      sr_id: "",
      area: "ΡΟΔΟΣ",
      customer_name: "",
      address: "",
      phone: "",
      cab: "",
      comments: "",
      technician_id: "__none__",
    });
  };

  const handleSubmit = async () => {
    if (!form.sr_id.trim()) {
      toast.error("Το SR ID είναι υποχρεωτικό");
      return;
    }
    if (!form.area) {
      toast.error("Η Περιοχή είναι υποχρεωτική");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("assignments").insert({
        sr_id: form.sr_id.trim(),
        area: form.area,
        customer_name: form.customer_name.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        cab: form.cab.trim() || null,
        comments: form.comments.trim() || null,
        technician_id: form.technician_id === "__none__" ? null : form.technician_id,
        source_tab: form.area,
        status: "pending",
      });
      if (error) throw error;

      toast.success("Η ανάθεση δημιουργήθηκε επιτυχώς");
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα δημιουργίας");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            Νέα Ανάθεση SR
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">SR ID <span className="text-destructive">*</span></Label>
              <Input
                value={form.sr_id}
                onChange={(e) => update("sr_id", e.target.value)}
                placeholder="π.χ. 2-339910..."
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Περιοχή <span className="text-destructive">*</span></Label>
              <Select value={form.area} onValueChange={(v) => update("area", v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ΡΟΔΟΣ">ΡΟΔΟΣ</SelectItem>
                  <SelectItem value="ΚΩΣ">ΚΩΣ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Πελάτης</Label>
            <Input
              value={form.customer_name}
              onChange={(e) => update("customer_name", e.target.value)}
              placeholder="Ονοματεπώνυμο πελάτη"
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Διεύθυνση</Label>
            <Input
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="Οδός, αριθμός, όροφος"
              className="text-sm"
            />
          </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Τηλέφωνο</Label>
              <Input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="69xxxxxxxx"
                className="text-sm"
                type="tel"
              />
            </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Καμπίνα (CAB)</Label>
              <Input
                value={form.cab}
                onChange={(e) => update("cab", e.target.value)}
                placeholder="π.χ. G151"
                className="text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Τεχνικός</Label>
            <Select value={form.technician_id} onValueChange={(v) => update("technician_id", v)}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Χωρίς ανάθεση" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-muted-foreground">Χωρίς ανάθεση</span>
                </SelectItem>
                {(technicians || []).map((t) => (
                  <SelectItem key={t.user_id} value={t.user_id}>
                    {t.full_name}{t.area ? ` (${t.area})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Σχόλια</Label>
            <Textarea
              value={form.comments}
              onChange={(e) => update("comments", e.target.value)}
              placeholder="Σημειώσεις..."
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Ακύρωση
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Δημιουργία
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateAssignmentDialog;
