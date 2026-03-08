import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Service Worker: force update check (but don't delete caches — needed for offline)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (reg) {
      reg.update();
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
