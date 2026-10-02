import { useEffect } from "react";
import { gameHolder } from "../game/Game";
import { formatTime, useGameStore, type ReplayCamera } from "../game/store";
import { cn } from "../utils/cn";

const CAMERAS: { id: ReplayCamera; label: string }[] = [
  { id: "trackside", label: "Trackside" },
  { id: "chase", label: "Chase" },
  { id: "heli", label: "Heli" },
  { id: "cockpit", label: "Cockpit" },
];

const SPEEDS = [0.25, 0.5, 1, 2];

/**
 * Replay director controls.
 *
 * Deliberately keyboard-first — space to play, arrows to scrub, C to cut to the
 * next camera, Tab to follow the next car — because that is how anyone actually
 * reviews a race.
 */
export default function ReplayOverlay() {
  const replay = useGameStore((s) => s.replay);
  const setReplay = useGameStore((s) => s.setReplay);

  useEffect(() => {
    if (!replay.active) return;
    const onKey = (e: KeyboardEvent) => {
      const game = gameHolder.game;
      const state = useGameStore.getState().replay;
      switch (e.key) {
        case " ":
          e.preventDefault();
          setReplay({ playing: !state.playing });
          break;
        case "ArrowLeft":
          game?.seekReplay(state.time - (e.shiftKey ? 10 : 2));
          break;
        case "ArrowRight":
          game?.seekReplay(state.time + (e.shiftKey ? 10 : 2));
          break;
        case "c":
        case "C": {
          const i = CAMERAS.findIndex((c) => c.id === state.camera);
          setReplay({ camera: CAMERAS[(i + 1) % CAMERAS.length].id });
          break;
        }
        case "Tab": {
          e.preventDefault();
          if (state.cars.length > 0) {
            setReplay({ focus: (state.focus + 1) % state.cars.length });
          }
          break;
        }
        case "Escape":
          game?.stopReplay();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replay.active, setReplay]);

  if (!replay.active) return null;
  const focused = replay.cars[replay.focus];
  const pct = replay.duration > 0 ? (replay.time / replay.duration) * 100 : 0;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex flex-col justify-between safe-pad">
      <div className="flex items-start justify-between p-4 md:p-6">
        <div className="hud-chip pointer-events-auto rounded-2xl px-4 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.3em] text-cream/55">Replay</div>
          <div className="font-display text-xl font-extrabold uppercase tracking-wide text-cream">
            {focused?.name ?? "—"}
          </div>
        </div>
        <button
          onClick={() => gameHolder.game?.stopReplay()}
          className="pointer-events-auto rounded-xl border border-cream/25 bg-ink/70 px-4 py-2 font-display text-sm font-bold uppercase tracking-wider text-cream hover:border-cream/60"
        >
          Close
        </button>
      </div>

      <div className="pointer-events-auto m-3 rounded-2xl border border-cream/10 bg-ink/80 p-3 backdrop-blur-sm md:m-6 md:p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setReplay({ playing: !replay.playing })}
            aria-label={replay.playing ? "Pause replay" : "Play replay"}
            className="font-display h-10 w-10 shrink-0 rounded-full border border-cream/30 text-lg font-bold text-cream hover:border-cream/70"
          >
            {replay.playing ? "❙❙" : "▶"}
          </button>
          <span className="font-display w-16 shrink-0 text-sm tabular-nums text-cream/80">
            {formatTime(replay.time)}
          </span>
          <div className="relative h-6 flex-1">
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-cream/15">
              <div className="h-full rounded-full bg-sand" style={{ width: `${pct}%` }} />
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, replay.duration)}
              step={0.05}
              value={replay.time}
              aria-label="Replay position"
              onChange={(e) => gameHolder.game?.seekReplay(Number(e.target.value))}
              className="absolute inset-0 w-full cursor-pointer opacity-0"
            />
          </div>
          <span className="font-display w-16 shrink-0 text-right text-sm tabular-nums text-cream/50">
            {formatTime(replay.duration)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {CAMERAS.map((c) => (
            <button
              key={c.id}
              onClick={() => setReplay({ camera: c.id })}
              className={cn(
                "seg rounded-lg px-3 py-1.5 text-[11px] uppercase tracking-[0.15em]",
                replay.camera === c.id && "active",
              )}
            >
              {c.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-cream/15" />
          {SPEEDS.map((v) => (
            <button
              key={v}
              onClick={() => setReplay({ speed: v })}
              className={cn(
                "seg rounded-lg px-2.5 py-1.5 font-display text-[11px] font-bold tabular-nums",
                replay.speed === v && "active",
              )}
            >
              {v}×
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-cream/15" />
          <div className="flex flex-wrap gap-1.5">
            {replay.cars.map((c, i) => (
              <button
                key={c.name}
                onClick={() => setReplay({ focus: i })}
                aria-label={`Follow ${c.name}`}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] uppercase tracking-wide",
                  replay.focus === i ? "bg-sand/20 text-cream" : "text-cream/55 hover:text-cream",
                )}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: `#${c.color.toString(16).padStart(6, "0")}` }}
                />
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 text-[9px] uppercase tracking-[0.2em] text-cream/35">
          Space play · ← → scrub · C camera · Tab next car · Esc close
        </div>
      </div>
    </div>
  );
}
