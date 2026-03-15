import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Plus, Users, Power, PowerOff, Pencil, Trash2, Globe, LogOut, ChevronDown, Shield, User, UserPlus, Mail, MapPin, DollarSign, BarChart3, Activity, Megaphone, Eye, Bell, AlertTriangle, Clock, TrendingUp, Calendar, CreditCard, Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow, differenceInDays, subMonths, startOfMonth, endOfMonth, format } from "date-fns";
import { el } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const eurFormat = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR" });

const SuperAdminDashboard = () => {
  const queryClient = useQueryClient();
  const { signOut, user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<any>(null);
  const [form, setForm] = useState({ name: "", slug: "", plan: "basic", max_users: "10" });
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [createUserOrg, setCreateUserOrg] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({ email: "", password: "", full_name: "", role: "technician" });
  const [creatingUser, setCreatingUser] = useState(false);
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [priceValue, setPriceValue] = useState("");
  const [announcementForm, setAnnouncementForm] = useState({ title: "", body: "", target: "all", targetOrgId: "" });
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);
  const [trialAlertOpen, setTrialAlertOpen] = useState(false);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState("all");
  const [activityOrgFilter, setActivityOrgFilter] = useState("all");
  const [paymentAlertOpen, setPaymentAlertOpen] = useState(false);
  const [paymentForms, setPaymentForms] = useState<Record<string, { status: string; lastDate: string; nextDate: string; notes: string }>>({});


  // ── Queries ──
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

  const { data: allAssignments } = useQuery({
    queryKey: ["all-assignments-super"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("id, organization_id, created_at, sr_id, area")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allConstructions } = useQuery({
    queryKey: ["all-constructions-super"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("constructions")
        .select("id, organization_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: announcements, refetch: refetchAnnouncements } = useQuery({
    queryKey: ["announcements-super"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // ── Derived data ──
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

  const orgMap = useMemo(() => {
    const m: Record<string, any> = {};
    (organizations || []).forEach((o: any) => { m[o.id] = o; });
    return m;
  }, [organizations]);

  // Trial alerts
  const expiringTrials = useMemo(() => {
    return (organizations || []).filter((o: any) => {
      if (!o.trial_ends_at) return false;
      const days = differenceInDays(new Date(o.trial_ends_at), new Date());
      return days >= 0 && days <= 3;
    });
  }, [organizations]);

  // Payment alerts
  const paymentAlerts = useMemo(() => {
    const now = new Date();
    const soonDue = (organizations || []).filter((o: any) => {
      if (o.payment_status !== "paid" || !o.next_payment_due) return false;
      const days = differenceInDays(new Date(o.next_payment_due), now);
      return days >= 0 && days <= 5;
    });
    const overdue = (organizations || []).filter((o: any) => o.payment_status === "overdue");
    return { soonDue, overdue, total: soonDue.length + overdue.length };
  }, [organizations]);

  // Initialize payment form for an org
  const getPaymentForm = (org: any) => {
    if (paymentForms[org.id]) return paymentForms[org.id];
    return {
      status: org.payment_status || "paid",
      lastDate: org.last_payment_date || "",
      nextDate: org.next_payment_due || "",
      notes: org.payment_notes || "",
    };
  };

  const updatePaymentForm = (orgId: string, field: string, value: string) => {
    setPaymentForms((prev) => ({
      ...prev,
      [orgId]: { ...getPaymentForm(orgMap[orgId]), [field]: value },
    }));
  };

  // Revenue calculations
  const activeOrgs = (organizations || []).filter((o: any) => o.status === "active");
  const paidActiveOrgs = activeOrgs.filter((o: any) => o.plan !== "free");
  const mrr = paidActiveOrgs.reduce((sum: number, o: any) => sum + (Number(o.monthly_price) || 0), 0);
  const arr = mrr * 12;
  const payingOrgs = paidActiveOrgs.filter((o: any) => !o.trial_ends_at || new Date(o.trial_ends_at) < new Date());

  // Usage data
  const usageData = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    return (organizations || []).map((org: any) => {
      const orgAssignments = (allAssignments || []).filter((a: any) => a.organization_id === org.id);
      const monthAssignments = orgAssignments.filter((a: any) => new Date(a.created_at) >= monthStart);
      const orgConstructions = (allConstructions || []).filter((c: any) => c.organization_id === org.id);
      const orgUsers = (allProfiles || []).filter((p: any) => p.organization_id === org.id);
      const lastActivity = orgAssignments.length > 0 ? new Date(orgAssignments[0].created_at) : null;
      const daysSinceActivity = lastActivity ? differenceInDays(now, lastActivity) : 999;
      return {
        org,
        users: orgUsers.length,
        monthSR: monthAssignments.length,
        totalSR: orgAssignments.length,
        constructions: orgConstructions.length,
        lastActivity,
        daysSinceActivity,
      };
    });
  }, [organizations, allAssignments, allConstructions, allProfiles]);

  // Chart data: SR per org last 3 months
  const chartData = useMemo(() => {
    const now = new Date();
    const months = [subMonths(now, 2), subMonths(now, 1), now];
    return months.map((m) => {
      const ms = startOfMonth(m);
      const me = endOfMonth(m);
      const label = format(m, "MMM yyyy", { locale: el });
      const row: any = { month: label };
      (organizations || []).forEach((org: any) => {
        row[org.name] = (allAssignments || []).filter((a: any) =>
          a.organization_id === org.id &&
          new Date(a.created_at) >= ms &&
          new Date(a.created_at) <= me
        ).length;
      });
      return row;
    });
  }, [organizations, allAssignments]);

  const chartColors = ["hsl(var(--primary))", "hsl(var(--accent))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

  // Activity feed
  const activityFeed = useMemo(() => {
    const items: any[] = [];
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    (allAssignments || []).slice(0, 100).forEach((a: any) => {
      items.push({
        type: "sr",
        icon: "🟢",
        orgId: a.organization_id,
        orgName: orgMap[a.organization_id]?.name || "—",
        label: `Νέο SR · ${a.sr_id}`,
        detail: a.area,
        date: new Date(a.created_at),
      });
    });

    (allProfiles || []).forEach((p: any) => {
      if (p.organization_id) {
        items.push({
          type: "user",
          icon: "🔵",
          orgId: p.organization_id,
          orgName: orgMap[p.organization_id]?.name || "—",
          label: "Νέος χρήστης",
          detail: p.email || p.full_name,
          date: new Date(), // profiles don't have created_at in select
        });
      }
    });

    items.sort((a, b) => b.date.getTime() - a.date.getTime());

    let filtered = items;
    if (activityFilter === "today") {
      filtered = items.filter(i => i.date >= dayStart);
    } else if (activityFilter === "week") {
      filtered = items.filter(i => i.date >= weekAgo);
    }
    if (activityOrgFilter !== "all") {
      filtered = filtered.filter(i => i.orgId === activityOrgFilter);
    }

    return filtered.slice(0, 50);
  }, [allAssignments, allProfiles, orgMap, activityFilter, activityOrgFilter]);

  // Active/inactive org counts
  const activeToday = useMemo(() => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const activeOrgIds = new Set(
      (allAssignments || []).filter((a: any) => new Date(a.created_at) >= dayStart).map((a: any) => a.organization_id)
    );
    return activeOrgIds.size;
  }, [allAssignments]);

  const inactiveOrgs = useMemo(() => {
    return usageData.filter(u => u.daysSinceActivity > 14).length;
  }, [usageData]);

  // ── Handlers (existing) ──
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

  // ── New Handlers ──
  const handlePriceUpdate = async (orgId: string) => {
    const val = parseFloat(priceValue);
    if (isNaN(val)) return toast.error("Μη έγκυρη τιμή");
    const { error } = await supabase.from("organizations").update({ monthly_price: val } as any).eq("id", orgId);
    if (error) return toast.error(error.message);
    toast.success("Τιμή ενημερώθηκε");
    setEditingPrice(null);
    queryClient.invalidateQueries({ queryKey: ["all-organizations"] });
  };

  const handleSetTrial = async (orgId: string) => {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);
    const { error } = await supabase.from("organizations").update({ trial_ends_at: trialEnd.toISOString() } as any).eq("id", orgId);
    if (error) return toast.error(error.message);
    toast.success("Trial 14 ημερών ενεργοποιήθηκε");
    queryClient.invalidateQueries({ queryKey: ["all-organizations"] });
  };

  const handleImpersonate = async (orgId: string) => {
    setImpersonating(orgId);
    try {
      const { data, error } = await supabase.functions.invoke("impersonate-user", {
        body: { organization_id: orgId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.link) {
        window.open(data.link, "_blank");
        toast.success(`Άνοιξε νέο tab ως ${data.email}`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImpersonating(null);
    }
  };

  const handleSendAnnouncement = async () => {
    if (!announcementForm.title || !announcementForm.body) return toast.error("Συμπλήρωσε τίτλο και μήνυμα");
    setSendingAnnouncement(true);
    try {
      const target = announcementForm.target === "specific" ? announcementForm.targetOrgId : "all";
      if (announcementForm.target === "specific" && !announcementForm.targetOrgId) {
        return toast.error("Επίλεξε εταιρία");
      }

      const { error } = await supabase.from("announcements" as any).insert({
        title: announcementForm.title,
        body: announcementForm.body,
        created_by: user?.id,
        target,
      });
      if (error) throw error;

      // Send push to all admin users of target orgs
      const targetOrgs = target === "all"
        ? (organizations || [])
        : (organizations || []).filter((o: any) => o.id === target);

      const adminUsers = (allProfiles || []).filter((p: any) =>
        targetOrgs.some((o: any) => o.id === p.organization_id) &&
        roleMap[p.user_id] === "admin"
      );

      for (const adminUser of adminUsers) {
        try {
          await supabase.functions.invoke("send-push-notification", {
            body: {
              userId: adminUser.user_id,
              title: `📢 ${announcementForm.title}`,
              body: announcementForm.body,
            },
          });
        } catch { /* ignore push errors */ }
      }

      toast.success(`Ανακοίνωση στάλθηκε σε ${adminUsers.length} admins`);
      setAnnouncementForm({ title: "", body: "", target: "all", targetOrgId: "" });
      refetchAnnouncements();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSendingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    const { error } = await supabase.from("announcements" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Διαγράφηκε");
    refetchAnnouncements();
  };

  const handleRenewTrial = async (orgId: string) => {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);
    const { error } = await supabase.from("organizations").update({ trial_ends_at: trialEnd.toISOString() } as any).eq("id", orgId);
    if (error) return toast.error(error.message);
    toast.success("Trial ανανεώθηκε");
    queryClient.invalidateQueries({ queryKey: ["all-organizations"] });
  };

  const handleSuspendOrg = async (orgId: string) => {
    const { error } = await supabase.from("organizations").update({ status: "suspended" } as any).eq("id", orgId);
    if (error) return toast.error(error.message);
    toast.success("Εταιρία απενεργοποιήθηκε");
    queryClient.invalidateQueries({ queryKey: ["all-organizations"] });
  };

  const handleSavePayment = async (orgId: string) => {
    const pf = getPaymentForm(orgMap[orgId]);
    const today = new Date().toISOString().split("T")[0];
    
    const updateData: any = {
      payment_status: pf.status,
      payment_notes: pf.notes || null,
      last_payment_date: pf.lastDate || null,
      next_payment_due: pf.nextDate || null,
    };

    if (pf.status === "paid") {
      updateData.last_payment_date = today;
      const next = new Date();
      next.setDate(next.getDate() + 30);
      updateData.next_payment_due = next.toISOString().split("T")[0];
      updateData.status = "active";
    }

    if (pf.status === "suspended") {
      updateData.status = "suspended";
    }

    const { error } = await supabase.from("organizations").update(updateData).eq("id", orgId);
    if (error) return toast.error(error.message);

    if (pf.status === "paid") toast.success("✅ Εταιρία ενεργοποιήθηκε — πληρωμή καταχωρήθηκε");
    else if (pf.status === "suspended") toast.success("❌ Εταιρία ανεστάλη λόγω πληρωμής");
    else toast.success("Κατάσταση πληρωμής ενημερώθηκε");

    setPaymentForms((prev) => {
      const cp = { ...prev };
      delete cp[orgId];
      return cp;
    });
    queryClient.invalidateQueries({ queryKey: ["all-organizations"] });
  };

  const getTrialStatus = (org: any) => {

    if (!org.trial_ends_at) return { label: "✅ Πληρωμένο", color: "text-success" };
    const days = differenceInDays(new Date(org.trial_ends_at), new Date());
    if (days > 0) return { label: `🟡 Trial · ${days} μέρες`, color: "text-warning" };
    return { label: "🔴 Έληξε", color: "text-destructive" };
  };

  const planColors: Record<string, string> = {
    free: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400",
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
        <div className="flex items-center gap-2">
          {/* Payment alert bell */}
          {paymentAlerts.total > 0 && (
            <Dialog open={paymentAlertOpen} onOpenChange={setPaymentAlertOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-9 w-9">
                  <CreditCard className="h-4 w-4 text-destructive" />
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] text-white font-bold">
                    {paymentAlerts.total}
                  </span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-destructive" />
                    Ειδοποιήσεις Πληρωμών
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  {paymentAlerts.overdue.map((org: any) => (
                    <Card key={org.id} className="p-3 flex items-center justify-between border-destructive/30">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{org.name}</p>
                        <p className="text-xs text-destructive">🔴 Εκπρόθεσμη πληρωμή</p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { updatePaymentForm(org.id, "status", "paid"); handleSavePayment(org.id); }}>
                          ✅ Πληρώθηκε
                        </Button>
                        <Button size="sm" variant="destructive" className="text-xs h-7" onClick={() => { updatePaymentForm(org.id, "status", "suspended"); handleSavePayment(org.id); }}>
                          Suspend
                        </Button>
                      </div>
                    </Card>
                  ))}
                  {paymentAlerts.soonDue.map((org: any) => {
                    const days = differenceInDays(new Date(org.next_payment_due), new Date());
                    return (
                      <Card key={org.id} className="p-3 flex items-center justify-between border-warning/30">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{org.name}</p>
                          <p className="text-xs text-warning">⚠️ Πληρώνει σε {days} μέρ{days === 1 ? "α" : "ες"}</p>
                        </div>
                        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { updatePaymentForm(org.id, "status", "paid"); handleSavePayment(org.id); }}>
                          ✅ Πληρώθηκε
                        </Button>
                      </Card>
                    );
                  })}
                </div>
              </DialogContent>
            </Dialog>
          )}
          {/* Trial alert bell */}
          {expiringTrials.length > 0 && (
            <Dialog open={trialAlertOpen} onOpenChange={setTrialAlertOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-9 w-9">
                  <Bell className="h-4 w-4 text-warning" />
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] text-white font-bold">
                    {expiringTrials.length}
                  </span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-warning" />
                    Trials που λήγουν σύντομα
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  {expiringTrials.map((org: any) => {
                    const days = differenceInDays(new Date(org.trial_ends_at), new Date());
                    return (
                      <Card key={org.id} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{org.name}</p>
                          <p className="text-xs text-warning">{days === 0 ? "Λήγει σήμερα" : `Λήγει σε ${days} μέρ${days === 1 ? "α" : "ες"}`}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleRenewTrial(org.id)}>
                            Ανανέωση
                          </Button>
                          <Button size="sm" variant="destructive" className="text-xs h-7" onClick={() => handleSuspendOrg(org.id)}>
                            Suspend
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-2 text-muted-foreground">
            <LogOut className="h-4 w-4" /> Αποσύνδεση
          </Button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
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

        {/* Tabs */}
        <Tabs defaultValue="companies" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="companies" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> Εταιρίες</TabsTrigger>
            <TabsTrigger value="revenue" className="gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Revenue</TabsTrigger>
            <TabsTrigger value="usage" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Usage</TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Activity</TabsTrigger>
            <TabsTrigger value="announcements" className="gap-1.5"><Megaphone className="h-3.5 w-3.5" /> Announcements</TabsTrigger>
          </TabsList>

          {/* ═══════════════ ΕΤΑΙΡΙΕΣ TAB (existing) ═══════════════ */}
          <TabsContent value="companies" className="space-y-4">
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
                            <SelectItem value="free">🎁 Δωρεάν</SelectItem>
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
                          <SelectItem value="free">🎁 Δωρεάν</SelectItem>
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
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Login ως Admin"
                                disabled={impersonating === org.id}
                                onClick={() => handleImpersonate(org.id)}
                              >
                                <Eye className="h-3.5 w-3.5 text-primary" />
                              </Button>
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
                          {/* Payment Section */}
                          <div className="border-t border-border bg-muted/20 px-4 py-3">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                              <CreditCard className="h-3 w-3" /> Πληρωμή
                            </p>
                            {(() => {
                              const pf = getPaymentForm(org);
                              return (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <Label className="text-[11px]">Κατάσταση</Label>
                                      <Select value={pf.status} onValueChange={(v) => updatePaymentForm(org.id, "status", v)}>
                                        <SelectTrigger className="h-8 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="paid">✅ Πλήρωσε</SelectItem>
                                          <SelectItem value="overdue">⚠️ Εκπρόθεσμο</SelectItem>
                                          <SelectItem value="suspended">❌ Ανεστάλη</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[11px]">Σημειώσεις</Label>
                                      <Input
                                        className="h-8 text-xs"
                                        value={pf.notes}
                                        onChange={(e) => updatePaymentForm(org.id, "notes", e.target.value)}
                                        placeholder="π.χ. Τιμολόγιο #123"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <Label className="text-[11px]">Τελ. πληρωμή</Label>
                                      <Input
                                        type="date"
                                        className="h-8 text-xs"
                                        value={pf.lastDate}
                                        onChange={(e) => updatePaymentForm(org.id, "lastDate", e.target.value)}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[11px]">Επόμενη</Label>
                                      <Input
                                        type="date"
                                        className="h-8 text-xs"
                                        value={pf.nextDate}
                                        onChange={(e) => updatePaymentForm(org.id, "nextDate", e.target.value)}
                                      />
                                    </div>
                                  </div>
                                  <Button size="sm" className="gap-1.5 text-xs h-7" onClick={() => handleSavePayment(org.id)}>
                                    <Save className="h-3 w-3" /> Αποθήκευση
                                  </Button>
                                </div>
                              );
                            })()}
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
          </TabsContent>

          {/* ═══════════════ REVENUE TAB ═══════════════ */}
          <TabsContent value="revenue" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{eurFormat(mrr)}</p>
                  <p className="text-xs text-muted-foreground">MRR (Μηνιαίο)</p>
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{eurFormat(arr)}</p>
                  <p className="text-xs text-muted-foreground">ARR (Ετήσιο)</p>
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{payingOrgs.length} <span className="text-sm font-normal text-muted-foreground">/ {(organizations || []).length}</span></p>
                  <p className="text-xs text-muted-foreground">Πληρώνοντες Πελάτες</p>
                </div>
              </Card>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Εταιρία</TableHead>
                  <TableHead>Πλάνο</TableHead>
                  <TableHead>Τιμή/μήνα</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trial</TableHead>
                  <TableHead className="text-right">Ενέργειες</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(organizations || []).map((org: any) => {
                  const trial = getTrialStatus(org);
                  return (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={planColors[org.plan] || planColors.basic}>{org.plan}</Badge>
                      </TableCell>
                      <TableCell>
                        {editingPrice === org.id ? (
                          <Input
                            type="number"
                            className="w-24 h-7 text-xs"
                            value={priceValue}
                            autoFocus
                            onChange={(e) => setPriceValue(e.target.value)}
                            onBlur={() => handlePriceUpdate(org.id)}
                            onKeyDown={(e) => e.key === "Enter" && handlePriceUpdate(org.id)}
                          />
                        ) : (
                          <button
                            className="text-sm hover:text-primary transition-colors"
                            onClick={() => { setEditingPrice(org.id); setPriceValue(String(org.monthly_price || 600)); }}
                          >
                            {eurFormat(Number(org.monthly_price) || 600)} <Pencil className="inline h-3 w-3 ml-1 text-muted-foreground" />
                          </button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={org.status === "active" ? "default" : "destructive"} className="text-[10px]">
                          {org.status === "active" ? "Ενεργή" : "Ανενεργή"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs ${trial.color}`}>{trial.label}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleSetTrial(org.id)}>
                          ➕ Trial 14d
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TabsContent>

          {/* ═══════════════ USAGE TAB ═══════════════ */}
          <TabsContent value="usage" className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Εταιρία</TableHead>
                  <TableHead>Χρήστες</TableHead>
                  <TableHead>SR μήνα</TableHead>
                  <TableHead>SR σύνολο</TableHead>
                  <TableHead>Κατ/σκευές</TableHead>
                  <TableHead>Τελ. δραστ.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usageData.map((u) => {
                  const rowColor = u.daysSinceActivity <= 7
                    ? ""
                    : u.daysSinceActivity <= 14
                    ? "bg-warning/5"
                    : "bg-destructive/5";
                  return (
                    <TableRow key={u.org.id} className={rowColor}>
                      <TableCell className="font-medium">{u.org.name}</TableCell>
                      <TableCell>{u.users}</TableCell>
                      <TableCell>{u.monthSR}</TableCell>
                      <TableCell>{u.totalSR}</TableCell>
                      <TableCell>{u.constructions}</TableCell>
                      <TableCell>
                        {u.lastActivity ? (
                          <span className={`text-xs ${
                            u.daysSinceActivity > 14 ? "text-destructive font-semibold" :
                            u.daysSinceActivity > 7 ? "text-warning" : "text-success"
                          }`}>
                            {u.daysSinceActivity > 14 ? "🔴 " : ""}
                            {formatDistanceToNow(u.lastActivity, { addSuffix: true, locale: el })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Chart */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">SR ανά εταιρία (τελευταίοι 3 μήνες)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  {(organizations || []).map((org: any, i: number) => (
                    <Bar key={org.id} dataKey={org.name} fill={chartColors[i % chartColors.length]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          {/* ═══════════════ ACTIVITY TAB ═══════════════ */}
          <TabsContent value="activity" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{activeToday}</p>
                  <p className="text-xs text-muted-foreground">Ενεργές σήμερα</p>
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{inactiveOrgs}</p>
                  <p className="text-xs text-muted-foreground">Ανενεργές 14+ μέρες</p>
                </div>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {["all", "today", "week"].map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={activityFilter === f ? "default" : "outline"}
                  className="text-xs h-7"
                  onClick={() => setActivityFilter(f)}
                >
                  {f === "all" ? "Όλες" : f === "today" ? "Σήμερα" : "Εβδομάδα"}
                </Button>
              ))}
              <Select value={activityOrgFilter} onValueChange={setActivityOrgFilter}>
                <SelectTrigger className="w-48 h-7 text-xs">
                  <SelectValue placeholder="Όλες οι εταιρίες" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλες οι εταιρίες</SelectItem>
                  {(organizations || []).map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Feed */}
            <Card className="divide-y divide-border">
              {activityFeed.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Δεν υπάρχει δραστηριότητα</div>
              ) : (
                activityFeed.map((item, i) => (
                  <div key={i} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">{item.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground">
                          <span className="font-semibold">{item.orgName}</span>
                          <span className="text-muted-foreground"> · </span>
                          {item.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.detail} · {formatDistanceToNow(item.date, { addSuffix: true, locale: el })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </TabsContent>

          {/* ═══════════════ ANNOUNCEMENTS TAB ═══════════════ */}
          <TabsContent value="announcements" className="space-y-4">
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-primary" /> Νέα Ανακοίνωση
              </h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Τίτλος</Label>
                  <Input
                    value={announcementForm.title}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                    placeholder="Τίτλος ανακοίνωσης..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Μήνυμα</Label>
                  <Textarea
                    value={announcementForm.body}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, body: e.target.value })}
                    placeholder="Γράψε το μήνυμα..."
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Αποδέκτες</Label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="target"
                        checked={announcementForm.target === "all"}
                        onChange={() => setAnnouncementForm({ ...announcementForm, target: "all" })}
                        className="accent-primary"
                      />
                      Όλες οι εταιρίες
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="target"
                        checked={announcementForm.target === "specific"}
                        onChange={() => setAnnouncementForm({ ...announcementForm, target: "specific" })}
                        className="accent-primary"
                      />
                      Συγκεκριμένη
                    </label>
                    {announcementForm.target === "specific" && (
                      <Select value={announcementForm.targetOrgId} onValueChange={(v) => setAnnouncementForm({ ...announcementForm, targetOrgId: v })}>
                        <SelectTrigger className="w-48 h-8 text-xs">
                          <SelectValue placeholder="Επιλογή..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(organizations || []).map((o: any) => (
                            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                <Button
                  className="cosmote-gradient text-white border-0 gap-2"
                  onClick={handleSendAnnouncement}
                  disabled={sendingAnnouncement || !announcementForm.title || !announcementForm.body}
                >
                  <Megaphone className="h-4 w-4" />
                  {sendingAnnouncement ? "Αποστολή..." : "Αποστολή σε όλους"}
                </Button>
              </div>
            </Card>

            {/* History */}
            <h3 className="text-sm font-semibold text-foreground">Ιστορικό Ανακοινώσεων</h3>
            {(announcements || []).length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">Δεν υπάρχουν ανακοινώσεις</Card>
            ) : (
              <div className="space-y-2">
                {(announcements || []).map((a: any) => (
                  <Card key={a.id} className="p-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {a.target === "all" ? "Όλες" : orgMap[a.target]?.name || a.target}
                        {" · "}
                        {a.created_at ? formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: el }) : "—"}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteAnnouncement(a.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
