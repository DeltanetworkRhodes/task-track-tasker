import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { el } from "date-fns/locale";
import { RefreshCw, AlertTriangle, CheckCircle, Activity, Search } from "lucide-react";
import AppLayout from "@/components/AppLayout";

export default function Diagnostics() {
  const [filterSR, setFilterSR] = useState("");

  const { data: logs, refetch, isLoading } = useQuery({
    queryKey: ["auto_system_logs", filterSR],
    queryFn: async () => {
      let query = (supabase as any)
        .from("auto_system_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (filterSR.trim()) {
        query = query.ilike("sr_id", `%${filterSR.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as any[];
    },
    refetchInterval: 10000, // auto-refresh κάθε 10s
  });

  // Group by SR
  const bySR = (logs ?? []).reduce((acc: Record<string, any[]>, log: any) => {
    const key = log.sr_id ?? "unknown";
    (acc[key] ||= []).push(log);
    return acc;
  }, {});

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground">
              <Activity className="h-6 w-6 text-primary" />
              Διαγνωστικά Auto-Systems
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Logs από auto-billing και materials autofill. Τελευταίες 7 μέρες.
            </p>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Ανανέωση
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Φίλτρο SR ID..."
            value={filterSR}
            onChange={(e) => setFilterSR(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading && (
          <Card className="p-8 text-center text-muted-foreground">Φόρτωση...</Card>
        )}

        {!isLoading && Object.keys(bySR).length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            Δεν υπάρχουν logs ακόμα. Άνοιξε κάποιο SR από το Τεχνικό Dashboard για να δημιουργηθούν.
          </Card>
        )}

        {Object.entries(bySR).map(([srId, srLogs]) => {
          const billingLogs = srLogs.filter((l) => l.system === "auto_billing");
          const materialsLogs = srLogs.filter((l) => l.system === "materials_autofill");
          const billingPassed = billingLogs.find((l) => l.event === "all_guards_passed");
          const billingBlocked = billingLogs.find((l) => l.event === "guard_blocked");
          const materialsPassed = materialsLogs.find((l) => l.event === "all_guards_passed");
          const materialsBlocked = materialsLogs.find((l) => l.event === "guard_blocked");
          const latestLog = srLogs[0];

          return (
            <Card key={srId} className="p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                  <h3 className="font-bold text-lg text-foreground">SR: {srId}</h3>
                  <p className="text-xs text-muted-foreground">
                    Τελευταίο: {formatDistanceToNow(new Date(latestLog.created_at), { addSuffix: true, locale: el })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {billingPassed ? (
                    <Badge variant="success">✓ Billing OK</Badge>
                  ) : billingBlocked ? (
                    <Badge variant="destructive">✗ Billing Blocked</Badge>
                  ) : (
                    <Badge variant="outline">Billing: —</Badge>
                  )}
                  {materialsPassed ? (
                    <Badge variant="success">✓ Materials OK</Badge>
                  ) : materialsBlocked ? (
                    <Badge variant="destructive">✗ Materials Blocked</Badge>
                  ) : (
                    <Badge variant="outline">Materials: —</Badge>
                  )}
                </div>
              </div>

              {billingLogs.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-foreground">💰 Auto-Billing</h4>
                  <div className="space-y-2">
                    {billingLogs.slice(0, 10).map((log) => (
                      <div key={log.id} className="flex gap-2 items-start text-xs bg-muted/30 rounded-md p-2">
                        {log.event === "guard_blocked" && (
                          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        )}
                        {log.event === "all_guards_passed" && (
                          <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                        )}
                        {log.event !== "guard_blocked" && log.event !== "all_guards_passed" && (
                          <Activity className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-mono font-semibold text-foreground">{log.event}</p>
                          <pre className="text-muted-foreground text-[10px] mt-1 whitespace-pre-wrap break-all">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {materialsLogs.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-foreground">📦 Materials Autofill</h4>
                  <div className="space-y-2">
                    {materialsLogs.slice(0, 10).map((log) => (
                      <div key={log.id} className="flex gap-2 items-start text-xs bg-muted/30 rounded-md p-2">
                        {log.event === "guard_blocked" && (
                          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        )}
                        {log.event === "all_guards_passed" && (
                          <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                        )}
                        {log.event !== "guard_blocked" && log.event !== "all_guards_passed" && (
                          <Activity className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-mono font-semibold text-foreground">{log.event}</p>
                          <pre className="text-muted-foreground text-[10px] mt-1 whitespace-pre-wrap break-all">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {latestLog.state_snapshot && Object.keys(latestLog.state_snapshot).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Last state snapshot
                  </summary>
                  <pre className="mt-2 bg-muted/30 rounded-md p-2 whitespace-pre-wrap break-all text-[10px]">
                    {JSON.stringify(latestLog.state_snapshot, null, 2)}
                  </pre>
                </details>
              )}
            </Card>
          );
        })}
      </div>
    </AppLayout>
  );
}
