import { useEffect, useMemo, useState } from "react";
import GameCanvas from "./components/GameCanvas";
import HUD from "./components/HUD";
import Menu from "./components/Menu";
import PauseOverlay from "./components/PauseOverlay";
import Results from "./components/Results";
import TouchControls from "./components/TouchControls";
import { useGameStore } from "./game/store";

function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink">
      <div className="font-display text-5xl font-extrabold uppercase tracking-tight text-cream">
        Sundown <span className="text-sand">Rally</span>
      </div>
      <div className="mt-2 text-[11px] uppercase tracking-[0.3em] text-cream/50">Shaping the desert…</div>
      <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-cream/10">
        <div className="loader-bar h-full w-1/3 rounded-full bg-sand" />
      </div>
    </div>
  );
}

export default function App() {
  const screen = useGameStore((s) => s.screen);
  const loaded = useGameStore((s) => s.loaded);
  const [hideLoader, setHideLoader] = useState(false);

  useEffect(() => {
    if (loaded) {
      const t = setTimeout(() => setHideLoader(true), 500);
      return () => clearTimeout(t);
    }
  }, [loaded]);

  const isTouch = useMemo(
    () => typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0),
    []
  );

  const inRace = screen === "racing" || screen === "countdown" || screen === "paused" || screen === "finished";

  return (
    <div className="fixed inset-0 overflow-hidden">
      <GameCanvas />
      <div className="vignette" />
      {screen === "menu" && <Menu />}
      {inRace && <HUD touch={isTouch} />}
      {isTouch && (screen === "racing" || screen === "countdown") && <TouchControls />}
      {screen === "paused" && <PauseOverlay />}
      {screen === "finished" && <Results />}
      {!hideLoader && (
        <div className={`transition-opacity duration-500 ${loaded ? "pointer-events-none opacity-0" : "opacity-100"}`}>
          <LoadingScreen />
        </div>
      )}
    </div>
  );
}
