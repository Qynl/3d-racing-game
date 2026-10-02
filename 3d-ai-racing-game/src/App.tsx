import { useEffect, useState } from "react";
import GameCanvas from "./components/GameCanvas";
import HUD from "./components/HUD";
import Menu from "./components/Menu";
import PauseOverlay from "./components/PauseOverlay";
import Results from "./components/Results";
import TouchControls from "./components/TouchControls";
import { useGameStore } from "./game/store";

const IS_TOUCH = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);

function LoadingScreen() {
  const progress = useGameStore((s) => s.loadProgress);
  const label = useGameStore((s) => s.loadLabel);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink">
      <div className="font-display text-4xl font-extrabold uppercase tracking-tight text-cream md:text-5xl">
        Sundown <span className="text-sand">Rally</span>
      </div>
      <div className="mt-2 text-[11px] uppercase tracking-[0.3em] text-cream/50">{label}…</div>
      <div className="mt-6 h-1 w-56 overflow-hidden rounded-full bg-cream/10">
        <div
          className="h-full rounded-full bg-sand transition-[width] duration-200 ease-out"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div className="mt-2 font-display text-xs tabular-nums text-cream/40">
        {Math.round(progress * 100)}%
      </div>
    </div>
  );
}

function FatalScreen({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink p-6">
      <div className="panel w-[min(94vw,520px)] rounded-2xl p-7">
        <div className="text-[11px] uppercase tracking-[0.3em] text-clay-bright">Cannot start</div>
        <h1 className="font-display mt-2 text-4xl font-extrabold uppercase leading-none text-cream">
          No signal.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-cream/70">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary mt-6 w-full rounded-xl px-5 py-3 font-display text-xl font-extrabold uppercase tracking-wider"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const screen = useGameStore((s) => s.screen);
  const loaded = useGameStore((s) => s.loaded);
  const fatal = useGameStore((s) => s.fatal);
  const [hideLoader, setHideLoader] = useState(false);

  // Unmount the loader only once its fade-out has finished.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => setHideLoader(true), 450);
    return () => clearTimeout(t);
  }, [loaded]);

  const inRace =
    screen === "racing" || screen === "countdown" || screen === "paused" || screen === "finished";

  return (
    <div className="fixed inset-0 overflow-hidden">
      <GameCanvas />
      <div className="vignette" />
      {!fatal && screen === "menu" && <Menu />}
      {!fatal && inRace && <HUD touch={IS_TOUCH} />}
      {!fatal && IS_TOUCH && (screen === "racing" || screen === "countdown") && <TouchControls />}
      {!fatal && screen === "paused" && <PauseOverlay />}
      {!fatal && screen === "finished" && <Results />}
      {(!loaded || !hideLoader) && !fatal && (
        <div
          className={`transition-opacity duration-500 ${loaded ? "pointer-events-none opacity-0" : "opacity-100"}`}
        >
          <LoadingScreen />
        </div>
      )}
      {fatal && <FatalScreen message={fatal} />}
    </div>
  );
}
