import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";

export function useLocationTracking() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { userRole } = useUserRole();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const sendLocation = useCallback(async () => {
    if (!user || !organizationId) return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await supabase
          .from("technician_locations" as any)
          .upsert(
            {
              user_id: user.id,
              organization_id: organizationId,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              updated_at: new Date().toISOString(),
            } as any,
            { onConflict: "user_id" }
          );
      },
      () => {}, // Silent fail
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 20000,
      }
    );
  }, [user, organizationId]);

  useEffect(() => {
    if (userRole !== "technician") return;
    if (!("geolocation" in navigator)) return;

    sendLocation();
    intervalRef.current = setInterval(sendLocation, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [userRole, sendLocation]);
}
