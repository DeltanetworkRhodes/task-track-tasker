import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Logger για διαγνωστικά του auto-billing / materials-autofill.
 * Τα logs πάνε στον πίνακα auto_system_logs για να μπορεί
 * ο admin να δει τι έγινε όταν ένας τεχνικός άνοιξε ένα SR.
 */
export function useDiagnosticLogger(params: {
  organizationId?: string | null;
  assignmentId?: string | null;
  srId?: string | null;
}) {
  const lastLogRef = useRef<Map<string, number>>(new Map());

  const log = useCallback(
    async (
      system: "auto_billing" | "materials_autofill" | "form_state",
      event: string,
      details: Record<string, any> = {},
      stateSnapshot: Record<string, any> = {},
    ) => {
      if (!params.organizationId) return;

      // De-dupe: μην γράφεις το ίδιο event 2 φορές μέσα σε 500ms
      const key = `${system}:${event}:${JSON.stringify(details).slice(0, 100)}`;
      const now = Date.now();
      const lastTs = lastLogRef.current.get(key) ?? 0;
      if (now - lastTs < 500) return;
      lastLogRef.current.set(key, now);

      try {
        await supabase.from("auto_system_logs" as any).insert({
          organization_id: params.organizationId,
          assignment_id: params.assignmentId ?? null,
          sr_id: params.srId ?? null,
          system,
          event,
          details,
          state_snapshot: stateSnapshot,
        });
      } catch (err) {
        // Μην σπάσει το app αν αποτύχει το logging
        console.warn("[DiagnosticLogger] failed to write log:", err);
      }
    },
    [params.organizationId, params.assignmentId, params.srId],
  );

  return log;
}
