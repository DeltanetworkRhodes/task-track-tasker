import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Shield, User, UserCog, Trash2, Mail, Phone, MapPin, Pencil, Check, X, UserPlus } from "lucide-react";

const UserManagement = () => {
  const queryClient = useQueryClient();
  const [assigning, setAssigning] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ email: string; phone: string; area: string }>({ email: "", phone: "", area: "" });
  const [deleting, setDeleting] = useState<string | null>(null);

  // Create user state
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: "", email: "", password: "", role: "technician" });

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.full_name) {
      toast.error("Συμπληρώστε όλα τα πεδία");
      return;
    }
    if (newUser.password.length < 6) {
      toast.error("Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: newUser.email,
          password: newUser.password,
          full_name: newUser.full_name,
          role: newUser.role,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Ο χρήστης δημιουργήθηκε!");
      setNewUser({ full_name: "", email: "", password: "", role: "technician" });
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["all-roles"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: roles } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const roleMap = (roles || []).reduce((acc: Record<string, string>, r) => {
    acc[r.user_id] = r.role;
    return acc;
  }, {});

  const handleSetRole = async (userId: string, role: string) => {
    setAssigning(userId);
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
      queryClient.invalidateQueries({ queryKey: ["all-roles"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAssigning(null);
    }
  };

  const handleRemoveRole = async (userId: string) => {
    setAssigning(userId);
    try {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (error) throw error;
      toast.success("Ρόλος αφαιρέθηκε");
      queryClient.invalidateQueries({ queryKey: ["all-roles"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAssigning(null);
    }
  };

  const startEditing = (p: any) => {
    setEditingId(p.id);
    setEditValues({
      email: p.email || "",
      phone: p.phone || "",
      area: p.area || "",
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues({ email: "", phone: "", area: "" });
  };

  const saveEditing = async (profileId: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          email: editValues.email || null,
          phone: editValues.phone || null,
          area: editValues.area || null,
        } as any)
        .eq("id", profileId);
      if (error) throw error;
      toast.success("Στοιχεία ενημερώθηκαν");
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      setEditingId(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setDeleting(userId);
    try {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Ο χρήστης διαγράφηκε οριστικά");
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["all-roles"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <UserCog className="h-6 w-6" />
            Διαχείριση Χρηστών
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Εκχώρηση ρόλων · Επεξεργασία στοιχείων · Διαγραφή
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : (profiles || []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">Δεν βρέθηκαν χρήστες</p>
        ) : (
          <div className="space-y-3">
            {(profiles || []).map((p) => {
              const role = roleMap[p.user_id];
              const isEditing = editingId === p.id;

              return (
                <Card key={p.id} className="p-4 space-y-3">
                  {/* Header row: name + role + actions */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted shrink-0">
                        {role === "admin" ? (
                          <Shield className="h-5 w-5 text-primary" />
                        ) : role === "technician" ? (
                          <User className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <User className="h-5 w-5 text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {p.full_name || "—"}
                        </p>
                        {!role && (
                          <span className="text-[10px] text-orange-500 font-medium">Αναμονή έγκρισης</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {role && (
                        <Badge
                          variant="outline"
                          className={
                            role === "admin"
                              ? "bg-primary/10 text-primary border-primary/20"
                              : "bg-blue-500/10 text-blue-600 border-blue-500/20"
                          }
                        >
                          {role}
                        </Badge>
                      )}

                      <Select
                        value={role || ""}
                        onValueChange={(val) => handleSetRole(p.user_id, val)}
                        disabled={assigning === p.user_id}
                      >
                        <SelectTrigger className="w-[130px] text-xs h-8">
                          <SelectValue placeholder="Χωρίς ρόλο" />
                        </SelectTrigger>
                        <SelectContent>
                          
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="technician">Technician</SelectItem>
                        </SelectContent>
                      </Select>

                      {role && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveRole(p.user_id)}
                          disabled={assigning === p.user_id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Details row: editable or read-only */}
                  {isEditing ? (
                    <div className="pl-[52px] space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <Input
                            type="email"
                            value={editValues.email}
                            onChange={(e) => setEditValues({ ...editValues, email: e.target.value })}
                            placeholder="Email"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <Input
                            type="tel"
                            value={editValues.phone}
                            onChange={(e) => setEditValues({ ...editValues, phone: e.target.value })}
                            placeholder="Κινητό"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <Input
                            value={editValues.area}
                            onChange={(e) => setEditValues({ ...editValues, area: e.target.value })}
                            placeholder="Περιοχή"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => saveEditing(p.id)}>
                          <Check className="h-3 w-3" /> Αποθήκευση
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={cancelEditing}>
                          <X className="h-3 w-3" /> Ακύρωση
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pl-[52px]">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {(p as any).email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {(p as any).email}
                          </span>
                        )}
                        {p.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {p.phone}
                          </span>
                        )}
                        {p.area && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {p.area}
                          </span>
                        )}
                        {!(p as any).email && !p.phone && !p.area && (
                          <span className="text-muted-foreground/50 italic">Χωρίς στοιχεία</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => startEditing(p)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              disabled={deleting === p.user_id}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Οριστική Διαγραφή Χρήστη</AlertDialogTitle>
                              <AlertDialogDescription>
                                Ο χρήστης <strong>{p.full_name || "—"}</strong> θα διαγραφεί οριστικά μαζί με όλα τα δεδομένα του. Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Ακύρωση</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleDeleteUser(p.user_id)}
                              >
                                Διαγραφή
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default UserManagement;
