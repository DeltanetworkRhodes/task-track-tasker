import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Shield, User, UserCog, Trash2, Mail, Phone, MapPin, Pencil, Check, X, UserPlus, Clock, KeyRound } from "lucide-react";
import UserCard from "@/components/UserCard";
import ResetPasswordDialog from "@/components/ResetPasswordDialog";

const UserManagement = () => {
  const queryClient = useQueryClient();
  const { organizationId } = useOrganization();

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
        body: { email: newUser.email, password: newUser.password, full_name: newUser.full_name, role: newUser.role },
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

  // Fetch profiles filtered by organization — never load without org filter
  const { data: profiles, isLoading } = useQuery({
    queryKey: ["all-profiles", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
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

  // Split into active users and pending users
  const activeUsers = (profiles || []).filter((p) => roleMap[p.user_id]);
  const pendingUsers = (profiles || []).filter((p) => !roleMap[p.user_id]);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <UserCog className="h-5 sm:h-6 w-5 sm:w-6 shrink-0" />
              Διαχείριση Χρηστών
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Εκχώρηση ρόλων · Επεξεργασία στοιχείων · Διαγραφή
            </p>
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 self-start sm:self-auto" size="sm">
                <UserPlus className="h-4 w-4" />
                Νέος Χρήστης
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Δημιουργία Νέου Χρήστη</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Ονοματεπώνυμο *</Label>
                  <Input value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} placeholder="π.χ. Γιώργος Παπαδόπουλος" />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="user@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Κωδικός *</Label>
                  <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="Ελάχιστο 6 χαρακτήρες" />
                </div>
                <div className="space-y-2">
                  <Label>Ρόλος</Label>
                  <Select value={newUser.role} onValueChange={(val) => setNewUser({ ...newUser, role: val })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technician">Τεχνικός</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={handleCreateUser} disabled={creating}>
                  {creating ? "Δημιουργία..." : "Δημιουργία Χρήστη"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Pending Approval Section */}
        {pendingUsers.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              <h2 className="text-lg font-semibold text-foreground">Αναμονή Έγκρισης</h2>
              <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20">
                {pendingUsers.length}
              </Badge>
            </div>
            <div className="space-y-3">
              {pendingUsers.map((p) => (
                <UserCard key={p.id} profile={p} role={null} roleMap={roleMap} isPending />
              ))}
            </div>
          </div>
        )}

        {/* Active Users Section */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : activeUsers.length === 0 && pendingUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">Δεν βρέθηκαν χρήστες</p>
        ) : (
          activeUsers.length > 0 && (
            <div className="space-y-3">
              {pendingUsers.length > 0 && (
                <h2 className="text-lg font-semibold text-foreground">Ενεργοί Χρήστες</h2>
              )}
              {activeUsers.map((p) => (
                <UserCard key={p.id} profile={p} role={roleMap[p.user_id]} roleMap={roleMap} />
              ))}
            </div>
          )
        )}
      </div>
    </AppLayout>
  );
};

export default UserManagement;
