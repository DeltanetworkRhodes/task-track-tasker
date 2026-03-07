import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAssignments, useProfiles } from "@/hooks/useData";
import { statusLabels } from "@/data/mockData";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, MapPin, User, GripVertical, Plus, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const GREEK_MONTHS = [
  "Ιανουάριος", "Φεβρουάριος", "Μάρτιος", "Απρίλιος", "Μάιος", "Ιούνιος",
  "Ιούλιος", "Αύγουστος", "Σεπτέμβριος", "Οκτώβριος", "Νοέμβριος", "Δεκέμβριος",
];
const GREEK_DAYS = ["Δευ", "Τρί", "Τετ", "Πέμ", "Παρ", "Σάβ", "Κυρ"];
const GREEK_DAYS_FULL = ["Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή"];

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  inspection: "bg-warning/15 text-warning",
  pre_committed: "bg-primary/15 text-primary",
  waiting_ote: "bg-cyan-500/15 text-cyan-600",
  construction: "bg-accent/15 text-accent-foreground",
  completed: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

interface Appointment {
  id: string;
  sr_id: string;
  appointment_at: string;
  customer_name: string | null;
  area: string | null;
  description: string | null;
  survey_id: string | null;
}

interface AppointmentsCalendarProps {
  viewMode: "month" | "week";
}

const AppointmentsCalendar = ({ viewMode }: AppointmentsCalendarProps) => {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createDate, setCreateDate] = useState<string>("");
  const [createHour, setCreateHour] = useState("09:00");
  const [createAssignmentId, setCreateAssignmentId] = useState("");
  const [creating, setCreating] = useState(false);
  const [draggedAssignment, setDraggedAssignment] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments-calendar", organizationId, year, month],
    queryFn: async () => {
      if (!organizationId) return [];
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month + 2, 0, 23, 59, 59).toISOString();
      const { data, error } = await supabase
        .from("appointments")
        .select("id, sr_id, appointment_at, customer_name, area, description, survey_id")
        .eq("organization_id", organizationId)
        .gte("appointment_at", start)
        .lte("appointment_at", end)
        .order("appointment_at");
      if (error) throw error;
      return (data || []) as Appointment[];
    },
    enabled: !!organizationId,
  });

  const { data: dbAssignments } = useAssignments();
  const { data: profiles } = useProfiles();

  const technicianMap = useMemo(() => {
    const map = new Map<string, string>();
    (profiles || []).forEach((p) => {
      map.set(p.user_id, p.full_name || p.email || "—");
    });
    return map;
  }, [profiles]);

  // Assignments enriched
  const assignments = useMemo(() => {
    return (dbAssignments || []).map((a) => ({
      id: a.id,
      sr_id: a.sr_id,
      area: a.area,
      status: a.status,
      technician_id: a.technician_id,
      technician_name: a.technician_id ? technicianMap.get(a.technician_id) || "—" : "Χωρίς ανάθεση",
      customer_name: (a as any).customer_name || "",
      address: (a as any).address || "",
    }));
  }, [dbAssignments, technicianMap]);

  // Unscheduled assignments (no appointment yet)
  const scheduledSrIds = useMemo(() => {
    return new Set((appointments || []).map((a) => a.sr_id));
  }, [appointments]);

  const unscheduledAssignments = useMemo(() => {
    return assignments.filter(
      (a) => !scheduledSrIds.has(a.sr_id) && a.status !== "cancelled" && a.status !== "completed"
    );
  }, [assignments, scheduledSrIds]);

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, (Appointment & { assignment?: typeof assignments[0] })[]>();
    (appointments || []).forEach((appt) => {
      const dateKey = appt.appointment_at.split("T")[0];
      const assignment = assignments.find((a) => a.sr_id === appt.sr_id);
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push({ ...appt, assignment });
    });
    return map;
  }, [appointments, assignments]);

  // Calendar grid for month view
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);

  // Week view dates
  const weekDates = useMemo(() => {
    const d = new Date(currentDate);
    const dayOfWeek = (d.getDay() + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - dayOfWeek);
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date(monday);
      dt.setDate(monday.getDate() + i);
      dates.push(dt);
    }
    return dates;
  }, [currentDate]);

  // Technicians for week view
  const technicians = useMemo(() => {
    const techIds = new Set<string>();
    assignments.forEach((a) => {
      if (a.technician_id) techIds.add(a.technician_id);
    });
    return Array.from(techIds).map((id) => ({
      id,
      name: technicianMap.get(id) || "—",
    }));
  }, [assignments, technicianMap]);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const prevWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };
  const nextWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const formatDateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const handleCreateAppointment = async () => {
    if (!createAssignmentId || !createDate) return;
    setCreating(true);
    try {
      const assignment = assignments.find((a) => a.id === createAssignmentId);
      if (!assignment) throw new Error("Δεν βρέθηκε η ανάθεση");

      // Create date in local timezone with explicit offset to avoid UTC conversion
      const localDate = new Date(`${createDate}T${createHour}:00`);
      const appointmentAt = localDate.toISOString();
      const { error } = await supabase.from("appointments").insert({
        sr_id: assignment.sr_id,
        appointment_at: appointmentAt,
        customer_name: assignment.customer_name || null,
        area: assignment.area || null,
        description: `Τεχνικός: ${assignment.technician_name}`,
        organization_id: organizationId,
      });
      if (error) throw error;
      toast.success(`Ραντεβού για ${assignment.sr_id} στις ${createDate} ${createHour}`);
      queryClient.invalidateQueries({ queryKey: ["appointments-calendar"] });
      setShowCreateDialog(false);
      setCreateAssignmentId("");
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα δημιουργίας");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    try {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw error;
      toast.success("Το ραντεβού διαγράφηκε");
      queryClient.invalidateQueries({ queryKey: ["appointments-calendar"] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDrop = useCallback(
    async (dateKey: string) => {
      if (!draggedAssignment) return;
      const assignment = unscheduledAssignments.find((a) => a.id === draggedAssignment);
      if (!assignment) return;

      try {
        const localDate = new Date(`${dateKey}T09:00:00`);
        const appointmentAt = localDate.toISOString();
        const { error } = await supabase.from("appointments").insert({
          sr_id: assignment.sr_id,
          appointment_at: appointmentAt,
          customer_name: assignment.customer_name || null,
          area: assignment.area || null,
          description: `Τεχνικός: ${assignment.technician_name}`,
          organization_id: organizationId,
        });
        if (error) throw error;
        toast.success(`${assignment.sr_id} → ${dateKey}`);
        queryClient.invalidateQueries({ queryKey: ["appointments-calendar"] });
      } catch (err: any) {
        toast.error(err.message);
      }
      setDraggedAssignment(null);
    },
    [draggedAssignment, unscheduledAssignments, organizationId, queryClient]
  );

  const selectedAppts = selectedDate ? (appointmentsByDate.get(selectedDate) || []) : [];

  // Hours for time select
  const hours = Array.from({ length: 13 }, (_, i) => {
    const h = i + 7;
    return `${String(h).padStart(2, "0")}:00`;
  });

  return (
    <div className="space-y-4">
      {/* Unscheduled assignments panel (drag source) */}
      {unscheduledAssignments.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Χωρίς ραντεβού ({unscheduledAssignments.length}) — σύρε σε ημερομηνία
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unscheduledAssignments.slice(0, 20).map((a) => (
              <div
                key={a.id}
                draggable
                onDragStart={() => setDraggedAssignment(a.id)}
                onDragEnd={() => setDraggedAssignment(null)}
                className="flex items-center gap-1 bg-muted/50 hover:bg-muted rounded-lg px-2 py-1.5 cursor-grab active:cursor-grabbing transition-colors"
              >
                <GripVertical className="h-3 w-3 text-muted-foreground/50" />
                <Badge variant="secondary" className="text-[10px] font-bold">{a.sr_id}</Badge>
                <span className="text-[10px] text-muted-foreground">{a.area}</span>
              </div>
            ))}
            {unscheduledAssignments.length > 20 && (
              <span className="text-[10px] text-muted-foreground self-center">+{unscheduledAssignments.length - 20} ακόμα</span>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm flex items-center gap-2 text-foreground">
          <CalendarDays className="h-4 w-4 text-primary" />
          {viewMode === "month" ? "Μηνιαίο Ημερολόγιο" : "Εβδομαδιαίο Πρόγραμμα"}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={viewMode === "month" ? prevMonth : prevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold text-foreground min-w-[160px] text-center">
            {viewMode === "month"
              ? `${GREEK_MONTHS[month]} ${year}`
              : `${weekDates[0].getDate()} - ${weekDates[6].getDate()} ${GREEK_MONTHS[weekDates[6].getMonth()]} ${weekDates[6].getFullYear()}`}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={viewMode === "month" ? nextMonth : nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* MONTH VIEW */}
      {viewMode === "month" && (
        <>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-7 bg-muted/50">
              {GREEK_DAYS.map((d) => (
                <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((day, i) => {
                if (day === null) return <div key={i} className="border-t border-border bg-muted/20 min-h-[60px] sm:min-h-[80px]" />;

                const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayAppts = appointmentsByDate.get(dateKey) || [];
                const isToday = dateKey === todayKey;
                const isSelected = dateKey === selectedDate;
                const isPast = new Date(dateKey) < new Date(todayKey);

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary/40"); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove("ring-2", "ring-primary/40"); }}
                    onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("ring-2", "ring-primary/40"); handleDrop(dateKey); }}
                    className={`
                      border-t border-border min-h-[60px] sm:min-h-[80px] p-1 text-left transition-all relative
                      ${isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"}
                      ${isPast && !isToday ? "opacity-60" : ""}
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold inline-flex items-center justify-center h-5 w-5 rounded-full ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                        {day}
                      </span>
                      {!isPast && (
                        <span
                          onClick={(e) => { e.stopPropagation(); setCreateDate(dateKey); setShowCreateDialog(true); }}
                          className="h-4 w-4 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    {dayAppts.length > 0 && (
                      <div className="mt-0.5 space-y-0.5">
                        {dayAppts.slice(0, 3).map((a) => (
                          <div
                            key={a.id}
                            className={`text-[8px] sm:text-[9px] font-medium rounded px-1 py-0.5 truncate ${
                              a.assignment ? statusColors[a.assignment.status] || "bg-primary/15 text-primary" : "bg-primary/15 text-primary"
                            }`}
                          >
                            {a.sr_id}
                            {a.assignment && (
                              <span className="hidden sm:inline ml-0.5 opacity-70">
                                • {a.assignment.technician_name?.split(" ")[0]}
                              </span>
                            )}
                          </div>
                        ))}
                        {dayAppts.length > 3 && (
                          <div className="text-[9px] text-muted-foreground font-bold">+{dayAppts.length - 3}</div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected day detail */}
          {selectedDate && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">
                  {new Date(selectedDate + "T00:00:00").toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" })}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => { setCreateDate(selectedDate); setShowCreateDialog(true); }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ραντεβού
                </Button>
              </div>
              {selectedAppts.length === 0 ? (
                <p className="text-xs text-muted-foreground">Δεν υπάρχουν ραντεβού</p>
              ) : (
                <div className="space-y-2">
                  {selectedAppts.map((a) => (
                    <div key={a.id} className="flex items-start gap-3 bg-muted/50 rounded-lg px-3 py-2.5 group">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] font-bold">{a.sr_id}</Badge>
                          {a.assignment && (
                            <Badge className={`text-[9px] ${statusColors[a.assignment.status]}`}>
                              {statusLabels[a.assignment.status] || a.assignment.status}
                            </Badge>
                          )}
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(a.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        {a.assignment && (
                          <p className="text-xs text-foreground flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" /> {a.assignment.technician_name}
                          </p>
                        )}
                        {a.customer_name && (
                          <p className="text-[11px] text-muted-foreground">{a.customer_name}</p>
                        )}
                        {a.area && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {a.area}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteAppointment(a.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* WEEK VIEW — Technician timeline */}
      {viewMode === "week" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-3 py-2.5 w-[120px] border-r border-border sticky left-0 bg-muted/50 z-10">
                  Τεχνικός
                </th>
                {weekDates.map((d, i) => {
                  const dk = formatDateKey(d);
                  const isToday = dk === todayKey;
                  return (
                    <th key={i} className={`text-center text-[10px] font-bold uppercase tracking-wider px-2 py-2.5 border-r border-border last:border-r-0 ${isToday ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                      <div>{GREEK_DAYS[i]}</div>
                      <div className={`text-sm font-bold mt-0.5 ${isToday ? "text-primary" : "text-foreground"}`}>{d.getDate()}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {technicians.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                    Δεν υπάρχουν τεχνικοί με αναθέσεις
                  </td>
                </tr>
              ) : (
                technicians.map((tech) => {
                  // Get this tech's appointments for each day
                  const techAssignments = assignments.filter((a) => a.technician_id === tech.id);
                  const techSrIds = new Set(techAssignments.map((a) => a.sr_id));

                  return (
                    <tr key={tech.id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2 border-r border-border sticky left-0 bg-card z-10">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                            {tech.name.charAt(0)}
                          </div>
                          <span className="text-xs font-medium text-foreground truncate">{tech.name}</span>
                        </div>
                      </td>
                      {weekDates.map((d, i) => {
                        const dk = formatDateKey(d);
                        const isToday = dk === todayKey;
                        const dayAppts = (appointmentsByDate.get(dk) || []).filter(
                          (appt) => techSrIds.has(appt.sr_id)
                        );

                        return (
                          <td
                            key={i}
                            className={`px-1 py-1.5 border-r border-border last:border-r-0 align-top ${isToday ? "bg-primary/5" : ""}`}
                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("bg-primary/10"); }}
                            onDragLeave={(e) => { e.currentTarget.classList.remove("bg-primary/10"); }}
                            onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("bg-primary/10"); handleDrop(dk); }}
                          >
                            <div className="space-y-1 min-h-[40px]">
                              {dayAppts.map((appt) => (
                                <div
                                  key={appt.id}
                                  className={`text-[9px] font-medium rounded px-1.5 py-1 truncate cursor-default ${
                                    appt.assignment ? statusColors[appt.assignment.status] || "bg-primary/15 text-primary" : "bg-primary/15 text-primary"
                                  }`}
                                  title={`${appt.sr_id} — ${new Date(appt.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}`}
                                >
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-2.5 w-2.5 shrink-0" />
                                    {new Date(appt.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                  <div className="font-bold truncate">{appt.sr_id}</div>
                                </div>
                              ))}
                              {dayAppts.length === 0 && (
                                <div className="h-full flex items-center justify-center">
                                  <span className="text-[9px] text-muted-foreground/30">—</span>
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Create Appointment Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Νέο Ραντεβού</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Ημερομηνία</label>
              <input
                type="date"
                value={createDate}
                onChange={(e) => setCreateDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Ώρα</label>
              <Select value={createHour} onValueChange={setCreateHour}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hours.map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Ανάθεση (SR)</label>
              <Select value={createAssignmentId} onValueChange={setCreateAssignmentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Επιλέξτε ανάθεση..." />
                </SelectTrigger>
                <SelectContent>
                  {unscheduledAssignments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.sr_id} — {a.area} ({a.technician_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full gap-1.5"
              onClick={handleCreateAppointment}
              disabled={creating || !createAssignmentId || !createDate}
            >
              {creating ? "Δημιουργία..." : "Δημιουργία Ραντεβού"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AppointmentsCalendar;
