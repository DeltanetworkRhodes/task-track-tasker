import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Eye, Calendar, MapPin, User, MessageSquare, FileImage, Image, FileText,
  Download, CheckCircle, AlertTriangle, Clock, Mail, Send, Settings, XCircle, CalendarPlus, Bell
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

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  submitted: { label: "Υποβλήθηκε", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Clock },
  "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ": { label: "Προδέσμευση Υλικών", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: CheckCircle },
  "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ": { label: "Ελλιπής Αυτοψία", color: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: AlertTriangle },
  "ΑΠΑΙΤΕΙΤΑΙ ΕΝΕΡΓΕΙΑ": { label: "Απαιτείται Ενέργεια", color: "bg-orange-600/10 text-orange-700 border-orange-600/20", icon: Mail },
  BLOCKER: { label: "Blocker", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: XCircle },
  "ΡΑΝΤΕΒΟΥ": { label: "Ραντεβού", color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: CalendarPlus },
};

const Surveys = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedSurvey, setSelectedSurvey] = useState<any>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toEmails, setToEmails] = useState("");
  const [ccEmails, setCcEmails] = useState("");

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

  const { data: emailSettings } = useQuery({
    queryKey: ["email-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_settings").select("*");
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => { map[s.setting_key] = s.setting_value; });
      return map;
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

  const profileMap = (profiles || []).reduce((acc: Record<string, any>, p) => {
    acc[p.user_id] = p;
    return acc;
  }, {});

  const getFileUrl = (path: string) => {
    const { data } = supabase.storage.from("surveys").getPublicUrl(path);
    return data.publicUrl;
  };

  // Simple status change (no email)
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

  // Send email report (BLOCKER / ΑΠΑΙΤΕΙΤΑΙ ΕΝΕΡΓΕΙΑ)
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

  // Parse date from comments and create appointment
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

  // Save email settings
  const handleSaveSettings = async () => {
    const updates = [
      { setting_key: "report_to_emails", setting_value: toEmails },
      { setting_key: "report_cc_emails", setting_value: ccEmails },
    ];

    for (const u of updates) {
      await supabase.from("email_settings").upsert(u, { onConflict: "setting_key" });
    }
    toast.success("Ρυθμίσεις αποθηκεύτηκαν");
    queryClient.invalidateQueries({ queryKey: ["email-settings"] });
    setShowSettings(false);
  };

  const filtered = (surveys || []).filter((s) => {
    const matchesSearch = s.sr_id.toLowerCase().includes(search.toLowerCase());
    const matchesArea = areaFilter === "all" || s.area === areaFilter;
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesArea && matchesStatus;
  });

  const groupedFiles = (surveyFiles || []).reduce((acc: Record<string, any[]>, f) => {
    if (!acc[f.file_type]) acc[f.file_type] = [];
    acc[f.file_type].push(f);
    return acc;
  }, {});

  const totalComplete = (surveys || []).filter((s) => s.status === "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ").length;
  const totalIncomplete = (surveys || []).filter((s) => s.status === "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ").length;
  const totalBlockers = (surveys || []).filter((s) => s.status === "BLOCKER" || s.status === "ΑΠΑΙΤΕΙΤΑΙ ΕΝΕΡΓΕΙΑ").length;

  // Upcoming appointments
  const upcomingAppointments = (appointments || []).filter(
    (a) => new Date(a.appointment_at) >= new Date()
  );

  return (
    <AppLayout>
      <div className="space-y-6">
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

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{(surveys || []).length}</p>
            <p className="text-xs text-muted-foreground">Σύνολο</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{totalComplete}</p>
            <p className="text-xs text-muted-foreground">Ολοκληρωμένες</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-orange-600">{totalIncomplete}</p>
            <p className="text-xs text-muted-foreground">Ελλιπείς</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{totalBlockers}</p>
            <p className="text-xs text-muted-foreground">Blockers</p>
          </Card>
        </div>

        {/* Upcoming appointments */}
        {upcomingAppointments.length > 0 && (
          <Card className="p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <CalendarPlus className="h-4 w-4 text-purple-600" />
              Επερχόμενα Ραντεβού ({upcomingAppointments.length})
            </h3>
            <div className="space-y-1">
              {upcomingAppointments.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground">
                    {new Date(a.appointment_at).toLocaleDateString("el-GR")}{" "}
                    {new Date(a.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span>SR {a.sr_id}</span>
                  <Badge variant="outline" className="text-xs">{a.area}</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <Input
            placeholder="Αναζήτηση SR ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs text-sm"
          />
          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger className="w-[140px] text-sm">
              <SelectValue placeholder="Περιοχή" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Όλες</SelectItem>
              <SelectItem value="ΡΟΔΟΣ">ΡΟΔΟΣ</SelectItem>
              <SelectItem value="ΚΩΣ">ΚΩΣ</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px] text-sm">
              <SelectValue placeholder="Κατάσταση" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Όλες</SelectItem>
              <SelectItem value="ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ">Προδέσμευση Υλικών</SelectItem>
              <SelectItem value="ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ">Ελλιπής Αυτοψία</SelectItem>
              <SelectItem value="ΑΠΑΙΤΕΙΤΑΙ ΕΝΕΡΓΕΙΑ">Απαιτείται Ενέργεια</SelectItem>
              <SelectItem value="BLOCKER">Blocker</SelectItem>
              <SelectItem value="ΡΑΝΤΕΒΟΥ">Ραντεβού</SelectItem>
              <SelectItem value="submitted">Υποβλήθηκε</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Δεν βρέθηκαν αυτοψίες
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">SR ID</th>
                  <th className="text-left px-4 py-3 font-medium">Περιοχή</th>
                  <th className="text-left px-4 py-3 font-medium">Τεχνικός</th>
                  <th className="text-left px-4 py-3 font-medium">Κατάσταση</th>
                  <th className="text-left px-4 py-3 font-medium">Ημερομηνία</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-center px-4 py-3 font-medium">Προβολή</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const tech = profileMap[s.technician_id];
                  const sc = statusConfig[s.status] || statusConfig["submitted"];
                  return (
                    <tr
                      key={s.id}
                      className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => setSelectedSurvey(s)}
                    >
                      <td className="px-4 py-3 font-semibold text-foreground">{s.sr_id}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">{s.area}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{tech?.full_name || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-xs ${sc.color}`}>{sc.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(s.created_at).toLocaleDateString("el-GR")}
                      </td>
                      <td className="px-4 py-3">
                        {s.email_sent && <Mail className="h-3.5 w-3.5 text-green-600" />}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Eye className="h-4 w-4 mx-auto text-primary" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
                  <Card className="p-3 space-y-3">
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
                    </div>
                    {selectedSurvey.email_sent && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <Mail className="h-3 w-3" /> Αναφορά εστάλη
                      </p>
                    )}
                  </Card>

                  {/* Info */}
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

                  {/* Comments */}
                  {selectedSurvey.comments && (
                    <Card className="p-3">
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
    </AppLayout>
  );
};

export default Surveys;
