import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAssignments, useProfiles } from "@/hooks/useData";
import { statusLabels } from "@/data/mockData";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, MapPin, User, GripVertical, Plus, Trash2, AlertTriangle, Filter, BarChart3, Printer, Search, X, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
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

// Technician color palette — distinct hues for each tech
const TECH_COLORS = [
  { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-300", ring: "ring-blue-400", dot: "bg-blue-500", avatar: "bg-blue-500" },
  { bg: "bg-rose-100 dark:bg-rose-900/30", text: "text-rose-800 dark:text-rose-300", ring: "ring-rose-400", dot: "bg-rose-500", avatar: "bg-rose-500" },
  { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-800 dark:text-teal-300", ring: "ring-teal-400", dot: "bg-teal-500", avatar: "bg-teal-500" },
  { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-800 dark:text-purple-300", ring: "ring-purple-400", dot: "bg-purple-500", avatar: "bg-purple-500" },
  { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-800 dark:text-orange-300", ring: "ring-orange-400", dot: "bg-orange-500", avatar: "bg-orange-500" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/30", text: "text-cyan-800 dark:text-cyan-300", ring: "ring-cyan-400", dot: "bg-cyan-500", avatar: "bg-cyan-500" },
  { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-800 dark:text-pink-300", ring: "ring-pink-400", dot: "bg-pink-500", avatar: "bg-pink-500" },
  { bg: "bg-lime-100 dark:bg-lime-900/30", text: "text-lime-800 dark:text-lime-300", ring: "ring-lime-400", dot: "bg-lime-500", avatar: "bg-lime-500" },
];

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

// Get ISO week number
function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

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
const HOUR_HEIGHT = 60;

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

  // Filter states
  const [filterTech, setFilterTech] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterArea, setFilterArea] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  // Sidebar search & filters
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarTechFilter, setSidebarTechFilter] = useState<string>("all");
  const [sidebarAreaFilter, setSidebarAreaFilter] = useState<string>("all");
  const [sidebarShowCount, setSidebarShowCount] = useState(30);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
        .select("id, sr_id, appointment_at, customer_name, area, description, survey_id, duration_minutes")
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

  // Technician color map (stable mapping)
  const techColorMap = useMemo(() => {
    const map = new Map<string, typeof TECH_COLORS[0]>();
    const techIds = new Set<string>();
    assignments.forEach((a) => { if (a.technician_id) techIds.add(a.technician_id); });
    Array.from(techIds).forEach((id, i) => {
      map.set(id, TECH_COLORS[i % TECH_COLORS.length]);
    });
    return map;
  }, [assignments]);

  const scheduledSrIds = useMemo(() => {
    return new Set((appointments || []).map((a) => a.sr_id));
  }, [appointments]);

  const unscheduledAssignments = useMemo(() => {
    return assignments.filter(
      (a) => !scheduledSrIds.has(a.sr_id) && a.status !== "cancelled" && a.status !== "completed"
    );
  }, [assignments, scheduledSrIds]);

  // Unique areas for filter
  const uniqueAreas = useMemo(() => {
    const areas = new Set<string>();
    assignments.forEach((a) => { if (a.area) areas.add(a.area); });
    return Array.from(areas).sort();
  }, [assignments]);

  // Unique statuses for filter
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set<string>();
    assignments.forEach((a) => statuses.add(a.status));
    return Array.from(statuses);
  }, [assignments]);

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, (Appointment & { assignment?: typeof assignments[0] })[]>();
    (appointments || []).forEach((appt) => {
      const dateKey = appt.appointment_at.split("T")[0];
      const assignment = assignments.find((a) => a.sr_id === appt.sr_id);

      // Apply filters
      if (filterTech !== "all" && assignment?.technician_id !== filterTech) return;
      if (filterStatus !== "all" && assignment?.status !== filterStatus) return;
      if (filterArea !== "all" && assignment?.area !== filterArea) return;

      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push({ ...appt, assignment });
    });
    return map;
  }, [appointments, assignments, filterTech, filterStatus, filterArea]);

  // Conflict detection
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

  // Mini stats
  const stats = useMemo(() => {
    const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
    const todayAppts = appointmentsByDate.get(todayKey) || [];
    const totalThisMonth = Array.from(appointmentsByDate.values()).reduce((sum, arr) => sum + arr.length, 0);
    const completedCount = todayAppts.filter(a => a.assignment?.status === "completed").length;
    const pendingCount = todayAppts.filter(a => a.assignment?.status === "pending").length;
    return { today: todayAppts.length, month: totalThisMonth, completed: completedCount, pending: pendingCount, conflicts: conflicts.size };
  }, [appointmentsByDate, conflicts]);

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

  // Print/export handler
  const handlePrint = () => {
    window.print();
  };

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
    technicians.forEach((t) => {
      if (!map.has(t.id)) map.set(t.id, []);
    });
    return map;
  }, [dayAppts, technicians]);

  const dayViewTechs = useMemo(() => {
    const techs = Array.from(dayApptsPerTech.keys())
      .filter((id) => id !== "__unassigned__")
      .map((id) => ({ id, name: technicianMap.get(id) || "—" }));
    if (dayApptsPerTech.has("__unassigned__") && (dayApptsPerTech.get("__unassigned__")?.length ?? 0) > 0) {
      techs.push({ id: "__unassigned__", name: "Χωρίς τεχνικό" });
    }
    return techs;
  }, [dayApptsPerTech, technicianMap]);

  // Navigation helpers
  const navPrev = viewMode === "month" ? prevMonth : viewMode === "week" ? prevWeek : prevDay;
  const navNext = viewMode === "month" ? nextMonth : viewMode === "week" ? nextWeek : nextDay;

  const weekNum = getWeekNumber(currentDate);

  const navLabel = viewMode === "month"
    ? `${GREEK_MONTHS[month]} ${year}`
    : viewMode === "week"
    ? `Εβδ. ${getWeekNumber(weekDates[0])} — ${weekDates[0].getDate()} - ${weekDates[6].getDate()} ${GREEK_MONTHS[weekDates[6].getMonth()]} ${weekDates[6].getFullYear()}`
    : `${currentDate.toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} (Εβδ. ${weekNum})`;

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
        building_id_hemd: appt.assignment.building_id_hemd,
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

  // Status legend
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

  // Active filter count
  const activeFilters = [filterTech, filterStatus, filterArea].filter(f => f !== "all").length;

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* ===== LEFT SIDEBAR — Unscheduled Assignments (searchable) ===== */}
      {unscheduledAssignments.length > 0 && (
        <div className={`shrink-0 space-y-2 transition-all ${sidebarCollapsed ? "lg:w-[48px]" : "lg:w-[280px] xl:w-[320px]"}`}>
          <div className="rounded-xl border border-border bg-card lg:sticky lg:top-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/30">
              {!sidebarCollapsed && (
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Χωρίς ραντεβού
                  </p>
                  <Badge variant="secondary" className="text-[10px]">{unscheduledAssignments.length}</Badge>
                </div>
              )}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title={sidebarCollapsed ? "Άνοιγμα" : "Σύμπτυξη"}
              >
                <ChevronLeft className={`h-3.5 w-3.5 transition-transform ${sidebarCollapsed ? "rotate-180" : ""}`} />
              </button>
            </div>

            {!sidebarCollapsed && (
              <>
                {/* Search */}
                <div className="px-2.5 pt-2.5 pb-1.5">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                      placeholder="Αναζήτηση SR, περιοχή, πελάτη..."
                      value={sidebarSearch}
                      onChange={(e) => { setSidebarSearch(e.target.value); setSidebarShowCount(30); }}
                      className="h-7 pl-7 pr-7 text-[11px] bg-muted/30 border-0 focus-visible:ring-1"
                    />
                    {sidebarSearch && (
                      <button
                        onClick={() => setSidebarSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Mini filters */}
                <div className="px-2.5 pb-2 flex items-center gap-1.5">
                  <Select value={sidebarTechFilter} onValueChange={(v) => { setSidebarTechFilter(v); setSidebarShowCount(30); }}>
                    <SelectTrigger className="h-6 text-[10px] border-0 bg-muted/40 px-2 w-auto min-w-[80px]">
                      <User className="h-2.5 w-2.5 mr-1 shrink-0" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Όλοι</SelectItem>
                      {technicians.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          <div className="flex items-center gap-1">
                            <span className={`h-2 w-2 rounded-full ${techColorMap.get(t.id)?.dot || "bg-muted"}`} />
                            {t.name.split(" ")[0]}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sidebarAreaFilter} onValueChange={(v) => { setSidebarAreaFilter(v); setSidebarShowCount(30); }}>
                    <SelectTrigger className="h-6 text-[10px] border-0 bg-muted/40 px-2 w-auto min-w-[80px]">
                      <MapPin className="h-2.5 w-2.5 mr-1 shrink-0" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Όλες</SelectItem>
                      {uniqueAreas.map(a => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(sidebarTechFilter !== "all" || sidebarAreaFilter !== "all" || sidebarSearch) && (
                    <button
                      onClick={() => { setSidebarSearch(""); setSidebarTechFilter("all"); setSidebarAreaFilter("all"); }}
                      className="text-[9px] text-destructive hover:underline"
                    >
                      Καθαρ.
                    </button>
                  )}
                </div>

                {/* Filtered list */}
                {(() => {
                  const searchLower = sidebarSearch.toLowerCase().trim();
                  const filtered = unscheduledAssignments.filter(a => {
                    if (sidebarTechFilter !== "all" && a.technician_id !== sidebarTechFilter) return false;
                    if (sidebarAreaFilter !== "all" && a.area !== sidebarAreaFilter) return false;
                    if (searchLower) {
                      const haystack = `${a.sr_id} ${a.area} ${a.customer_name} ${a.technician_name} ${a.address}`.toLowerCase();
                      return haystack.includes(searchLower);
                    }
                    return true;
                  });
                  const shown = filtered.slice(0, sidebarShowCount);
                  const remaining = filtered.length - shown.length;

                  return (
                    <div className="px-2 pb-2">
                      {searchLower || sidebarTechFilter !== "all" || sidebarAreaFilter !== "all" ? (
                        <p className="text-[9px] text-muted-foreground mb-1.5 px-0.5">
                          {filtered.length} αποτελέσματα {searchLower ? `για "${sidebarSearch}"` : ""}
                        </p>
                      ) : null}
                      <div className="flex flex-col gap-1 max-h-[55vh] overflow-y-auto pr-0.5">
                        {shown.length === 0 && (
                          <p className="text-[10px] text-muted-foreground text-center py-4">
                            Δεν βρέθηκαν αναθέσεις
                          </p>
                        )}
                        {shown.map((a) => {
                          const sc = statusColors[a.status] || defaultStatusColor;
                          const tc = a.technician_id ? techColorMap.get(a.technician_id) : null;
                          return (
                            <div
                              key={a.id}
                              draggable
                              onDragStart={() => setDraggedAssignment(a.id)}
                              onDragEnd={() => setDraggedAssignment(null)}
                              className={`flex items-center gap-1.5 ${sc.bg} hover:opacity-80 rounded-lg px-2 py-1.5 cursor-grab active:cursor-grabbing transition-colors border ${sc.border}`}
                            >
                              <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                              {tc && <span className={`h-2 w-2 rounded-full shrink-0 ${tc.dot}`} title={a.technician_name} />}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${sc.dot}`} />
                                  <span className="text-[10px] font-bold truncate">{a.sr_id}</span>
                                </div>
                                <div className="text-[9px] text-muted-foreground truncate">
                                  {a.area}{a.customer_name ? ` • ${a.customer_name}` : ""}
                                </div>
                                <div className="text-[8px] text-muted-foreground/60 truncate">
                                  {a.technician_name}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {remaining > 0 && (
                          <button
                            onClick={() => setSidebarShowCount(prev => prev + 50)}
                            className="flex items-center justify-center gap-1 text-[10px] text-primary hover:underline py-2"
                          >
                            <ChevronDown className="h-3 w-3" />
                            Φόρτωσε {Math.min(remaining, 50)} ακόμα ({remaining} απομένουν)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== MAIN CALENDAR AREA ===== */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* ===== MINI STATS BAR ===== */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-semibold text-foreground">{stats.today}</span>
            <span className="text-[10px] text-muted-foreground">σήμερα</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-foreground">{stats.month}</span>
            <span className="text-[10px] text-muted-foreground">μήνα</span>
          </div>
          {stats.completed > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">{stats.completed}</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">ολοκληρ.</span>
            </div>
          )}
          {stats.pending > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">{stats.pending}</span>
              <span className="text-[10px] text-amber-600 dark:text-amber-400">εκκρεμή</span>
            </div>
          )}
          {stats.conflicts > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-[10px] font-semibold text-red-700 dark:text-red-300">{stats.conflicts}</span>
              <span className="text-[10px] text-red-600 dark:text-red-400">συγκρούσεις</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {/* Filter toggle */}
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              className="gap-1.5 text-[10px] h-7 px-2.5"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-3 w-3" />
              Φίλτρα
              {activeFilters > 0 && (
                <Badge variant="destructive" className="h-4 w-4 p-0 flex items-center justify-center text-[8px] rounded-full">
                  {activeFilters}
                </Badge>
              )}
            </Button>
            {/* Print */}
            <Button variant="outline" size="sm" className="gap-1.5 text-[10px] h-7 px-2.5" onClick={handlePrint}>
              <Printer className="h-3 w-3" />
              <span className="hidden sm:inline">Εκτύπωση</span>
            </Button>
          </div>
        </div>

        {/* ===== QUICK FILTERS ===== */}
        {showFilters && (
          <div className="flex items-center gap-2 flex-wrap rounded-xl border border-border bg-card p-3 animate-in slide-in-from-top-1 duration-200">
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={filterTech} onValueChange={setFilterTech}>
                <SelectTrigger className="h-7 w-[150px] text-[11px]">
                  <SelectValue placeholder="Τεχνικός" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλοι οι τεχνικοί</SelectItem>
                  {technicians.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${techColorMap.get(t.id)?.dot || "bg-muted"}`} />
                        {t.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-muted-foreground" />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-7 w-[140px] text-[11px]">
                  <SelectValue placeholder="Κατάσταση" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλες</SelectItem>
                  {uniqueStatuses.map(s => (
                    <SelectItem key={s} value={s}>
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${statusColors[s]?.dot || "bg-muted"}`} />
                        {statusLabels[s] || s}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={filterArea} onValueChange={setFilterArea}>
                <SelectTrigger className="h-7 w-[140px] text-[11px]">
                  <SelectValue placeholder="Περιοχή" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλες</SelectItem>
                  {uniqueAreas.map(a => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {activeFilters > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-[10px] h-7 text-destructive hover:text-destructive"
                onClick={() => { setFilterTech("all"); setFilterStatus("all"); setFilterArea("all"); }}
              >
                Καθαρισμός
              </Button>
            )}
          </div>
        )}

        {/* Legend + Technician colors row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 flex items-center gap-2 flex-wrap">
            <StatusLegend />
          </div>
          {/* Technician color legend */}
          {technicians.length > 0 && (
            <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold text-muted-foreground mr-1">Τεχνικοί:</span>
              {technicians.map(t => {
                const tc = techColorMap.get(t.id);
                return (
                  <div key={t.id} className="flex items-center gap-1">
                    <span className={`h-2.5 w-2.5 rounded-full ${tc?.dot || "bg-muted"}`} />
                    <span className="text-[10px] text-muted-foreground">{t.name.split(" ")[0]}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            {/* Day headers */}
            <div className="grid grid-cols-7">
              {GREEK_DAYS_FULL.map((d, i) => (
                <div
                  key={d}
                  className={`text-center text-[11px] font-semibold py-3 border-b border-border ${
                    i >= 5 ? "text-muted-foreground/60 bg-muted/30" : "text-muted-foreground"
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7">
              {calendarDays.map((day, i) => {
                const colIdx = i % 7;
                const isWeekend = colIdx >= 5;

                if (day === null) {
                  return (
                    <div
                      key={i}
                      className={`min-h-[90px] sm:min-h-[110px] border-b border-r border-border last:border-r-0 ${
                        isWeekend ? "bg-muted/20" : "bg-card"
                      }`}
                    />
                  );
                }

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
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add("ring-2", "ring-primary/50", "ring-inset");
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove("ring-2", "ring-primary/50", "ring-inset");
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("ring-2", "ring-primary/50", "ring-inset");
                      handleDrop(dateKey);
                    }}
                    className={`
                      min-h-[90px] sm:min-h-[110px] p-1.5 sm:p-2 text-left transition-all relative
                      border-b border-r border-border last:border-r-0 group/cell
                      ${isWeekend ? "bg-muted/15" : "bg-card"}
                      ${isSelected ? "bg-primary/8 shadow-inner" : "hover:bg-accent/30"}
                      ${isPast && !isToday ? "opacity-50" : ""}
                    `}
                  >
                    {/* Day number + actions */}
                    <div className="flex items-start justify-between mb-1">
                      <span
                        className={`
                          text-sm font-semibold inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors
                          ${isToday
                            ? "bg-primary text-primary-foreground shadow-md"
                            : isSelected
                            ? "bg-primary/15 text-primary"
                            : "text-foreground hover:bg-muted"
                          }
                        `}
                      >
                        {day}
                      </span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                        {hasConflict && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 opacity-100" />}
                        {!isPast && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setCreateDate(dateKey);
                              setShowCreateDialog(true);
                            }}
                            className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Appointments with technician color indicator */}
                    {dayAppts.length > 0 && (
                      <div className="space-y-0.5">
                        {dayAppts.slice(0, 3).map((a) => {
                          const sc = a.assignment
                            ? statusColors[a.assignment.status] || defaultStatusColor
                            : defaultStatusColor;
                          const tc = a.assignment?.technician_id ? techColorMap.get(a.assignment.technician_id) : null;
                          const isConflict = conflicts.has(a.id);
                          return (
                            <div
                              key={a.id}
                              className={`
                                text-[9px] sm:text-[10px] font-medium rounded-md px-1.5 py-0.5 truncate
                                border-l-[3px] ${tc ? `border-l-current` : sc.border} ${sc.bg} ${sc.text}
                                ${isConflict ? "ring-1 ring-amber-400 dark:ring-amber-600" : ""}
                                hover:shadow-sm transition-shadow
                              `}
                              style={tc ? { borderLeftColor: `var(--tw-${tc.dot?.replace("bg-", "")})` } : undefined}
                            >
                              {tc && <span className={`inline-block h-1.5 w-1.5 rounded-full ${tc.dot} mr-0.5 align-middle`} />}
                              <span className="font-bold">{a.sr_id}</span>
                              {a.assignment && (
                                <span className="hidden sm:inline ml-1 opacity-60 font-normal">
                                  {a.assignment.technician_name?.split(" ")[0]}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {dayAppts.length > 3 && (
                          <div className="text-[9px] text-muted-foreground font-semibold pl-1.5">
                            +{dayAppts.length - 3} ακόμα
                          </div>
                        )}
                      </div>
                    )}

                    {/* Appointment count dot */}
                    {dayAppts.length > 0 && !isSelected && (
                      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5">
                        {dayAppts.length <= 5 ? (
                          dayAppts.map((a, idx) => {
                            const tc = a.assignment?.technician_id ? techColorMap.get(a.assignment.technician_id) : null;
                            return (
                              <span
                                key={idx}
                                className={`h-1.5 w-1.5 rounded-full ${tc?.dot || (a.assignment ? (statusColors[a.assignment.status] || defaultStatusColor).dot : defaultStatusColor.dot)} hidden sm:block`}
                              />
                            );
                          })
                        ) : (
                          <Badge variant="secondary" className="text-[8px] h-4 px-1 hidden sm:flex">
                            {dayAppts.length}
                          </Badge>
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
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString("el-GR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedAppts.length} ραντεβού
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => {
                      setCurrentDate(new Date(selectedDate + "T00:00:00"));
                    }}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Timeline
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => {
                      setCreateDate(selectedDate);
                      setShowCreateDialog(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ραντεβού
                  </Button>
                </div>
              </div>
              {selectedAppts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Δεν υπάρχουν ραντεβού αυτή την ημέρα
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedAppts.map((a) => {
                    const sc = a.assignment
                      ? statusColors[a.assignment.status] || defaultStatusColor
                      : defaultStatusColor;
                    const tc = a.assignment?.technician_id ? techColorMap.get(a.assignment.technician_id) : null;
                    const isConflict = conflicts.has(a.id);
                    return (
                      <div
                        key={a.id}
                        className={`
                          rounded-xl px-4 py-3 group border-l-4 ${sc.border} bg-card border border-border
                          ${isConflict ? "ring-2 ring-amber-400" : ""}
                          hover:shadow-md transition-shadow
                        `}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-foreground">{a.sr_id}</span>
                              {a.assignment && (
                                <Badge className={`text-[9px] ${sc.bg} ${sc.text} border-0`}>
                                  {statusLabels[a.assignment.status] || a.assignment.status}
                                </Badge>
                              )}
                              {tc && (
                                <span className={`h-3 w-3 rounded-full ${tc.dot}`} title={a.assignment?.technician_name} />
                              )}
                              {isConflict && (
                                <span className="text-[9px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5">
                                  <AlertTriangle className="h-3 w-3" /> Σύγκρουση
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {new Date(a.appointment_at).toLocaleTimeString("el-GR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {a.assignment && (
                                <span className="flex items-center gap-1">
                                  <User className="h-3.5 w-3.5" />
                                  {a.assignment.technician_name}
                                </span>
                              )}
                            </div>
                            {(a.customer_name || a.area) && (
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                {a.area && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" /> {a.area}
                                  </span>
                                )}
                                {a.customer_name && <span>• {a.customer_name}</span>}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteAppointment(a.id)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-all"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
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
                  const tc = techColorMap.get(tech.id);

                  return (
                    <tr key={tech.id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2 border-r border-border sticky left-0 bg-card z-10">
                        <div className="flex items-center gap-2">
                          <div className={`h-6 w-6 rounded-full ${tc?.avatar || "bg-primary/10"} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
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
                                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tc?.dot || sc.dot}`} />
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
                  {dayViewTechs.map((tech) => {
                    const tc = techColorMap.get(tech.id);
                    return (
                      <div
                        key={tech.id}
                        className="flex-1 min-w-[140px] px-2 py-2 text-center border-r border-border last:border-r-0"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <div className={`h-6 w-6 rounded-full ${tc?.avatar || "bg-primary/10"} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                            {tech.name.charAt(0)}
                          </div>
                          <span className="text-xs font-semibold text-foreground truncate">{tech.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Hour rows */}
                {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => {
                  const hour = DAY_START_HOUR + i;
                  const now = new Date();
                  const isCurrentHour = currentDateKey === todayKey && now.getHours() === hour;

                  return (
                    <div key={hour} className={`flex border-b border-border last:border-b-0 ${isCurrentHour ? "bg-primary/5" : ""}`} style={{ minHeight: `${HOUR_HEIGHT}px` }}>
                      <div className="w-[60px] shrink-0 px-2 py-1.5 text-[11px] font-mono text-muted-foreground border-r border-border text-right pr-3 relative">
                        {String(hour).padStart(2, "0")}:00
                        {isCurrentHour && (
                          <div className="absolute right-0 top-0 w-1 h-full bg-primary rounded-l" />
                        )}
                      </div>

                      {dayViewTechs.map((tech) => {
                        const techAppts = (dayApptsPerTech.get(tech.id) || []).filter((appt) => {
                          const apptHour = new Date(appt.appointment_at).getHours();
                          return apptHour === hour;
                        });
                        const tc = techColorMap.get(tech.id);

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
                                const duration = (appt as any).duration_minutes || 60;
                                const heightPx = (duration / 60) * HOUR_HEIGHT - 4;
                                return (
                                  <div
                                    key={appt.id}
                                    data-appt-resize={appt.id}
                                    style={{ height: `${heightPx}px`, minHeight: "28px" }}
                                    className={`rounded-lg px-2 py-1.5 border ${sc.bg} ${sc.border} ${sc.text} ${isConflict ? "ring-2 ring-amber-400 dark:ring-amber-600" : ""} group relative overflow-hidden`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1 min-w-0">
                                        <span className={`h-2 w-2 rounded-full shrink-0 ${tc?.dot || sc.dot}`} />
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
                                      <span className="opacity-60">({duration}΄)</span>
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
                                    {/* Resize handle */}
                                    <div
                                      className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize opacity-0 group-hover:opacity-100 flex items-center justify-center bg-gradient-to-t from-black/10 to-transparent rounded-b-lg"
                                      onMouseDown={(e) => handleResizeStart(e, appt.id, duration)}
                                    >
                                      <div className="w-6 h-0.5 rounded-full bg-current opacity-50" />
                                    </div>
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

      {/* ============ MAP VIEW ============ */}
      {viewMode === "map" && (
        <>
          <CalendarMapView
            appointments={mapAppointments}
            dateLabel={navLabel}
            unscheduledAssignments={unscheduledAssignments}
          />
        </>
      )}
      </div>{/* end MAIN CALENDAR AREA */}

      {isLoading && (
        <div className="flex items-center justify-center py-8 lg:flex-1">
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
