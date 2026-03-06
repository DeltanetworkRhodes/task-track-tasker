import { useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { useAssignments, useConstructions, useProfiles } from "@/hooks/useData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, CheckCircle2, Clock, Euro, TrendingUp, BarChart3 } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, Cell } from "recharts";

const COLORS = [
  "hsl(330 100% 44%)", "hsl(152 60% 42%)", "hsl(220 70% 55%)",
  "hsl(38 92% 50%)", "hsl(280 55% 52%)", "hsl(190 75% 45%)",
];

const TechnicianKPIs = () => {
  const { data: assignments } = useAssignments();
  const { data: constructions } = useConstructions();
  const { data: profiles } = useProfiles();

  // Fetch surveys too
  const { data: surveys } = useQuery({
    queryKey: ["surveys_kpi"],
    queryFn: async () => {
      const { data, error } = await supabase.from("surveys").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const techStats = useMemo(() => {
    if (!assignments || !profiles) return [];

    // Get unique technician IDs from assignments
    const techIds = [...new Set(assignments.map(a => a.technician_id).filter(Boolean))] as string[];

    return techIds.map(techId => {
      const profile = profiles.find(p => p.user_id === techId);
      const name = profile?.full_name || "Άγνωστος";
      const area = profile?.area || "";

      const techAssignments = assignments.filter(a => a.technician_id === techId);
      const completed = techAssignments.filter(a => a.status === "completed").length;
      const active = techAssignments.filter(a => a.status !== "completed" && a.status !== "cancelled").length;
      const cancelled = techAssignments.filter(a => a.status === "cancelled").length;
      const total = techAssignments.length;

      const techSurveys = (surveys || []).filter(s => s.technician_id === techId);
      const surveyCount = techSurveys.length;
      const completedSurveys = techSurveys.filter(s => s.status === "completed").length;

      const techConstructions = (constructions || []).filter(c => {
        const relatedAssignment = assignments.find(a => a.id === c.assignment_id);
        return relatedAssignment?.technician_id === techId;
      });
      const revenue = techConstructions.reduce((s, c) => s + Number(c.revenue), 0);
      const profit = techConstructions.reduce((s, c) => s + Number(c.profit || 0), 0);
      const constructionCount = techConstructions.length;

      // Average days to complete (from created to completed)
      const completedAssignments = techAssignments.filter(a => a.status === "completed");
      let avgDays = 0;
      if (completedAssignments.length > 0) {
        const totalDays = completedAssignments.reduce((s, a) => {
          const created = new Date(a.created_at).getTime();
          const updated = new Date(a.updated_at).getTime();
          return s + (updated - created) / (1000 * 60 * 60 * 24);
        }, 0);
        avgDays = Math.round(totalDays / completedAssignments.length);
      }

      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      return {
        techId, name, area, total, completed, active, cancelled,
        surveyCount, completedSurveys, constructionCount,
        revenue, profit, avgDays, completionRate,
      };
    }).sort((a, b) => b.completed - a.completed);
  }, [assignments, constructions, surveys, profiles]);

  const chartData = techStats.map((t, i) => ({
    name: t.name.split(" ")[0], // first name only
    completed: t.completed,
    fill: COLORS[i % COLORS.length],
  }));

  const chartConfig = chartData.reduce((acc, d) => {
    acc[d.name] = { label: d.name, color: d.fill };
    return acc;
  }, {} as Record<string, { label: string; color: string }>);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px] mx-auto">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Αναφορές & KPIs Τεχνικών
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Απόδοση, ολοκληρώσεις & οικονομικά ανά τεχνικό
          </p>
        </div>

        {/* Overview chart */}
        {chartData.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Ολοκληρωμένες Αναθέσεις ανά Τεχνικό
            </h2>
            <ChartContainer config={chartConfig} className="h-[220px] w-full">
              <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <XAxis dataKey="name" tick={{ fill: "hsl(220 10% 46%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(220 10% 46%)", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="completed" name="Ολοκληρωμένα" radius={[8, 8, 0, 0]} barSize={40}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        )}

        {/* Tech cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {techStats.map((tech, i) => (
            <div key={tech.techId} className="rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                >
                  {tech.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm truncate">{tech.name}</p>
                  {tech.area && <p className="text-[10px] text-muted-foreground">{tech.area}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-extrabold text-primary">{tech.completionRate}%</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Completion</p>
                </div>
              </div>

              {/* Completion bar */}
              <div className="h-2 rounded-full bg-muted overflow-hidden mb-4">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${tech.completionRate}%`,
                    backgroundColor: COLORS[i % COLORS.length],
                  }}
                />
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                  </div>
                  <p className="text-lg font-bold font-mono">{tech.completed}</p>
                  <p className="text-[9px] text-muted-foreground uppercase">Ολοκλ.</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Clock className="h-3 w-3 text-warning" />
                  </div>
                  <p className="text-lg font-bold font-mono">{tech.active}</p>
                  <p className="text-[9px] text-muted-foreground uppercase">Ενεργές</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-bold font-mono">{tech.avgDays}<span className="text-[10px]">μ</span></p>
                  <p className="text-[9px] text-muted-foreground uppercase">Μ.Ο. Ημέρες</p>
                </div>
              </div>

              {/* Financial */}
              <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Euro className="h-3.5 w-3.5 text-primary shrink-0" />
                  <div>
                    <p className="text-xs font-mono font-semibold">{tech.revenue.toLocaleString('el-GR')}€</p>
                    <p className="text-[9px] text-muted-foreground">Έσοδα</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-accent shrink-0" />
                  <div>
                    <p className="text-xs font-mono font-semibold">{tech.profit.toLocaleString('el-GR')}€</p>
                    <p className="text-[9px] text-muted-foreground">Κέρδος</p>
                  </div>
                </div>
              </div>

              {/* Extra info */}
              <div className="mt-3 pt-3 border-t border-border/30 flex justify-between text-[10px] text-muted-foreground">
                <span>{tech.surveyCount} αυτοψίες</span>
                <span>{tech.constructionCount} κατασκευές</span>
                <span>{tech.total} σύνολο</span>
              </div>
            </div>
          ))}
        </div>

        {techStats.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Δεν υπάρχουν ακόμα δεδομένα τεχνικών</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default TechnicianKPIs;
