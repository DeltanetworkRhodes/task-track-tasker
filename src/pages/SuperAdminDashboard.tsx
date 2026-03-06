import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Building2, Plus, Users, Settings, Power, PowerOff, Pencil, Trash2, Globe, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const SuperAdminDashboard = () => {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<any>(null);
  const [form, setForm] = useState({ name: "", slug: "", plan: "basic", max_users: "10" });

  const { data: organizations, isLoading } = useQuery({
    queryKey: ["all-organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: orgUserCounts } = useQuery({
    queryKey: ["org-user-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("organization_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((p: any) => {
        if (p.organization_id) {
          counts[p.organization_id] = (counts[p.organization_id] || 0) + 1;
        }
      });
      return counts;
    },
  });

  const resetForm = () => setForm({ name: "", slug: "", plan: "basic", max_users: "10" });

  const handleCreate = async () => {
    if (!form.name || !form.slug) return toast.error("Συμπλήρωσε όνομα και slug");
    const { error } = await supabase.from("organizations").insert({
      name: form.name,
      slug: form.slug.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      plan: form.plan,
      max_users: parseInt(form.max_users) || 10,
    } as any);
    if (error) return toast.error(error.message);
    toast.success("Εταιρία δημιουργήθηκε");
    queryClient.invalidateQueries({ queryKey: ["all-organizations"] });
    setCreateOpen(false);
    resetForm();
  };

  const handleUpdate = async () => {
    if (!editingOrg) return;
    const { error } = await supabase
      .from("organizations")
      .update({
        name: form.name,
        slug: form.slug.toLowerCase().replace(/[^a-z0-9-]/g, ""),
        plan: form.plan,
        max_users: parseInt(form.max_users) || 10,
      } as any)
      .eq("id", editingOrg.id);
    if (error) return toast.error(error.message);
    toast.success("Ενημερώθηκε");
    queryClient.invalidateQueries({ queryKey: ["all-organizations"] });
    setEditingOrg(null);
    resetForm();
  };

  const toggleStatus = async (org: any) => {
    const newStatus = org.status === "active" ? "suspended" : "active";
    const { error } = await supabase
      .from("organizations")
      .update({ status: newStatus } as any)
      .eq("id", org.id);
    if (error) return toast.error(error.message);
    toast.success(newStatus === "active" ? "Ενεργοποιήθηκε" : "Απενεργοποιήθηκε");
    queryClient.invalidateQueries({ queryKey: ["all-organizations"] });
  };

  const handleDelete = async (orgId: string) => {
    const { error } = await supabase.from("organizations").delete().eq("id", orgId);
    if (error) return toast.error(error.message);
    toast.success("Διαγράφηκε");
    queryClient.invalidateQueries({ queryKey: ["all-organizations"] });
  };

  const startEdit = (org: any) => {
    setEditingOrg(org);
    setForm({ name: org.name, slug: org.slug, plan: org.plan, max_users: String(org.max_users) });
  };

  const planColors: Record<string, string> = {
    basic: "bg-muted text-muted-foreground",
    pro: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    enterprise: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg">
            S
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Super Admin Panel</h1>
            <p className="text-xs text-muted-foreground">Διαχείριση Εταιριών & Οργανισμών</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut} className="gap-2 text-muted-foreground">
          <LogOut className="h-4 w-4" /> Αποσύνδεση
        </Button>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{organizations?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Εταιρίες</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Power className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {organizations?.filter((o: any) => o.status === "active").length || 0}
              </p>
              <p className="text-xs text-muted-foreground">Ενεργές</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {Object.values(orgUserCounts || {}).reduce((a: number, b: number) => a + b, 0)}
              </p>
              <p className="text-xs text-muted-foreground">Συνολικοί Χρήστες</p>
            </div>
          </Card>
        </div>

        {/* Header + Create */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Εταιρίες</h2>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2" onClick={resetForm}>
                <Plus className="h-4 w-4" /> Νέα Εταιρία
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Δημιουργία Εταιρίας</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Όνομα</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="π.χ. Delta Network" />
                </div>
                <div className="space-y-2">
                  <Label>Slug (URL-friendly)</Label>
                  <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="π.χ. delta-network" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Πλάνο</Label>
                    <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basic">Basic</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Μέγιστοι Χρήστες</Label>
                    <Input type="number" value={form.max_users} onChange={(e) => setForm({ ...form, max_users: e.target.value })} />
                  </div>
                </div>
                <Button className="w-full" onClick={handleCreate}>Δημιουργία</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editingOrg} onOpenChange={(open) => { if (!open) setEditingOrg(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Επεξεργασία Εταιρίας</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Όνομα</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Πλάνο</Label>
                  <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Μέγιστοι Χρήστες</Label>
                  <Input type="number" value={form.max_users} onChange={(e) => setForm({ ...form, max_users: e.target.value })} />
                </div>
              </div>
              <Button className="w-full" onClick={handleUpdate}>Αποθήκευση</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Organizations List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : (organizations || []).length === 0 ? (
          <Card className="p-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Δεν υπάρχουν εταιρίες ακόμα</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {(organizations || []).map((org: any) => (
              <Card key={org.id} className={`p-4 transition-all ${org.status === "suspended" ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{org.name}</p>
                        <Badge variant="outline" className={planColors[org.plan] || planColors.basic}>
                          {org.plan}
                        </Badge>
                        <Badge variant={org.status === "active" ? "default" : "destructive"} className="text-[10px]">
                          {org.status === "active" ? "Ενεργή" : "Ανενεργή"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" /> {org.slug}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {(orgUserCounts || {})[org.id] || 0} / {org.max_users}
                        </span>
                        <span>
                          {new Date(org.created_at).toLocaleDateString("el-GR")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(org)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleStatus(org)}
                    >
                      {org.status === "active" ? (
                        <PowerOff className="h-3.5 w-3.5 text-orange-500" />
                      ) : (
                        <Power className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Διαγραφή «{org.name}»;</AlertDialogTitle>
                          <AlertDialogDescription>
                            Η εταιρία και ΟΛΑ τα δεδομένα της (αναθέσεις, κατασκευές, υλικά, χρήστες) θα διαγραφούν οριστικά.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Ακύρωση</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => handleDelete(org.id)}
                          >
                            Διαγραφή
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
