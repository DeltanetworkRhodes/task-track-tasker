import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Phone } from "lucide-react";
import type { CallStatusKey } from "@/lib/callStatus";

interface CallDashboardWidgetProps {
  assignments: Array<{
    call_status?: string;
    callStatus?: string;
    status?: string;
    appointment_at?: string;
    appointmentAt?: string;
    sr_id?: string;
    srId?: string;
    customer_name?: string;
    customerName?: string;
  }>;
}

const CallDashboardWidget = ({ assignments }: CallDashboardWidgetProps) => {
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const active = assignments.filter(
      (a) => !["cancelled", "completed", "submitted", "paid", "rejected"].includes(a.status || "")
    );
    const notCalled = active.filter((a) => (a.call_status || a.callStatus || "not_called") === "not_called").length;
    const needCallback = active.filter((a) => {
      const cs = a.call_status || a.callStatus || "not_called";
      return cs === "no_answer" || cs === "sms_sent";
    }).length;
    const scheduled = active.filter((a) => (a.call_status || a.callStatus) === "scheduled").length;
    const declined = active.filter((a) => (a.call_status || a.callStatus) === "declined").length;
    return { notCalled, needCallback, scheduled, declined };
  }, [assignments]);

  // Upcoming appointments (next 24h)
  const upcomingAppointments = useMemo(() => {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return assignments
      .filter((a) => {
        const appt = a.appointment_at || a.appointmentAt;
        if (!appt) return false;
        const d = new Date(appt);
        return d >= now && d <= in24h;
      })
      .sort((a, b) => {
        const da = new Date(a.appointment_at || a.appointmentAt || "");
        const db = new Date(b.appointment_at || b.appointmentAt || "");
        return da.getTime() - db.getTime();
      })
      .slice(0, 5);
  }, [assignments]);

  return (
    <div className="space-y-4">
      {/* Call Stats Widget */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
        <h2 className="font-bold text-sm mb-3 flex items-center gap-2 text-foreground">
          <Phone className="h-4 w-4 text-primary shrink-0" />
          Κλήσεις
        </h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
              Δεν κλήθηκαν
            </span>
            <span className="font-bold">{stats.notCalled}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500 shrink-0" />
              Χρειάζονται επανάκληση
            </span>
            <span className="font-bold">{stats.needCallback}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
              Ραντεβού κλεισμένα
            </span>
            <span className="font-bold">{stats.scheduled}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400 shrink-0" />
              Αρνήθηκαν
            </span>
            <span className="font-bold">{stats.declined}</span>
          </div>
        </div>
        <button
          onClick={() => navigate("/assignments")}
          className="mt-3 text-xs text-primary font-medium hover:underline"
        >
          Δες όλες →
        </button>
      </div>

      {/* Appointment Reminders */}
      {upcomingAppointments.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
          <h2 className="font-bold text-sm mb-3 flex items-center gap-2 text-foreground">
            📅 {upcomingAppointments.length} ραντεβού σε 24ω
          </h2>
          <div className="space-y-2">
            {upcomingAppointments.map((a, i) => {
              const appt = new Date(a.appointment_at || a.appointmentAt || "");
              const time = appt.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
              const dayName = appt.toLocaleDateString("el-GR", { weekday: "short", day: "numeric", month: "numeric" });
              return (
                <div key={i} className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-2 bg-muted/50">
                  <span className="font-bold text-primary">{a.sr_id || a.srId}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-medium">{time}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground truncate">{a.customer_name || a.customerName}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CallDashboardWidget;
