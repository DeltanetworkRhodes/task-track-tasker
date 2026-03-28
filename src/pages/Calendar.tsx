import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import AppointmentsCalendar from "@/components/AppointmentsCalendar";
import { CalendarDays, List, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";

type ViewMode = "month" | "week";

const Calendar = () => {
  const [view, setView] = useState<ViewMode>("month");

  return (
    <AppLayout>
      <div className="space-y-5 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Ημερολόγιο & Πρόγραμμα</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Ραντεβού, αναθέσεις & πρόγραμμα τεχνικών
            </p>
          </div>
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
            <Button
              variant={view === "month" ? "default" : "ghost"}
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => setView("month")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Μήνας
            </Button>
            <Button
              variant={view === "week" ? "default" : "ghost"}
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => setView("week")}
            >
              <List className="h-3.5 w-3.5" />
              Εβδομάδα
            </Button>
          </div>
        </div>
        <AppointmentsCalendar viewMode={view} />
      </div>
    </AppLayout>
  );
};

export default Calendar;
