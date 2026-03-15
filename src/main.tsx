import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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

createRoot(document.getElementById("root")!).render(<App />);
