import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Cache-busting: clear all caches and force SW update on every page load
if ("serviceWorker" in navigator) {
  caches.keys().then((names) => {
    names.forEach((name) => caches.delete(name));
  });
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (reg) {
      reg.update();
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
