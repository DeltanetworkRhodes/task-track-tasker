import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Cache-busting: clear old SW caches on new deployments
// The PWA plugin with registerType: "autoUpdate" handles SW updates automatically.
// We just ensure stale caches don't persist across deploys.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (reg) {
      reg.update();
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
