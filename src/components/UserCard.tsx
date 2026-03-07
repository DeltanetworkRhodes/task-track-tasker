import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Shield, User, Trash2, Mail, Phone, MapPin, Pencil, Check, X, KeyRound } from "lucide-react";
import ResetPasswordDialog from "@/components/ResetPasswordDialog";

interface UserCardProps {
  profile: any;
  role: string | null;
  roleMap: Record<string, string>;
  isPending?: boolean;
}

const UserCard = ({ profile: p, role, roleMap, isPending }: UserCardProps) => {
  const queryClient = useQueryClient();
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({ email: "", phone: "", area: "" });
  const [resetOpen, setResetOpen] = useState(false);

  const handleSetRole = async (userId: string, newRole: string) => {
    setAssigning(true);
    try {
      const existing = roleMap[userId];
      if (existing) {
        const { error } = await supabase.from("user_roles").update({ role: newRole as any }).eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole as any });
        if (error) throw error;
      }
      toast.success(`Ρόλος → ${newRole}`);
      queryClient.invalidateQueries({ queryKey: ["all-roles"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveRole = async (userId: string) => {
    setAssigning(true);
    try {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (error) throw error;
      toast.success("Ρόλος αφαιρέθηκε");
      queryClient.invalidateQueries({ queryKey: ["all-roles"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const startEditing = () => {
    setIsEditing(true);
    setEditValues({ email: p.email || "", phone: p.phone || "", area: p.area || "" });
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditValues({ email: "", phone: "", area: "" });
  };

  const saveEditing = async () => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ email: editValues.email || null, phone: editValues.phone || null, area: editValues.area || null } as any)
        .eq("id", p.id);
      if (error) throw error;
      toast.success("Στοιχεία ενημερώθηκαν");
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      setIsEditing(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteUser = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-user", { body: { user_id: p.user_id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Ο χρήστης διαγράφηκε οριστικά");
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["all-roles"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className={`p-4 space-y-3 ${isPending ? "border-orange-500/30 bg-orange-500/5" : ""}`}>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${isPending ? "bg-orange-500/10" : "bg-muted"}`}>
            {role === "admin" ? (
              <Shield className="h-5 w-5 text-primary" />
            ) : isPending ? (
              <User className="h-5 w-5 text-orange-500" />
            ) : (
              <User className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground truncate">{p.full_name || "—"}</p>
              {role && (
                <Badge variant="outline" className={`shrink-0 text-[10px] ${role === "admin" ? "bg-primary/10 text-primary border-primary/20" : "bg-blue-500/10 text-blue-600 border-blue-500/20"}`}>
                  {role}
                </Badge>
              )}
            </div>
            {isPending && (
              <span className="text-[10px] text-orange-500 font-medium">Αναμονή έγκρισης</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 pl-[52px] sm:pl-0">
          <Select value={role || ""} onValueChange={(val) => handleSetRole(p.user_id, val)} disabled={assigning}>
            <SelectTrigger className="w-[120px] text-xs h-8">
              <SelectValue placeholder="Χωρίς ρόλο" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="technician">Technician</SelectItem>
            </SelectContent>
          </Select>

          {role && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveRole(p.user_id)} disabled={assigning}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Details row */}
      {isEditing ? (
        <div className="pl-[52px] space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input type="email" value={editValues.email} onChange={(e) => setEditValues({ ...editValues, email: e.target.value })} placeholder="Email" className="h-8 text-xs" />
            </div>
            <div className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input type="tel" value={editValues.phone} onChange={(e) => setEditValues({ ...editValues, phone: e.target.value })} placeholder="Κινητό" className="h-8 text-xs" />
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input value={editValues.area} onChange={(e) => setEditValues({ ...editValues, area: e.target.value })} placeholder="Περιοχή" className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={saveEditing}>
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
            {p.email && (
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{p.email}</span>
            )}
            {p.phone && (
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span>
            )}
            {p.area && (
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{p.area}</span>
            )}
            {!p.email && !p.phone && !p.area && (
              <span className="text-muted-foreground/50 italic">Χωρίς στοιχεία</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={startEditing}>
              <Pencil className="h-3 w-3" />
            </Button>

            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setResetOpen(true)} title="Reset κωδικού">
              <KeyRound className="h-3 w-3" />
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" disabled={deleting}>
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
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteUser}>
                    Διαγραφή
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      <ResetPasswordDialog open={resetOpen} onOpenChange={setResetOpen} userId={p.user_id} userName={p.full_name} />
    </Card>
  );
};

export default UserCard;
