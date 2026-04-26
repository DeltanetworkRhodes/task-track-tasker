import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import { initSentry } from "./lib/sentry";

initSentry();

// Copyright protection - disable right-click & dev tools shortcuts
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if (
    e.key === 'F12' ||
    (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j')) ||
    (e.ctrlKey && (e.key === 'U' || e.key === 'u'))
  ) {
    e.preventDefault();
  }
});

// Service Worker: force update check (but don't delete caches — needed for offline)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (reg) {
      reg.update();
    }
  });
}

const SentryWrappedApp = Sentry.withErrorBoundary(App, {
  fallback: ({ resetError }) => (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        textAlign: "center",
        background: "#0f172a",
        color: "#f1f5f9",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", marginBottom: "1rem" }}>
        ⚠️ Κάτι πήγε στραβά
      </h1>
      <p style={{ maxWidth: "480px", marginBottom: "2rem", opacity: 0.8 }}>
        Το πρόβλημα έχει καταγραφεί αυτόματα. Δοκίμασε ξανά ή κάνε refresh τη σελίδα.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={resetError}
          style={{
            padding: "0.5rem 1.5rem",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "0.5rem",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Δοκίμασε Ξανά
        </button>
        <button
          onClick={() => (window.location.href = "/")}
          style={{
            padding: "0.5rem 1.5rem",
            background: "white",
            color: "#3b82f6",
            border: "1px solid #3b82f6",
            borderRadius: "0.5rem",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Πίσω στην Αρχική
        </button>
      </div>
    </div>
  ),
  showDialog: false,
});

createRoot(document.getElementById("root")!).render(<SentryWrappedApp />);
