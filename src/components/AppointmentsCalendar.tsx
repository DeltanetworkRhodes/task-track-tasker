import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, MapPin, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const GREEK_MONTHS = [
  "Ιανουάριος", "Φεβρουάριος", "Μάρτιος", "Απρίλιος", "Μάιος", "Ιούνιος",
  "Ιούλιος", "Αύγουστος", "Σεπτέμβριος", "Οκτώβριος", "Νοέμβριος", "Δεκέμβριος",
];
const GREEK_DAYS = ["Δευ", "Τρί", "Τετ", "Πέμ", "Παρ", "Σάβ", "Κυρ"];

interface Appointment {
  id: string;
  sr_id: string;
  appointment_at: string;
  customer_name: string | null;
  area: string | null;
  description: string | null;
}

const AppointmentsCalendar = () => {
  const { organizationId } = useOrganization();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments-calendar", organizationId, year, month],
    queryFn: async () => {
      if (!organizationId) return [];
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      const { data, error } = await supabase
        .from("appointments")
        .select("id, sr_id, appointment_at, customer_name, area, description")
        .eq("organization_id", organizationId)
        .gte("appointment_at", start)
        .lte("appointment_at", end)
        .order("appointment_at");
      if (error) throw error;
      return (data || []) as Appointment[];
    },
    enabled: !!organizationId,
  });

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    (appointments || []).forEach((a) => {
      const dateKey = a.appointment_at.split("T")[0];
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(a);
    });
    return map;
  }, [appointments]);

  // Calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Monday=0
  const daysInMonth = lastDay.getDate();

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const selectedAppts = selectedDate ? (appointmentsByDate.get(selectedDate) || []) : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm flex items-center gap-2 text-foreground">
          <CalendarDays className="h-4 w-4 text-primary" />
          Ημερολόγιο Ραντεβού
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold text-foreground min-w-[140px] text-center">
            {GREEK_MONTHS[month]} {year}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-muted/50">
          {GREEK_DAYS.map((d) => (
            <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            if (day === null) return <div key={i} className="border-t border-border bg-muted/20 min-h-[60px] sm:min-h-[72px]" />;

            const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayAppts = appointmentsByDate.get(dateKey) || [];
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selectedDate;
            const isPast = new Date(dateKey) < new Date(todayKey);

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                className={`
                  border-t border-border min-h-[60px] sm:min-h-[72px] p-1 text-left transition-colors relative
                  ${isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"}
                  ${isPast && !isToday ? "opacity-60" : ""}
                `}
              >
                <span className={`
                  text-xs font-bold inline-flex items-center justify-center h-5 w-5 rounded-full
                  ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}
                `}>
                  {day}
                </span>
                {dayAppts.length > 0 && (
                  <div className="mt-0.5 space-y-0.5">
                    {dayAppts.slice(0, 2).map((a) => (
                      <div key={a.id} className="text-[9px] font-medium bg-primary/15 text-primary rounded px-1 py-0.5 truncate">
                        {a.sr_id}
                      </div>
                    ))}
                    {dayAppts.length > 2 && (
                      <div className="text-[9px] text-muted-foreground font-bold">+{dayAppts.length - 2}</div>
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
          <h3 className="text-sm font-bold text-foreground">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          {selectedAppts.length === 0 ? (
            <p className="text-xs text-muted-foreground">Δεν υπάρχουν ραντεβού</p>
          ) : (
            <div className="space-y-2">
              {selectedAppts.map((a) => (
                <div key={a.id} className="flex items-start gap-3 bg-muted/50 rounded-lg px-3 py-2.5">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px] font-bold">{a.sr_id}</Badge>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(a.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {a.customer_name && (
                      <p className="text-xs text-foreground flex items-center gap-1">
                        <User className="h-3 w-3 text-muted-foreground" /> {a.customer_name}
                      </p>
                    )}
                    {a.area && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {a.area}
                      </p>
                    )}
                    {a.description && (
                      <p className="text-[11px] text-muted-foreground">{a.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

export default AppointmentsCalendar;
