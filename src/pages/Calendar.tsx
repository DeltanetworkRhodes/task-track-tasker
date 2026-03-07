import AppLayout from "@/components/AppLayout";
import AppointmentsCalendar from "@/components/AppointmentsCalendar";

const Calendar = () => {
  return (
    <AppLayout>
      <div className="space-y-5 max-w-[1000px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ημερολόγιο</h1>
          <p className="text-sm text-muted-foreground mt-1">Ραντεβού τεχνικών ανά ημέρα</p>
        </div>
        <AppointmentsCalendar />
      </div>
    </AppLayout>
  );
};

export default Calendar;
