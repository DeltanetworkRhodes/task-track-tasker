import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type PermissionState = "default" | "granted" | "denied";

export const usePushNotifications = () => {
  const { user } = useAuth();
  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const [permission, setPermission] = useState<PermissionState>(
    isSupported ? (Notification.permission as PermissionState) : "default"
  );

  // Keep permission in sync
  useEffect(() => {
    if (!isSupported) return;
    const check = () => setPermission(Notification.permission as PermissionState);
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !user) return;

    try {
      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);
      if (result !== "granted") {
        toast.error("Δεν δόθηκε άδεια για ειδοποιήσεις");
        return;
      }

      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        toast.error("Λείπει το VAPID key — επικοινωνήστε με τον διαχειριστή");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const applicationServerKey = urlBase64ToUint8Array(vapidKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });

      const json = subscription.toJSON();
      const { error } = await supabase.from("push_subscriptions" as any).upsert(
        {
          user_id: user.id,
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth,
        } as any,
        { onConflict: "user_id,endpoint" }
      );

      if (error) throw error;
      toast.success("Ειδοποιήσεις ενεργοποιήθηκαν ✓");
    } catch (err: any) {
      console.error("Push subscribe error:", err);
      toast.error("Σφάλμα ενεργοποίησης ειδοποιήσεων");
    }
  }, [isSupported, user]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !user) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }

      await supabase
        .from("push_subscriptions" as any)
        .delete()
        .eq("user_id", user.id);

      toast.info("Ειδοποιήσεις απενεργοποιήθηκαν");
    } catch (err: any) {
      console.error("Push unsubscribe error:", err);
      toast.error("Σφάλμα απενεργοποίησης");
    }
  }, [isSupported, user]);

  return { isSupported, permission, subscribe, unsubscribe };
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
