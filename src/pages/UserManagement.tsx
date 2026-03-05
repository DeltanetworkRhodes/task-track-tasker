import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, User, UserCog, Trash2 } from "lucide-react";

const UserManagement = () => {
  const queryClient = useQueryClient();
  const [assigning, setAssigning] = useState<string | null>(null);

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
        const { error } = await supabase
          .from("user_roles")
          .update({ role: role as any })
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: role as any });
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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <UserCog className="h-6 w-6" />
            Διαχείριση Χρηστών
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Εκχώρηση ρόλων admin / technician
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : (profiles || []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">Δεν βρέθηκαν χρήστες</p>
        ) : (
          <div className="space-y-3">
            {(profiles || []).map((p) => {
              const role = roleMap[p.user_id];
              return (
                <Card key={p.id} className="p-4 flex items-center justify-between gap-4">
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
                      <p className="text-xs text-muted-foreground truncate">{p.user_id}</p>
                      {p.area && <p className="text-xs text-muted-foreground">Περιοχή: {p.area}</p>}
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
