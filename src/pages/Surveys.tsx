import { useState, useMemo } from "react";
import { useAssignments } from "@/hooks/useData";
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
  CalendarPlus, Bell, Search, Filter, ClipboardCheck, FileCheck, FileWarning, ShieldAlert, Trash2,
  RefreshCw, Loader2
} from "lucide-react";

const fileTypeLabels: Record<string, string> = {
  building_photo: "Φωτογραφία Κτιρίου",
  screenshot: "Screenshot (ΧΕΜΔ/AutoCAD)",
};

const fileTypeIcons: Record<string, typeof FileImage> = {
  building_photo: Image,
  screenshot: FileImage,
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
  const [reprocessing, setReprocessing] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);

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
      // Generate signed URLs for each file
      const filesWithUrls = await Promise.all(
        (data || []).map(async (f: any) => {
          const { data: signedData } = await supabase.storage
            .from("surveys")
            .createSignedUrl(f.file_path, 3600); // 1 hour
          return { ...f, signedUrl: signedData?.signedUrl || "" };
        })
      );
      return filesWithUrls;
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

  const { data: dbAssignments } = useAssignments();
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

  // Signed URLs are now generated in the surveyFiles query

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
  const totalEmailsSent = (surveys || []).filter((s) => s.email_sent).length;
  const totalSubmitted = (surveys || []).filter((s) => s.status === "submitted").length;
  const totalActionRequired = (surveys || []).filter((s) => s.status === "ΑΠΑΙΤΕΙΤΑΙ ΕΝΕΡΓΕΙΑ").length;

  // Assignment stats
  const preCommittedCount = (dbAssignments || []).filter((a) => a.status === "pre_committed").length;
  const inspectionCount = (dbAssignments || []).filter((a) => a.status === "inspection").length;
  const totalActiveAssignments = (dbAssignments || []).filter((a) => a.status !== "cancelled" && a.status !== "completed").length;
  const incompleteSurveyAssignments = (dbAssignments || []).filter((a) => a.status === "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ" || a.status === "incomplete_survey").length;

  // Status distribution chart — combines surveys + assignment statuses
  const assignmentStatusLabels: Record<string, string> = {
    pre_committed: "Προδέσμευση",
    waiting_ote: "Αναμονή ΟΤΕ",
    inspection: "Αυτοψία",
    construction: "Κατασκευή",
    pending: "Εκκρεμεί",
  };
  const assignmentStatusColors: Record<string, string> = {
    pre_committed: "hsl(152 60% 42%)",
    waiting_ote: "hsl(38 92% 50%)",
    inspection: "hsl(220 70% 55%)",
    construction: "hsl(270 60% 55%)",
    pending: "hsl(220 10% 46%)",
  };

  const statusCounts = useMemo(() => {
    // Survey statuses
    const counts: Record<string, { label: string; count: number; fill: string }> = {};
    (surveys || []).forEach(s => {
      if (!counts[s.status]) {
        counts[s.status] = {
          label: statusConfig[s.status]?.label || s.status,
          count: 0,
          fill: statusConfig[s.status]?.chartColor || "hsl(220 10% 46%)",
        };
      }
      counts[s.status].count++;
    });
    // Assignment statuses (active only)
    (dbAssignments || []).filter(a => a.status !== "cancelled" && a.status !== "completed").forEach(a => {
      const key = `assign_${a.status}`;
      if (!counts[key]) {
        counts[key] = {
          label: assignmentStatusLabels[a.status] || a.status,
          count: 0,
          fill: assignmentStatusColors[a.status] || "hsl(200 10% 60%)",
        };
      }
      counts[key].count++;
    });
    return Object.entries(counts).map(([status, data]) => ({
      status,
      label: data.label,
      count: data.count,
      fill: data.fill,
    }));
  }, [surveys, dbAssignments]);

  // Area distribution chart — combines surveys + assignments
  const areaCounts = useMemo(() => {
    const counts: Record<string, { surveys: number; assignments: number }> = {};
    (surveys || []).forEach(s => {
      if (!counts[s.area]) counts[s.area] = { surveys: 0, assignments: 0 };
      counts[s.area].surveys++;
    });
    (dbAssignments || []).filter(a => a.status !== "cancelled" && a.status !== "completed").forEach(a => {
      if (!counts[a.area]) counts[a.area] = { surveys: 0, assignments: 0 };
      counts[a.area].assignments++;
    });
    const palette = ["hsl(220 70% 55%)", "hsl(152 60% 42%)", "hsl(38 92% 50%)", "hsl(270 60% 55%)", "hsl(0 72% 51%)", "hsl(200 70% 50%)"];
    return Object.entries(counts).map(([area, data], i) => ({
      area,
      count: data.surveys + data.assignments,
      surveys: data.surveys,
      assignments: data.assignments,
      fill: palette[i % palette.length],
    }));
  }, [surveys, dbAssignments]);

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
      <div className="space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Αυτοψίες Τεχνικών</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Προβολή, διαχείριση & αναφορές αυτοψιών
            </p>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-4">
          <StatCard 
            title="Σύνολο Αυτοψιών" 
            value={totalSurveys} 
            subtitle={`${totalSubmitted} νέες · ${filtered.length} εμφανίζονται`} 
            icon={ClipboardCheck} 
          />
          <StatCard 
            title="Προδέσμευση Υλικών" 
            value={totalComplete} 
            subtitle={`${totalSurveys > 0 ? Math.round((totalComplete / totalSurveys) * 100) : 0}% του συνόλου`} 
            icon={FileCheck} 
            trend="up" 
            trendValue={`${totalComplete} ολοκληρωμένες`} 
          />
          <StatCard 
            title="Ελλιπείς Αυτοψίες" 
            value={totalIncomplete} 
            subtitle="αναμονή αρχείων/στοιχείων" 
            icon={FileWarning} 
            accent 
            trend={totalIncomplete > 0 ? "down" : "neutral"}
            trendValue={totalIncomplete > 0 ? `${totalIncomplete} εκκρεμούν` : "Καμία εκκρεμότητα"}
          />
          <StatCard 
            title="Blockers / Ενέργειες" 
            value={totalBlockers} 
            subtitle={`${totalActionRequired} απαιτούν ενέργεια`} 
            icon={ShieldAlert} 
            trend={totalBlockers > 0 ? "down" : "neutral"}
            trendValue={totalBlockers > 0 ? "Χρειάζεται προσοχή" : "Όλα εντάξει"}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-4">
          <StatCard 
            title="Προδεσμεύσεις (SR)" 
            value={preCommittedCount} 
            subtitle={`${inspectionCount} σε αυτοψία`} 
            icon={CheckCircle} 
            trend={preCommittedCount > 0 ? "up" : "neutral"}
            trendValue={`${totalActiveAssignments} ενεργές αναθέσεις`}
          />
          <StatCard 
            title="Email Σταλμένα" 
            value={totalEmailsSent} 
            subtitle={`${totalSurveys - totalEmailsSent} δεν έχουν σταλεί`} 
            icon={Mail} 
            trend={totalEmailsSent > 0 ? "up" : "neutral"}
            trendValue={`${totalSurveys > 0 ? Math.round((totalEmailsSent / totalSurveys) * 100) : 0}% κάλυψη`}
          />
          <StatCard 
            title="Ραντεβού" 
            value={totalAppointments} 
            subtitle={`${upcomingAppointments.length} επερχόμενα`} 
            icon={CalendarPlus} 
            trend={upcomingAppointments.length > 0 ? "up" : "neutral"}
            trendValue={upcomingAppointments.length > 0 ? `${upcomingAppointments.length} προγραμματισμένα` : "Κανένα ενεργό"}
          />
          <StatCard 
            title="Ελλιπή Έγγραφα" 
            value={incompleteSurveyAssignments + totalIncomplete} 
            subtitle={`${totalIncomplete} αυτοψίες · ${incompleteSurveyAssignments} αναθέσεις`} 
            icon={FileWarning} 
            accent
            trend={incompleteSurveyAssignments + totalIncomplete > 0 ? "down" : "neutral"}
            trendValue={incompleteSurveyAssignments + totalIncomplete > 0 ? "Εκκρεμούν έγγραφα" : "Όλα πλήρη"}
          />
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
                <div className="flex flex-wrap justify-center gap-4 mt-2">
                  {areaCounts.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                      <span className="text-muted-foreground">{item.area}</span>
                      <span className="font-bold text-foreground">{item.count}</span>
                      <span className="text-muted-foreground/60 text-[9px]">({item.surveys}α · {item.assignments}ανθ)</span>
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
                <div key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-sm rounded-lg px-3 py-2.5 bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-bold text-foreground text-xs">
                      {new Date(a.appointment_at).toLocaleDateString("el-GR")}{" "}
                      {new Date(a.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="font-bold text-xs text-foreground">SR {a.sr_id}</span>
                    <Badge variant="outline" className="text-xs">{a.area}</Badge>
                  </div>
                  {a.description && (
                    <span className="text-xs text-muted-foreground truncate sm:flex-1 pl-5 sm:pl-0">{a.description}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Αναζήτηση SR ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="w-[130px] sm:w-[160px] shrink-0">
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
              <SelectTrigger className="w-[160px] sm:w-[220px] shrink-0">
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
            <span className="text-xs text-muted-foreground font-bold self-center bg-muted px-2.5 py-1.5 rounded-full whitespace-nowrap shrink-0">
              {filtered.length} / {totalSurveys}
            </span>
          </div>
        </div>

        {/* Table / Cards */}
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
            <>
              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-border">
                {filtered.map((s) => {
                  const tech = profileMap[s.technician_id];
                  const sc = statusConfig[s.status] || statusConfig["submitted"];
                  const StatusIcon = sc.icon;
                  return (
                    <div
                      key={s.id}
                      className="p-3.5 active:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedSurvey(s)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-primary text-sm">SR {s.sr_id}</span>
                        <Badge variant="outline" className={`text-[10px] ${sc.color}`}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {sc.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {s.area}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {tech?.full_name || "—"}
                        </span>
                        <span className="ml-auto flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(s.created_at).toLocaleDateString("el-GR")}
                        </span>
                      </div>
                      {s.comments && (
                        <p className="text-[11px] text-muted-foreground/70 mt-1.5 line-clamp-1">{s.comments}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {s.email_sent && (
                          <span className="flex items-center gap-1 text-[10px] text-green-600">
                            <Mail className="h-3 w-3" /> Εστάλη
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }}
                          className="ml-auto text-muted-foreground/40 hover:text-destructive transition-colors p-1 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tablet Compact Table View */}
              <div className="hidden md:block lg:hidden">
                <table className="w-full text-xs table-fixed">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-wider">
                      <th className="text-left px-1.5 py-2 font-medium w-[14%]">SR ID</th>
                      <th className="text-left px-1.5 py-2 font-medium w-[10%]">Περιοχή</th>
                      <th className="text-left px-1.5 py-2 font-medium w-[16%]">Τεχνικός</th>
                      <th className="text-left px-1.5 py-2 font-medium w-[18%]">Κατάσταση</th>
                      <th className="text-left px-1.5 py-2 font-medium w-[12%]">Ημ/νία</th>
                      <th className="text-center px-1.5 py-2 font-medium w-[6%]">Email</th>
                      <th className="text-center px-1 py-2 w-[5%]"></th>
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
                          <td className="px-1.5 py-2 font-bold text-primary text-[11px] truncate">{s.sr_id}</td>
                          <td className="px-1.5 py-2">
                            <Badge variant="outline" className="text-[9px]">{s.area}</Badge>
                          </td>
                          <td className="px-1.5 py-2 text-muted-foreground text-[11px] truncate">{tech?.full_name || "—"}</td>
                          <td className="px-1.5 py-2">
                            <Badge variant="outline" className={`text-[9px] ${sc.color}`}>{sc.label}</Badge>
                          </td>
                          <td className="px-1.5 py-2 text-muted-foreground text-[10px] font-bold">
                            {new Date(s.created_at).toLocaleDateString("el-GR")}
                          </td>
                          <td className="px-1.5 py-2 text-center">
                            {s.email_sent ? (
                              <Mail className="h-3 w-3 text-green-600 mx-auto" />
                            ) : (
                              <span className="text-muted-foreground/30 text-[10px]">—</span>
                            )}
                          </td>
                          <td className="px-1 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setDeleteTarget(s)}
                              className="text-muted-foreground/40 hover:text-destructive transition-colors p-0.5 rounded"
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

              {/* Desktop Table View */}
              <div className="hidden lg:block">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground text-[11px] uppercase tracking-wider">
                      <th className="text-left px-2 py-2.5 font-medium w-[10%]">SR ID</th>
                      <th className="text-left px-2 py-2.5 font-medium w-[8%]">Περιοχή</th>
                      <th className="text-left px-2 py-2.5 font-medium w-[13%]">Τεχνικός</th>
                      <th className="text-left px-2 py-2.5 font-medium w-[13%]">Κατάσταση</th>
                      <th className="text-left px-2 py-2.5 font-medium w-[20%]">Σχόλια</th>
                      <th className="text-left px-2 py-2.5 font-medium w-[10%]">Ημερομηνία</th>
                      <th className="text-center px-2 py-2.5 font-medium w-[6%]">Email</th>
                      <th className="text-center px-2 py-2.5 font-medium w-[5%]">Ενέργεια</th>
                      <th className="text-center px-1 py-2.5 w-[4%]"></th>
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
                          <td className="px-2 py-2.5 font-bold text-primary text-xs truncate">{s.sr_id}</td>
                          <td className="px-2 py-2.5">
                            <Badge variant="outline" className="text-[10px]">{s.area}</Badge>
                          </td>
                          <td className="px-2 py-2.5 text-muted-foreground text-xs truncate">{tech?.full_name || "—"}</td>
                          <td className="px-2 py-2.5">
                            <Badge variant="outline" className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
                          </td>
                          <td className="px-2 py-2.5 truncate">
                            {s.comments ? (
                              <span className="text-xs text-muted-foreground">{s.comments}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-muted-foreground text-xs font-bold">
                            {new Date(s.created_at).toLocaleDateString("el-GR")}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {s.email_sent ? (
                              <Mail className="h-3.5 w-3.5 text-green-600 mx-auto" />
                            ) : (
                              <span className="text-muted-foreground/30">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setSelectedSurvey(s)}
                            >
                              <Eye className="h-4 w-4 text-primary" />
                            </Button>
                          </td>
                          <td className="px-1 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setDeleteTarget(s)}
                              className="text-muted-foreground/40 hover:text-destructive transition-colors p-0.5 rounded"
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
            </>
          )}
        </div>
      </div>

      {/* Survey Detail Modal */}
      <Dialog open={!!selectedSurvey} onOpenChange={() => setSelectedSurvey(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-h-[85vh]">
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
                      <Button
                        size="sm" variant="outline" className="gap-1.5 text-xs border-primary/30"
                        disabled={reprocessing}
                        onClick={async () => {
                          setReprocessing(true);
                          try {
                            const { data: result, error } = await supabase.functions.invoke(
                              "process-survey-completion",
                              {
                                body: {
                                  survey_id: selectedSurvey.id,
                                  sr_id: selectedSurvey.sr_id,
                                  area: selectedSurvey.area,
                                },
                              }
                            );
                            if (error) throw error;
                            if (result?.is_complete) {
                              toast.success(`Ολοκληρωμένη αυτοψία → ${result.drive_target || "Drive"} + email`);
                            } else {
                              toast.info(`Ακόμα ελλιπής. Λείπουν: ${(result?.missing_types || []).length} τύποι`);
                            }
                            queryClient.invalidateQueries({ queryKey: ["admin-surveys"] });
                            queryClient.invalidateQueries({ queryKey: ["survey-files"] });
                          } catch (err: any) {
                            console.error("Reprocess error:", err);
                            toast.error("Σφάλμα: " + (err.message || "Δοκιμάστε ξανά"));
                          } finally {
                            setReprocessing(false);
                          }
                        }}
                      >
                        {reprocessing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5 text-primary" />
                        )}
                        {reprocessing ? "Επεξεργασία..." : "Επανεπεξεργασία"}
                      </Button>
                      <Button
                        size="sm" variant="outline" className="gap-1.5 text-xs border-green-500/30"
                        disabled={resendingEmail}
                        onClick={async () => {
                          setResendingEmail(true);
                          try {
                            const { data: result, error } = await supabase.functions.invoke(
                              "resend-survey-email",
                              { body: { survey_id: selectedSurvey.id } }
                            );
                            if (error) throw error;
                            toast.success(result?.has_zip 
                              ? "Email εστάλη επιτυχώς με ZIP!" 
                              : "Email εστάλη (χωρίς ZIP)");
                            queryClient.invalidateQueries({ queryKey: ["admin-surveys"] });
                          } catch (err: any) {
                            console.error("Resend email error:", err);
                            toast.error("Σφάλμα: " + (err.message || "Δοκιμάστε ξανά"));
                          } finally {
                            setResendingEmail(false);
                          }
                        }}
                      >
                        {resendingEmail ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5 text-green-600" />
                        )}
                        {resendingEmail ? "Αποστολή..." : "Αποστολή Email"}
                      </Button>
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
                          {fileTypeLabels[type] || type} ({(files as any[]).length})
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                          {(files as any[]).map((f: any) => (
                            <a key={f.id} href={f.signedUrl || "#"} target="_blank" rel="noopener noreferrer" className="group relative block">
                              <img src={f.signedUrl || ""} alt={f.file_name} className="h-28 w-full object-cover rounded-lg border border-border group-hover:border-primary transition-colors" />
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
