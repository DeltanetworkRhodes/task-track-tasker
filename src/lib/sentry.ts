import * as Sentry from "@sentry/react";

const SENTRY_DSN =
  "https://049e9984ec7a6a514e80c29a184fdc98@o4511287858036736.ingest.de.sentry.io/4511287889887312";

export function initSentry() {
  // Activate ΜΟΝΟ σε production (όχι σε localhost ή Lovable preview)
  const isProduction =
    typeof window !== "undefined" &&
    window.location.hostname === "deltanetwork.app";

  if (!isProduction) {
    console.log("[Sentry] Disabled (not production)");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: "production",

    // Δείγμα: 100% errors (έχουμε λίγους users — capture όλα)
    tracesSampleRate: 0, // Disable performance monitoring (free quota)
    replaysSessionSampleRate: 0, // Disable session replay (free quota)
    replaysOnErrorSampleRate: 0,

    sendDefaultPii: true,

    // Φιλτράρισμα noisy errors
    ignoreErrors: [
      // Browser extensions
      "top.GLOBALS",
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      // Network errors (συχνά αν χάσει connection ο τεχνικός)
      "NetworkError",
      "Network request failed",
      "Failed to fetch",
      "Load failed",
      // Auth (handled gracefully ήδη)
      "Auth session missing",
      "JWT expired",
      // Cancelled
      "AbortError",
      "cancelled",
    ],

    beforeSend(event, hint) {
      // Skip errors από browser extensions
      const error = hint.originalException as { stack?: string } | undefined;
      if (
        error?.stack?.includes("chrome-extension://") ||
        error?.stack?.includes("moz-extension://")
      ) {
        return null;
      }
      return event;
    },
  });

  console.log("[Sentry] Initialized");
}

// Hook για να συνδέσουμε auth user με Sentry events
export function setSentryUser(user: { id: string; email?: string } | null) {
  if (typeof window === "undefined") return;
  if (window.location.hostname !== "deltanetwork.app") return;

  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: user.id,
    email: user.email,
  });
}
