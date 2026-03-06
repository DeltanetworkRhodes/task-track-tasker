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
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Building2, Plus, Users, Power, PowerOff, Pencil, Trash2, Globe, LogOut, ChevronDown, Shield, User, UserPlus, Mail, MapPin } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const SuperAdminDashboard = () => {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<any>(null);
  const [form, setForm] = useState({ name: "", slug: "", plan: "basic", max_users: "10" });
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [createUserOrg, setCreateUserOrg] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({ email: "", password: "", full_name: "", role: "technician" });
  const [creatingUser, setCreatingUser] = useState(false);

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

  const { data: allProfiles } = useQuery({
    queryKey: ["all-profiles-super"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, area, organization_id, phone");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allRoles } = useQuery({
    queryKey: ["all-roles-super"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (error) throw error;
      return data || [];
    },
  });

  const roleMap = (allRoles || []).reduce((acc: Record<string, string>, r) => {
    acc[r.user_id] = r.role;
    return acc;
  }, {});

  const orgUserCounts = (allProfiles || []).reduce((acc: Record<string, number>, p: any) => {
    if (p.organization_id) acc[p.organization_id] = (acc[p.organization_id] || 0) + 1;
    return acc;
  }, {});

  const getOrgUsers = (orgId: string) =>
    (allProfiles || []).filter((p: any) => p.organization_id === orgId);

  const noOrgUsers = (allProfiles || []).filter((p: any) => !p.organization_id);

  const resetForm = () => setForm({ name: "", slug: "", plan: "basic", max_users: "10" });
  const resetUserForm = () => setUserForm({ email: "", password: "", full_name: "", role: "technician" });

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

  const handleCreateUser = async () => {
    if (!userForm.email || !userForm.password || !createUserOrg) return;
    setCreatingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: userForm.email,
          password: userForm.password,
          full_name: userForm.full_name,
          role: userForm.role,
          organization_id: createUserOrg,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Χρήστης δημιουργήθηκε");
      queryClient.invalidateQueries({ queryKey: ["all-profiles-super"] });
      queryClient.invalidateQueries({ queryKey: ["all-roles-super"] });
      setCreateUserOrg(null);
      resetUserForm();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Ο χρήστης διαγράφηκε");
      queryClient.invalidateQueries({ queryKey: ["all-profiles-super"] });
      queryClient.invalidateQueries({ queryKey: ["all-roles-super"] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSetRole = async (userId: string, role: string) => {
    try {
      const existing = roleMap[userId];
      if (existing) {
        const { error } = await supabase.from("user_roles").update({ role: role as any }).eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
        if (error) throw error;
      }
      toast.success(`Ρόλος → ${role}`);
      queryClient.invalidateQueries({ queryKey: ["all-roles-super"] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const planColors: Record<string, string> = {
    basic: "bg-muted text-muted-foreground",
    pro: "bg-primary/10 text-primary border-primary/20",
    enterprise: "bg-accent/10 text-accent border-accent/20",
  };

  const UserRow = ({ profile }: { profile: any }) => {
    const role = roleMap[profile.user_id];
    const isSuperAdmin = role === "super_admin";
    return (
      <div className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${
            role === "admin" ? "bg-primary/15" : role === "super_admin" ? "bg-accent/15" : "bg-muted"
          }`}>
            {role === "admin" || role === "super_admin" ? (
              <Shield className="h-3.5 w-3.5 text-primary" />
            ) : (
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{profile.full_name || "—"}</p>
            <p className="text-[11px] text-muted-foreground truncate">{profile.email || ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {role && (
            <Badge variant="outline" className={`text-[10px] ${
              role === "admin" ? "bg-primary/10 text-primary border-primary/20" :
              role === "super_admin" ? "bg-accent/10 text-accent border-accent/20" :
              "bg-muted text-muted-foreground"
            }`}>
              {role}
            </Badge>
          )}
          {!role && (
            <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20">
              αναμονή
            </Badge>
          )}
          {!isSuperAdmin && (
            <>
              <Select value={role || ""} onValueChange={(val) => handleSetRole(profile.user_id, val)}>
                <SelectTrigger className="w-[110px] text-[11px] h-7">
                  <SelectValue placeholder="Ρόλος" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="technician">Technician</SelectItem>
                </SelectContent>
              </Select>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Διαγραφή «{profile.full_name}»;</AlertDialogTitle>
                    <AlertDialogDescription>
                      Ο χρήστης θα διαγραφεί οριστικά. Δεν μπορεί να αναιρεθεί.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Ακύρωση</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => handleDeleteUser(profile.user_id)}>
                      Διαγραφή
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl cosmote-gradient text-white font-bold text-lg shadow-md">
            S
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Super Admin Panel</h1>
            <p className="text-xs text-muted-foreground">Διαχείριση Εταιριών · Χρηστών · Ρόλων</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut} className="gap-2 text-muted-foreground">
          <LogOut className="h-4 w-4" /> Αποσύνδεση
        </Button>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
            <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
              <Power className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {organizations?.filter((o: any) => o.status === "active").length || 0}
              </p>
              <p className="text-xs text-muted-foreground">Ενεργές</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {(allProfiles || []).length}
              </p>
              <p className="text-xs text-muted-foreground">Χρήστες</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <User className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {noOrgUsers.length}
              </p>
              <p className="text-xs text-muted-foreground">Χωρίς Εταιρία</p>
            </div>
          </Card>
        </div>

        {/* Header + Create */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Εταιρίες</h2>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2 cosmote-gradient text-white border-0" onClick={resetForm}>
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
                <Button className="w-full cosmote-gradient text-white border-0" onClick={handleCreate}>Δημιουργία</Button>
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

        {/* Create User Dialog */}
        <Dialog open={!!createUserOrg} onOpenChange={(open) => { if (!open) { setCreateUserOrg(null); resetUserForm(); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                Νέος Χρήστης
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Ονοματεπώνυμο</Label>
                <Input value={userForm.full_name} onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })} placeholder="π.χ. Γιώργος Παπαδόπουλος" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} placeholder="user@example.com" />
              </div>
              <div className="space-y-2">
                <Label>Κωδικός</Label>
                <Input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} placeholder="Τουλάχιστον 6 χαρακτήρες" />
              </div>
              <div className="space-y-2">
                <Label>Ρόλος</Label>
                <Select value={userForm.role} onValueChange={(v) => setUserForm({ ...userForm, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="technician">Technician</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full cosmote-gradient text-white border-0" onClick={handleCreateUser} disabled={creatingUser || !userForm.email || !userForm.password}>
                {creatingUser ? "Δημιουργία..." : "Δημιουργία Χρήστη"}
              </Button>
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
            {(organizations || []).map((org: any) => {
              const users = getOrgUsers(org.id);
              const isExpanded = expandedOrg === org.id;
              return (
                <Card key={org.id} className={`overflow-hidden transition-all ${org.status === "suspended" ? "opacity-60" : ""}`}>
                  <Collapsible open={isExpanded} onOpenChange={() => setExpandedOrg(isExpanded ? null : org.id)}>
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <CollapsibleTrigger asChild>
                          <button className="flex items-center gap-3 min-w-0 text-left hover:opacity-80 transition-opacity">
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
                                  {(orgUserCounts)[org.id] || 0} / {org.max_users}
                                </span>
                              </div>
                            </div>
                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </button>
                        </CollapsibleTrigger>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(org)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleStatus(org)}>
                            {org.status === "active" ? (
                              <PowerOff className="h-3.5 w-3.5 text-warning" />
                            ) : (
                              <Power className="h-3.5 w-3.5 text-success" />
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
                                  Η εταιρία και ΟΛΑ τα δεδομένα της θα διαγραφούν οριστικά.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Ακύρωση</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => handleDelete(org.id)}>
                                  Διαγραφή
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>

                    <CollapsibleContent>
                      <div className="border-t border-border bg-muted/30 px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Χρήστες ({users.length})
                          </p>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setCreateUserOrg(org.id)}>
                            <UserPlus className="h-3 w-3" /> Νέος
                          </Button>
                        </div>
                        {users.length === 0 ? (
                          <p className="text-xs text-muted-foreground/60 py-3 text-center italic">
                            Δεν υπάρχουν χρήστες
                          </p>
                        ) : (
                          <div className="space-y-0.5">
                            {users.map((p: any) => (
                              <UserRow key={p.user_id} profile={p} />
                            ))}
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}
          </div>
        )}

        {/* Users without organization */}
        {noOrgUsers.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <User className="h-5 w-5 text-warning" />
              Χρήστες χωρίς Εταιρία
              <Badge variant="outline" className="ml-1">{noOrgUsers.length}</Badge>
            </h2>
            <Card className="p-3">
              <div className="space-y-0.5">
                {noOrgUsers.map((p: any) => (
                  <UserRow key={p.user_id} profile={p} />
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
