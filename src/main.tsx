import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Cache-busting: detect new version and force reload stale caches
const APP_VERSION = Date.now().toString(); // changes on every build

const checkForUpdates = () => {
  const storedVersion = localStorage.getItem("app_version");
  if (storedVersion && storedVersion !== APP_VERSION) {
    // New version detected — clear caches
    localStorage.setItem("app_version", APP_VERSION);
    if ("caches" in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      });
    }
    // Force reload to get fresh assets
    window.location.reload();
    return;
  }
  localStorage.setItem("app_version", APP_VERSION);
};

checkForUpdates();

createRoot(document.getElementById("root")!).render(<App />);
