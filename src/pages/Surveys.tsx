import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import StatCard from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, Cell, PieChart, Pie } from "recharts";
import {
  Eye, Calendar, MapPin, User, MessageSquare, FileImage, Image, FileText,
  Download, CheckCircle, AlertTriangle, Clock, Mail, Send, Settings, XCircle,
  CalendarPlus, Bell, Search, Filter, ClipboardCheck, FileCheck, FileWarning, ShieldAlert, Trash2
} from "lucide-react";

const fileTypeLabels: Record<string, string> = {
  building_photo: "Φωτογραφία Κτιρίου",
  screenshot: "Screenshot (ΧΕΜΔ/AutoCAD)",
  inspection_form: "Έντυπο Αυτοψίας",
};

const fileTypeIcons: Record<string, typeof FileImage> = {
  building_photo: Image,
  screenshot: FileImage,
  inspection_form: FileText,
};

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle; chartColor: string }> = {
  submitted: { label: "Υποβλήθηκε", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Clock, chartColor: "hsl(220 70% 55%)" },
  "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ": { label: "Προδέσμευση Υλικών", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: CheckCircle, chartColor: "hsl(152 60% 42%)" },
  "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ": { label: "Ελλιπής Αυτοψία", color: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: AlertTriangle, chartColor: "hsl(38 92% 50%)" },
  "ΑΠΑΙΤΕΙΤΑΙ ΕΝΕΡΓΕΙΑ": { label: "Απαιτείται Ενέργεια", color: "bg-orange-600/10 text-orange-700 border-orange-600/20", icon: Mail, chartColor: "hsl(25 95% 53%)" },
  BLOCKER: { label: "Blocker", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: XCircle, chartColor: "hsl(0 72% 51%)" },
  "ΡΑΝΤΕΒΟΥ": { label: "Ραντεβού", color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: CalendarPlus, chartColor: "hsl(270 60% 55%)" },
};

const Surveys = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedSurvey, setSelectedSurvey] = useState<any>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: surveys, isLoading } = useQuery({
    queryKey: ["admin-surveys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("surveys")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: surveyFiles } = useQuery({
    queryKey: ["survey-files", selectedSurvey?.id],
    queryFn: async () => {
      if (!selectedSurvey) return [];
      const { data, error } = await supabase
        .from("survey_files")
        .select("*")
        .eq("survey_id", selectedSurvey.id);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSurvey,
  });

  const { data: profiles } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data;
    },
  });


  const { data: appointments } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .order("appointment_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const profileMap = useMemo(() => {
    return (profiles || []).reduce((acc: Record<string, any>, p) => {
      acc[p.user_id] = p;
      return acc;
    }, {});
  }, [profiles]);

  const getFileUrl = (path: string) => {
    const { data } = supabase.storage.from("surveys").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleStatusChange = async (surveyId: string, newStatus: string) => {
    const { error } = await supabase
      .from("surveys")
      .update({ status: newStatus })
      .eq("id", surveyId);
    if (error) {
      toast.error("Σφάλμα αλλαγής κατάστασης");
      return;
    }
    toast.success(`Κατάσταση → ${statusConfig[newStatus]?.label || newStatus}`);
    if (selectedSurvey?.id === surveyId) {
      setSelectedSurvey({ ...selectedSurvey, status: newStatus });
    }
    queryClient.invalidateQueries({ queryKey: ["admin-surveys"] });
  };

  const handleSendReport = async (surveyId: string, statusType: string) => {
    setSendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-survey-report", {
        body: { survey_id: surveyId, status_type: statusType },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Αναφορά ${statusType} εστάλη!`);
      if (selectedSurvey?.id === surveyId) {
        setSelectedSurvey({ ...selectedSurvey, status: statusType, email_sent: true });
      }
      queryClient.invalidateQueries({ queryKey: ["admin-surveys"] });
    } catch (err: any) {
      toast.error("Σφάλμα αποστολής: " + (err.message || "Δοκιμάστε ξανά"));
    } finally {
      setSendingEmail(false);
    }
  };

  const handleCreateAppointment = async (survey: any) => {
    const comment = survey.comments || "";
    const regex = /(\d{1,2})\/(\d{1,2}).*?(\d{1,2}):(\d{2})/;
    const match = comment.match(regex);
    if (!match) {
      toast.error("Δεν βρέθηκε ημερομηνία/ώρα στα σχόλια (π.χ. 15/3 10:00)");
      return;
    }
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const hour = parseInt(match[3], 10);
    const minute = parseInt(match[4], 10);
    const year = new Date().getFullYear();
    const appointmentAt = new Date(year, month, day, hour, minute);
    if (isNaN(appointmentAt.getTime())) {
      toast.error("Μη έγκυρη ημερομηνία");
      return;
    }
    const { error } = await supabase.from("appointments").insert({
      survey_id: survey.id,
      sr_id: survey.sr_id,
      area: survey.area,
      appointment_at: appointmentAt.toISOString(),
      description: comment,
    });
    if (error) {
      toast.error("Σφάλμα δημιουργίας ραντεβού");
      return;
    }
    await handleStatusChange(survey.id, "ΡΑΝΤΕΒΟΥ");
    toast.success(`Ραντεβού: ${appointmentAt.toLocaleDateString("el-GR")} ${appointmentAt.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}`);
    queryClient.invalidateQueries({ queryKey: ["appointments"] });
  };


  const handleSendReminder = async (survey: any) => {
    setSendingReminder(true);
    try {
      const techName = profileMap[survey.technician_id]?.full_name || "Τεχνικός";
      const hoursAgo = Math.round(
        (Date.now() - new Date(survey.created_at).getTime()) / (1000 * 60 * 60)
      );
      const { error } = await supabase.from("notifications").insert({
        user_id: survey.technician_id,
        title: "Υπενθύμιση: Ελλιπής Αυτοψία",
        message: `Η αυτοψία ${survey.sr_id} (${survey.area}) είναι ελλιπής εδώ και ${hoursAgo} ώρες. Παρακαλώ ανεβάστε τα αρχεία που λείπουν.`,
        data: { survey_id: survey.id, sr_id: survey.sr_id, area: survey.area, type: "reminder" },
      });
      if (error) throw error;
      toast.success(`Υπενθύμιση στάλθηκε στον ${techName}`);
    } catch (err: any) {
      toast.error("Σφάλμα: " + (err.message || "Δοκιμάστε ξανά"));
    } finally {
      setSendingReminder(false);
    }
  };

  const handleDeleteSurvey = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Delete survey files first
      await supabase.from("survey_files").delete().eq("survey_id", deleteTarget.id);
      const { error } = await supabase.from("surveys").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success(`Η αυτοψία ${deleteTarget.sr_id} διαγράφηκε`);
      queryClient.invalidateQueries({ queryKey: ["admin-surveys"] });
      setDeleteTarget(null);
      if (selectedSurvey?.id === deleteTarget.id) setSelectedSurvey(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  // Filtering
  const filtered = useMemo(() => {
    return (surveys || []).filter((s) => {
      const matchesSearch = s.sr_id.toLowerCase().includes(search.toLowerCase());
      const matchesArea = areaFilter === "all" || s.area === areaFilter;
      const matchesStatus = statusFilter === "all" || s.status === statusFilter;
      return matchesSearch && matchesArea && matchesStatus;
    });
  }, [surveys, search, areaFilter, statusFilter]);

  const groupedFiles = useMemo(() => {
    return (surveyFiles || []).reduce((acc: Record<string, any[]>, f) => {
      if (!acc[f.file_type]) acc[f.file_type] = [];
      acc[f.file_type].push(f);
      return acc;
    }, {});
  }, [surveyFiles]);

  // Stats
  const totalSurveys = (surveys || []).length;
  const totalComplete = (surveys || []).filter((s) => s.status === "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ").length;
  const totalIncomplete = (surveys || []).filter((s) => s.status === "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ").length;
  const totalBlockers = (surveys || []).filter((s) => s.status === "BLOCKER" || s.status === "ΑΠΑΙΤΕΙΤΑΙ ΕΝΕΡΓΕΙΑ").length;
  const totalAppointments = (surveys || []).filter((s) => s.status === "ΡΑΝΤΕΒΟΥ").length;

  // Status distribution chart
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (surveys || []).forEach(s => {
      counts[s.status] = (counts[s.status] || 0) + 1;
    });
    return Object.entries(counts).map(([status, count]) => ({
      status,
      label: statusConfig[status]?.label || status,
      count,
      fill: statusConfig[status]?.chartColor || "hsl(220 10% 46%)",
    }));
  }, [surveys]);

  // Area distribution chart
  const areaCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (surveys || []).forEach(s => {
      counts[s.area] = (counts[s.area] || 0) + 1;
    });
    return Object.entries(counts).map(([area, count]) => ({
      area,
      count,
      fill: area === "ΡΟΔΟΣ" ? "hsl(220 70% 55%)" : "hsl(152 60% 42%)",
    }));
  }, [surveys]);

  const chartConfig = statusCounts.reduce((acc, s) => {
    acc[s.status] = { label: s.label, color: s.fill };
    return acc;
  }, {} as Record<string, { label: string; color: string }>);

  const areaChartConfig = areaCounts.reduce((acc, a) => {
    acc[a.area] = { label: a.area, color: a.fill };
    return acc;
  }, {} as Record<string, { label: string; color: string }>);

  // Upcoming appointments
  const upcomingAppointments = (appointments || []).filter(
    (a) => new Date(a.appointment_at) >= new Date()
  );

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px]">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Αυτοψίες Τεχνικών</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Προβολή, διαχείριση & αναφορές αυτοψιών
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setToEmails(emailSettings?.report_to_emails || "");
              setCcEmails(emailSettings?.report_cc_emails || "");
              setShowSettings(true);
            }}
          >
            <Settings className="h-4 w-4" />
            Ρυθμίσεις Email
          </Button>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard title="Σύνολο Αυτοψιών" value={totalSurveys} subtitle={`${filtered.length} εμφανίζονται`} icon={ClipboardCheck} />
          <StatCard title="Ολοκληρωμένες" value={totalComplete} subtitle={`${totalSurveys > 0 ? Math.round((totalComplete / totalSurveys) * 100) : 0}% επιτυχία`} icon={FileCheck} trend="up" trendValue={`${totalComplete} πλήρεις`} />
          <StatCard title="Ελλιπείς" value={totalIncomplete} subtitle="αναμονή αρχείων" icon={FileWarning} accent />
          <StatCard title="Blockers" value={totalBlockers} subtitle="απαιτούν ενέργεια" icon={ShieldAlert} />
          <StatCard title="Ραντεβού" value={totalAppointments} subtitle={`${upcomingAppointments.length} επερχόμενα`} icon={CalendarPlus} />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Status Distribution */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              Κατανομή Κατάστασης
            </h2>
            {statusCounts.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <BarChart data={statusCounts} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                  <XAxis dataKey="label" tick={{ fill: "hsl(220 10% 46%)", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fill: "hsl(220 10% 46%)", fontSize: 11 }} axisLine={false} tickLine={false} width={25} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={32}>
                    {statusCounts.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Δεν υπάρχουν δεδομένα</div>
            )}
          </div>

          {/* Area Distribution */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
              <MapPin className="h-4 w-4 text-accent" />
              Ανά Περιοχή
            </h2>
            {areaCounts.length > 0 ? (
              <>
                <ChartContainer config={areaChartConfig} className="h-[160px] w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie
                      data={areaCounts}
                      dataKey="count"
                      nameKey="area"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      strokeWidth={2}
                      stroke="hsl(0 0% 100%)"
                    >
                      {areaCounts.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex justify-center gap-6 mt-2">
                  {areaCounts.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                      <span className="text-muted-foreground">{item.area}</span>
                      <span className="font-bold text-foreground">{item.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Δεν υπάρχουν δεδομένα</div>
            )}
          </div>
        </div>

        {/* Upcoming appointments */}
        {upcomingAppointments.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
              <CalendarPlus className="h-4 w-4 text-purple-600" />
              Επερχόμενα Ραντεβού ({upcomingAppointments.length})
            </h3>
            <div className="space-y-2">
              {upcomingAppointments.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center gap-3 text-sm rounded-lg px-3 py-2.5 bg-muted/50 hover:bg-muted transition-colors">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-bold text-foreground text-xs">
                    {new Date(a.appointment_at).toLocaleDateString("el-GR")}{" "}
                    {new Date(a.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="font-bold text-xs text-foreground">SR {a.sr_id}</span>
                  <Badge variant="outline" className="text-xs">{a.area}</Badge>
                  {a.description && (
                    <span className="text-xs text-muted-foreground truncate flex-1">{a.description}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Αναζήτηση SR ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Περιοχή" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Όλες</SelectItem>
              <SelectItem value="ΡΟΔΟΣ">ΡΟΔΟΣ</SelectItem>
              <SelectItem value="ΚΩΣ">ΚΩΣ</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Κατάσταση" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Όλες οι καταστάσεις</SelectItem>
              <SelectItem value="ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ">Προδέσμευση Υλικών</SelectItem>
              <SelectItem value="ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ">Ελλιπής Αυτοψία</SelectItem>
              <SelectItem value="ΑΠΑΙΤΕΙΤΑΙ ΕΝΕΡΓΕΙΑ">Απαιτείται Ενέργεια</SelectItem>
              <SelectItem value="BLOCKER">Blocker</SelectItem>
              <SelectItem value="ΡΑΝΤΕΒΟΥ">Ραντεβού</SelectItem>
              <SelectItem value="submitted">Υποβλήθηκε</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground font-bold self-center bg-muted px-2.5 py-1.5 rounded-full">
            {filtered.length} / {totalSurveys}
          </span>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Δεν βρέθηκαν αυτοψίες</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">SR ID</th>
                    <th className="text-left px-4 py-3 font-medium">Περιοχή</th>
                    <th className="text-left px-4 py-3 font-medium">Τεχνικός</th>
                    <th className="text-left px-4 py-3 font-medium">Κατάσταση</th>
                    <th className="text-left px-4 py-3 font-medium">Σχόλια</th>
                    <th className="text-left px-4 py-3 font-medium">Ημερομηνία</th>
                    <th className="text-center px-4 py-3 font-medium">Email</th>
                    <th className="text-center px-4 py-3 font-medium">Ενέργεια</th>
                    <th className="text-center px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const tech = profileMap[s.technician_id];
                    const sc = statusConfig[s.status] || statusConfig["submitted"];
                    return (
                      <tr
                        key={s.id}
                        className="border-t border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => setSelectedSurvey(s)}
                      >
                        <td className="px-4 py-3 font-bold text-primary">{s.sr_id}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs">{s.area}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{tech?.full_name || "—"}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${sc.color}`}>{sc.label}</Badge>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          {s.comments ? (
                            <span className="text-xs text-muted-foreground line-clamp-1">{s.comments}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs font-bold">
                          {new Date(s.created_at).toLocaleDateString("el-GR")}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {s.email_sent ? (
                            <Mail className="h-3.5 w-3.5 text-green-600 mx-auto" />
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => setSelectedSurvey(s)}
                          >
                            <Eye className="h-4 w-4 text-primary" />
                          </Button>
                        </td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setDeleteTarget(s)}
                            className="text-muted-foreground/40 hover:text-destructive transition-colors p-1 rounded"
                            title="Διαγραφή"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Survey Detail Modal */}
      <Dialog open={!!selectedSurvey} onOpenChange={() => setSelectedSurvey(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedSurvey && (() => {
            const sc = statusConfig[selectedSurvey.status] || statusConfig["submitted"];
            const StatusIcon = sc.icon;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    Αυτοψία SR {selectedSurvey.sr_id}
                    <Badge variant="outline" className={`ml-2 text-xs ${sc.color}`}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {sc.label}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 mt-2">
                  {/* Status Actions */}
                  <Card className="p-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Αλλαγή Κατάστασης</p>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm" variant="outline" className="gap-1.5 text-xs"
                        disabled={selectedSurvey.status === "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ"}
                        onClick={() => handleStatusChange(selectedSurvey.id, "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ")}
                      >
                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                        Προδέσμευση
                      </Button>
                      <Button
                        size="sm" variant="outline" className="gap-1.5 text-xs"
                        disabled={selectedSurvey.status === "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ"}
                        onClick={() => handleStatusChange(selectedSurvey.id, "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ")}
                      >
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                        Ελλιπής
                      </Button>
                    </div>

                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">Ενέργειες</p>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm" variant="outline" className="gap-1.5 text-xs border-orange-500/30"
                        disabled={sendingEmail}
                        onClick={() => handleSendReport(selectedSurvey.id, "ΑΠΑΙΤΕΙΤΑΙ ΕΝΕΡΓΕΙΑ")}
                      >
                        <Send className="h-3.5 w-3.5 text-orange-600" />
                        {sendingEmail ? "Αποστολή..." : "Απαιτείται Ενέργεια"}
                      </Button>
                      <Button
                        size="sm" variant="outline" className="gap-1.5 text-xs border-red-500/30"
                        disabled={sendingEmail}
                        onClick={() => handleSendReport(selectedSurvey.id, "BLOCKER")}
                      >
                        <XCircle className="h-3.5 w-3.5 text-red-600" />
                        {sendingEmail ? "Αποστολή..." : "Blocker"}
                      </Button>
                      <Button
                        size="sm" variant="outline" className="gap-1.5 text-xs border-purple-500/30"
                        onClick={() => handleCreateAppointment(selectedSurvey)}
                      >
                        <CalendarPlus className="h-3.5 w-3.5 text-purple-600" />
                        Ραντεβού
                      </Button>
                      {selectedSurvey.status === "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ" && (
                        <Button
                          size="sm" variant="outline" className="gap-1.5 text-xs border-amber-500/30"
                          disabled={sendingReminder}
                          onClick={() => handleSendReminder(selectedSurvey)}
                        >
                          <Bell className="h-3.5 w-3.5 text-amber-600" />
                          {sendingReminder ? "Αποστολή..." : "Υπενθύμιση Τεχνικού"}
                        </Button>
                      )}
                    </div>
                    {selectedSurvey.email_sent && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <Mail className="h-3 w-3" /> Αναφορά εστάλη
                      </p>
                    )}
                  </Card>

                  {/* Info */}
                  <Card className="p-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span>{selectedSurvey.area}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4 shrink-0" />
                        <span>{new Date(selectedSurvey.created_at).toLocaleString("el-GR")}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User className="h-4 w-4 shrink-0" />
                        <span>{profileMap[selectedSurvey.technician_id]?.full_name || "—"}</span>
                      </div>
                    </div>
                  </Card>

                  {/* Comments */}
                  {selectedSurvey.comments && (
                    <Card className="p-4">
                      <div className="flex items-start gap-2 text-sm">
                        <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-foreground">{selectedSurvey.comments}</p>
                      </div>
                    </Card>
                  )}

                  {/* Files */}
                  {Object.entries(groupedFiles).map(([type, files]) => {
                    const Icon = fileTypeIcons[type] || FileImage;
                    return (
                      <div key={type} className="space-y-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5" />
                          {fileTypeLabels[type] || type} ({files.length})
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                          {files.map((f: any) => (
                            <a key={f.id} href={getFileUrl(f.file_path)} target="_blank" rel="noopener noreferrer" className="group relative block">
                              <img src={getFileUrl(f.file_path)} alt={f.file_name} className="h-28 w-full object-cover rounded-lg border border-border group-hover:border-primary transition-colors" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-lg flex items-center justify-center transition-colors">
                                <Download className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-1 truncate">{f.file_name}</p>
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {Object.keys(groupedFiles).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Δεν βρέθηκαν αρχεία</p>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Email Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ρυθμίσεις Email Αναφορών</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-xs">Παραλήπτες (To)</Label>
              <Input
                value={toEmails}
                onChange={(e) => setToEmails(e.target.value)}
                placeholder="email1@example.com, email2@example.com"
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">Χωρίστε πολλαπλά emails με κόμμα</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Κοινοποίηση (CC)</Label>
              <Input
                value={ccEmails}
                onChange={(e) => setCcEmails(e.target.value)}
                placeholder="cc@example.com"
                className="text-sm"
              />
            </div>
            <Button onClick={handleSaveSettings} className="w-full">
              Αποθήκευση
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή Αυτοψίας</AlertDialogTitle>
            <AlertDialogDescription>
              Είστε σίγουροι ότι θέλετε να διαγράψετε την αυτοψία <strong className="text-foreground">{deleteTarget?.sr_id}</strong>; Θα διαγραφούν και τα αρχεία της.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Ακύρωση</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSurvey}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Διαγραφή..." : "Διαγραφή"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Surveys;
