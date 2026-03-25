import { useEffect, useRef, useCallback, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";

export function useLocationTracking() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { data: userRole } = useUserRole();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const [isOnline, setIsOnline] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const sendLocation = useCallback(async () => {
    if (!user || !organizationId) return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setGpsError(null);
        const now = new Date().toISOString();

        // Update technician_locations table
        await supabase
          .from("technician_locations" as any)
          .upsert(
            {
              user_id: user.id,
              organization_id: organizationId,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              updated_at: now,
            } as any,
            { onConflict: "user_id" }
          );

        // Also update profiles with last known location
        await supabase
          .from("profiles")
          .update({
            last_lat: pos.coords.latitude,
            last_long: pos.coords.longitude,
            last_seen: now,
            is_online: true,
          } as any)
          .eq("user_id", user.id);
      },
      (err) => {
        setGpsError(
          err.code === 1
            ? "Το GPS δεν επιτρέπεται. Ενεργοποιήστε τη τοποθεσία."
            : err.code === 2
            ? "Η τοποθεσία δεν είναι διαθέσιμη."
            : "Timeout GPS. Δοκιμάστε ξανά."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 20000,
      }
    );
  }, [user, organizationId]);

  const goOnline = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setGpsError("Η συσκευή δεν υποστηρίζει GPS.");
      return;
    }

    setIsOnline(true);
    sendLocation();
    intervalRef.current = setInterval(sendLocation, 30000);
  }, [sendLocation]);

  const goOffline = useCallback(async () => {
    setIsOnline(false);
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (user) {
      await supabase
        .from("profiles")
        .update({ is_online: false } as any)
        .eq("user_id", user.id);
    }
  }, [user]);

  // Auto-start for technicians (backward compat)
  useEffect(() => {
    if (userRole !== "technician") return;
    if (!("geolocation" in navigator)) return;

    // Don't auto-start, technician must explicitly go online
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [userRole]);

  // Cleanup on unmount — go offline
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { isOnline, gpsError, goOnline, goOffline };
}
