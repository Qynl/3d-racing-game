import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted, latin-only font subsets so the single-file build works offline.
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

// Offline support. The production build is one self-contained HTML file, so a
// single cached document is a fully playable game with no connection at all.
// Dev builds skip this (and tear down any worker left over from a prod visit)
// so hot reload keeps working.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
        /* offline play is a bonus, never a requirement */
      });
    });
  } else {
    void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
