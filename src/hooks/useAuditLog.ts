import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";

type AuditAction =
  | "login"
  | "logout"
  | "page_view"
  | "assignment_create"
  | "assignment_update"
  | "assignment_delete"
  | "survey_submit"
  | "construction_submit"
  | "user_role_change"
  | "payment_update"
  | "data_export"
  | "file_upload"
  | "settings_change"
  | string;

export const useAuditLog = () => {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const lastPageLog = useRef<string>("");

  const log = useCallback(
    async (action: AuditAction, details?: Record<string, any>) => {
      if (!user) return;

      try {
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          organization_id: organization?.id || null,
          action,
          details: details || {},
          ip_address: null, // filled server-side if needed
          user_agent: navigator.userAgent,
          page_url: window.location.pathname,
        });
      } catch {
        // silently fail — audit logging should never block UX
      }
    },
    [user, organization]
  );

  // Auto-log page views (deduplicated)
  useEffect(() => {
    if (!user) return;
    const path = window.location.pathname;
    if (path === lastPageLog.current) return;
    lastPageLog.current = path;
    log("page_view", { path });
  }, [user, log]);

  return { log };
};
