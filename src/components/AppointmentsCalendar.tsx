import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAssignments, useProfiles } from "@/hooks/useData";
import { statusLabels } from "@/data/mockData";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, MapPin, User, GripVertical, Plus, Trash2, AlertTriangle } from "lucide-react";
import CalendarMapView from "./CalendarMapView";
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

// Enhanced status colors with more distinct visual hierarchy
const statusColors: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  pending:       { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-800 dark:text-amber-300", border: "border-amber-300 dark:border-amber-700", dot: "bg-amber-500" },
  inspection:    { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-800 dark:text-orange-300", border: "border-orange-300 dark:border-orange-700", dot: "bg-orange-500" },
  pre_committed: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-300", border: "border-blue-300 dark:border-blue-700", dot: "bg-blue-500" },
  construction:  { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-800 dark:text-violet-300", border: "border-violet-300 dark:border-violet-700", dot: "bg-violet-500" },
  completed:     { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-800 dark:text-emerald-300", border: "border-emerald-300 dark:border-emerald-700", dot: "bg-emerald-500" },
  submitted:     { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-800 dark:text-teal-300", border: "border-teal-300 dark:border-teal-700", dot: "bg-teal-500" },
  cancelled:     { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-800 dark:text-red-300", border: "border-red-300 dark:border-red-700", dot: "bg-red-500" },
  paid:          { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-800 dark:text-green-300", border: "border-green-300 dark:border-green-700", dot: "bg-green-600" },
};

const defaultStatusColor = { bg: "bg-primary/10", text: "text-primary", border: "border-primary/30", dot: "bg-primary" };

// Legacy flat class for month grid tiny badges
const statusColorFlat = (status: string) => {
  const c = statusColors[status] || defaultStatusColor;
  return `${c.bg} ${c.text}`;
};

interface Appointment {
  id: string;
  sr_id: string;
  appointment_at: string;
  customer_name: string | null;
  area: string | null;
  description: string | null;
  survey_id: string | null;
  duration_minutes: number;
}

interface AppointmentsCalendarProps {
  viewMode: "month" | "week" | "day" | "map";
}

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 20;
const HOUR_HEIGHT = 60; // px per hour

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
      latitude: (a as any).latitude as number | null,
      longitude: (a as any).longitude as number | null,
    }));
  }, [dbAssignments, technicianMap]);

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

  // Conflict detection: find appointments where same technician has overlapping times (same hour)
  const conflicts = useMemo(() => {
    const conflictSet = new Set<string>();
    const byTechAndHour = new Map<string, string[]>();
    
    (appointments || []).forEach((appt) => {
      const assignment = assignments.find((a) => a.sr_id === appt.sr_id);
      if (!assignment?.technician_id) return;
      const d = new Date(appt.appointment_at);
      const key = `${assignment.technician_id}-${appt.appointment_at.split("T")[0]}-${d.getHours()}`;
      if (!byTechAndHour.has(key)) byTechAndHour.set(key, []);
      byTechAndHour.get(key)!.push(appt.id);
    });
    
    byTechAndHour.forEach((ids) => {
      if (ids.length > 1) ids.forEach((id) => conflictSet.add(id));
    });
    
    return conflictSet;
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

  // Technicians
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
  const prevDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };
  const nextDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const formatDateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const currentDateKey = formatDateKey(currentDate);

  const handleCreateAppointment = async () => {
    if (!createAssignmentId || !createDate) return;
    setCreating(true);
    try {
      const assignment = assignments.find((a) => a.id === createAssignmentId);
      if (!assignment) throw new Error("Δεν βρέθηκε η ανάθεση");

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
    async (dateKey: string, hour?: number) => {
      if (!draggedAssignment) return;
      const assignment = unscheduledAssignments.find((a) => a.id === draggedAssignment);
      if (!assignment) return;

      try {
        const h = hour !== undefined ? String(hour).padStart(2, "0") : "09";
        const localDate = new Date(`${dateKey}T${h}:00:00`);
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
        toast.success(`${assignment.sr_id} → ${dateKey} ${h}:00`);
        queryClient.invalidateQueries({ queryKey: ["appointments-calendar"] });
      } catch (err: any) {
        toast.error(err.message);
      }
      setDraggedAssignment(null);
    },
    [draggedAssignment, unscheduledAssignments, organizationId, queryClient]
  );

  const selectedAppts = selectedDate ? (appointmentsByDate.get(selectedDate) || []) : [];

  const hours = Array.from({ length: 13 }, (_, i) => {
    const h = i + 7;
    return `${String(h).padStart(2, "0")}:00`;
  });

  // Day view data
  const dayViewDateKey = currentDateKey;
  const dayAppts = useMemo(() => {
    return (appointmentsByDate.get(dayViewDateKey) || []);
  }, [appointmentsByDate, dayViewDateKey]);

  // Group day appointments by technician for the day view
  const dayApptsPerTech = useMemo(() => {
    const map = new Map<string, (Appointment & { assignment?: typeof assignments[0] })[]>();
    dayAppts.forEach((appt) => {
      const techId = appt.assignment?.technician_id || "__unassigned__";
      if (!map.has(techId)) map.set(techId, []);
      map.get(techId)!.push(appt);
    });
    // Also add technicians with no appointments for completeness
    technicians.forEach((t) => {
      if (!map.has(t.id)) map.set(t.id, []);
    });
    return map;
  }, [dayAppts, technicians]);

  const dayViewTechs = useMemo(() => {
    const techs = Array.from(dayApptsPerTech.keys())
      .filter((id) => id !== "__unassigned__")
      .map((id) => ({ id, name: technicianMap.get(id) || "—" }));
    // Put unassigned at the end
    if (dayApptsPerTech.has("__unassigned__") && (dayApptsPerTech.get("__unassigned__")?.length ?? 0) > 0) {
      techs.push({ id: "__unassigned__", name: "Χωρίς τεχνικό" });
    }
    return techs;
  }, [dayApptsPerTech, technicianMap]);

  // Navigation helpers
  const navPrev = viewMode === "month" ? prevMonth : viewMode === "week" ? prevWeek : prevDay;
  const navNext = viewMode === "month" ? nextMonth : viewMode === "week" ? nextWeek : nextDay;

  const navLabel = viewMode === "month"
    ? `${GREEK_MONTHS[month]} ${year}`
    : viewMode === "week"
    ? `${weekDates[0].getDate()} - ${weekDates[6].getDate()} ${GREEK_MONTHS[weekDates[6].getMonth()]} ${weekDates[6].getFullYear()}`
    : currentDate.toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const viewLabel = viewMode === "month" ? "Μηνιαίο Ημερολόγιο" : viewMode === "week" ? "Εβδομαδιαίο Πρόγραμμα" : viewMode === "map" ? "Χάρτης Ημέρας" : "Ημερήσιο Timeline";

  // Map view appointments with coordinates from assignments
  const mapAppointments = useMemo(() => {
    return dayAppts.map((appt) => ({
      ...appt,
      latitude: appt.assignment?.latitude ?? null,
      longitude: appt.assignment?.longitude ?? null,
      assignment: appt.assignment ? {
        status: appt.assignment.status,
        technician_name: appt.assignment.technician_name,
        technician_id: appt.assignment.technician_id,
        address: appt.assignment.address,
      } : undefined,
    }));
  }, [dayAppts]);

  // Drag resize handler
  const resizingRef = useRef<{ apptId: string; startY: number; startDuration: number } | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent, apptId: string, currentDuration: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { apptId, startY: e.clientY, startDuration: currentDuration };

    const handleMouseMove = (me: MouseEvent) => {
      if (!resizingRef.current) return;
      const dy = me.clientY - resizingRef.current.startY;
      const dMinutes = Math.round(dy / (HOUR_HEIGHT / 60));
      const newDuration = Math.max(15, Math.min(480, resizingRef.current.startDuration + dMinutes));
      const el = document.querySelector(`[data-appt-resize="${apptId}"]`) as HTMLElement;
      if (el) {
        el.style.height = `${(newDuration / 60) * HOUR_HEIGHT - 4}px`;
      }
    };

    const handleMouseUp = async (me: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (!resizingRef.current) return;
      const dy = me.clientY - resizingRef.current.startY;
      const dMinutes = Math.round(dy / (HOUR_HEIGHT / 60));
      const newDuration = Math.max(15, Math.min(480, resizingRef.current.startDuration + dMinutes));
      resizingRef.current = null;

      if (newDuration === currentDuration) return;

      try {
        const { error } = await supabase
          .from("appointments")
          .update({ duration_minutes: newDuration })
          .eq("id", apptId);
        if (error) throw error;
        toast.success(`Διάρκεια: ${newDuration} λεπτά`);
        queryClient.invalidateQueries({ queryKey: ["appointments-calendar"] });
      } catch (err: any) {
        toast.error(err.message);
        queryClient.invalidateQueries({ queryKey: ["appointments-calendar"] });
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [queryClient]);

  // Status legend for visibility
  const StatusLegend = () => (
    <div className="flex flex-wrap gap-2 text-[10px]">
      {Object.entries(statusColors).map(([status, colors]) => (
        <div key={status} className="flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
          <span className="text-muted-foreground">{statusLabels[status] || status}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Status Legend */}
      <div className="rounded-xl border border-border bg-card p-2.5 flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Χρώματα:</span>
        <StatusLegend />
      </div>

      {/* Conflict warning banner */}
      {conflicts.size > 0 && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-xs text-amber-800 dark:text-amber-300 font-medium">
            ⚠ Υπάρχουν {conflicts.size} ραντεβού με σύγκρουση (ίδιος τεχνικός, ίδια ώρα)
          </span>
        </div>
      )}

      {/* Unscheduled assignments panel */}
      {unscheduledAssignments.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Χωρίς ραντεβού ({unscheduledAssignments.length}) — σύρε σε ημερομηνία
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unscheduledAssignments.slice(0, 20).map((a) => {
              const sc = statusColors[a.status] || defaultStatusColor;
              return (
                <div
                  key={a.id}
                  draggable
                  onDragStart={() => setDraggedAssignment(a.id)}
                  onDragEnd={() => setDraggedAssignment(null)}
                  className={`flex items-center gap-1 ${sc.bg} hover:opacity-80 rounded-lg px-2 py-1.5 cursor-grab active:cursor-grabbing transition-colors border ${sc.border}`}
                >
                  <GripVertical className="h-3 w-3 text-muted-foreground/50" />
                  <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                  <Badge variant="secondary" className="text-[10px] font-bold">{a.sr_id}</Badge>
                  <span className="text-[10px] text-muted-foreground">{a.area}</span>
                </div>
              );
            })}
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
          {viewLabel}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={navPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold text-foreground min-w-[160px] text-center">
            {navLabel}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={navNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {viewMode !== "month" && (
            <Button variant="outline" size="sm" className="text-xs h-7 ml-1" onClick={() => setCurrentDate(new Date())}>
              Σήμερα
            </Button>
          )}
        </div>
      </div>

      {/* ============ MONTH VIEW ============ */}
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
                const hasConflict = dayAppts.some((a) => conflicts.has(a.id));

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
                      <div className="flex items-center gap-0.5">
                        {hasConflict && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                        {!isPast && (
                          <span
                            onClick={(e) => { e.stopPropagation(); setCreateDate(dateKey); setShowCreateDialog(true); }}
                            className="h-4 w-4 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>
                    {dayAppts.length > 0 && (
                      <div className="mt-0.5 space-y-0.5">
                        {dayAppts.slice(0, 3).map((a) => {
                          const sc = a.assignment ? (statusColors[a.assignment.status] || defaultStatusColor) : defaultStatusColor;
                          const isConflict = conflicts.has(a.id);
                          return (
                            <div
                              key={a.id}
                              className={`text-[8px] sm:text-[9px] font-medium rounded px-1 py-0.5 truncate ${sc.bg} ${sc.text} ${isConflict ? "ring-1 ring-amber-400 dark:ring-amber-600" : ""}`}
                            >
                              <span className={`inline-block h-1.5 w-1.5 rounded-full ${sc.dot} mr-0.5`} />
                              {a.sr_id}
                              {a.assignment && (
                                <span className="hidden sm:inline ml-0.5 opacity-70">
                                  • {a.assignment.technician_name?.split(" ")[0]}
                                </span>
                              )}
                            </div>
                          );
                        })}
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => {
                      setCurrentDate(new Date(selectedDate + "T00:00:00"));
                      // parent will need to switch — for now we go to day via setSelectedDate
                    }}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Timeline
                  </Button>
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
              </div>
              {selectedAppts.length === 0 ? (
                <p className="text-xs text-muted-foreground">Δεν υπάρχουν ραντεβού</p>
              ) : (
                <div className="space-y-2">
                  {selectedAppts.map((a) => {
                    const sc = a.assignment ? (statusColors[a.assignment.status] || defaultStatusColor) : defaultStatusColor;
                    const isConflict = conflicts.has(a.id);
                    return (
                      <div key={a.id} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 group border ${sc.border} ${sc.bg} ${isConflict ? "ring-2 ring-amber-400" : ""}`}>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`h-2.5 w-2.5 rounded-full ${sc.dot}`} />
                            <Badge variant="secondary" className="text-[10px] font-bold">{a.sr_id}</Badge>
                            {a.assignment && (
                              <Badge className={`text-[9px] ${sc.bg} ${sc.text} border-0`}>
                                {statusLabels[a.assignment.status] || a.assignment.status}
                              </Badge>
                            )}
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(a.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {isConflict && (
                              <span className="text-[9px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5">
                                <AlertTriangle className="h-3 w-3" /> Σύγκρουση!
                              </span>
                            )}
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
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ============ WEEK VIEW ============ */}
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
                              {dayAppts.map((appt) => {
                                const sc = appt.assignment ? (statusColors[appt.assignment.status] || defaultStatusColor) : defaultStatusColor;
                                const isConflict = conflicts.has(appt.id);
                                return (
                                  <div
                                    key={appt.id}
                                    className={`text-[9px] font-medium rounded px-1.5 py-1 truncate cursor-default border ${sc.bg} ${sc.text} ${sc.border} ${isConflict ? "ring-1 ring-amber-400" : ""}`}
                                    title={`${appt.sr_id} — ${new Date(appt.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}${isConflict ? " ⚠ ΣΥΓΚΡΟΥΣΗ" : ""}`}
                                  >
                                    <div className="flex items-center gap-1">
                                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${sc.dot}`} />
                                      <Clock className="h-2.5 w-2.5 shrink-0" />
                                      {new Date(appt.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                                      {isConflict && <AlertTriangle className="h-2.5 w-2.5 text-amber-500 shrink-0" />}
                                    </div>
                                    <div className="font-bold truncate">{appt.sr_id}</div>
                                  </div>
                                );
                              })}
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

      {/* ============ DAY VIEW — Hourly Timeline ============ */}
      {viewMode === "day" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {dayViewTechs.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Δεν υπάρχουν τεχνικοί με αναθέσεις
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                {/* Header row with technician names */}
                <div className="flex border-b border-border bg-muted/50 sticky top-0 z-10">
                  <div className="w-[60px] shrink-0 px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-r border-border">
                    Ώρα
                  </div>
                  {dayViewTechs.map((tech) => (
                    <div
                      key={tech.id}
                      className="flex-1 min-w-[140px] px-2 py-2 text-center border-r border-border last:border-r-0"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                          {tech.name.charAt(0)}
                        </div>
                        <span className="text-xs font-semibold text-foreground truncate">{tech.name}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Hour rows */}
                {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => {
                  const hour = DAY_START_HOUR + i;
                  const now = new Date();
                  const isCurrentHour = currentDateKey === todayKey && now.getHours() === hour;

                  return (
                    <div key={hour} className={`flex border-b border-border last:border-b-0 ${isCurrentHour ? "bg-primary/5" : ""}`} style={{ minHeight: `${HOUR_HEIGHT}px` }}>
                      {/* Hour label */}
                      <div className="w-[60px] shrink-0 px-2 py-1.5 text-[11px] font-mono text-muted-foreground border-r border-border text-right pr-3 relative">
                        {String(hour).padStart(2, "0")}:00
                        {isCurrentHour && (
                          <div className="absolute right-0 top-0 w-1 h-full bg-primary rounded-l" />
                        )}
                      </div>

                      {/* Technician columns */}
                      {dayViewTechs.map((tech) => {
                        const techAppts = (dayApptsPerTech.get(tech.id) || []).filter((appt) => {
                          const apptHour = new Date(appt.appointment_at).getHours();
                          return apptHour === hour;
                        });

                        return (
                          <div
                            key={tech.id}
                            className="flex-1 min-w-[140px] px-1 py-1 border-r border-border last:border-r-0 relative"
                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("bg-primary/10"); }}
                            onDragLeave={(e) => { e.currentTarget.classList.remove("bg-primary/10"); }}
                            onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("bg-primary/10"); handleDrop(dayViewDateKey, hour); }}
                          >
                            <div className="space-y-1">
                              {techAppts.map((appt) => {
                                const sc = appt.assignment ? (statusColors[appt.assignment.status] || defaultStatusColor) : defaultStatusColor;
                                const isConflict = conflicts.has(appt.id);
                                return (
                                  <div
                                    key={appt.id}
                                    className={`rounded-lg px-2 py-1.5 border ${sc.bg} ${sc.border} ${sc.text} ${isConflict ? "ring-2 ring-amber-400 dark:ring-amber-600" : ""} group relative`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1 min-w-0">
                                        <span className={`h-2 w-2 rounded-full shrink-0 ${sc.dot}`} />
                                        <span className="text-[10px] font-bold truncate">{appt.sr_id}</span>
                                        {isConflict && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                                      </div>
                                      <button
                                        onClick={() => handleDeleteAppointment(appt.id)}
                                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-all"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                    <div className="text-[9px] opacity-75 flex items-center gap-1 mt-0.5">
                                      <Clock className="h-2.5 w-2.5" />
                                      {new Date(appt.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                                    </div>
                                    {appt.area && (
                                      <div className="text-[9px] opacity-70 flex items-center gap-1 truncate">
                                        <MapPin className="h-2.5 w-2.5 shrink-0" />
                                        {appt.area}
                                      </div>
                                    )}
                                    {appt.customer_name && (
                                      <div className="text-[9px] opacity-70 truncate">{appt.customer_name}</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
