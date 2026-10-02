import { CAR_COLORS, Difficulty, formatTime, useGameStore } from "../game/store";
import { gameHolder } from "../game/Game";
import { cn } from "../utils/cn";

const DIFFS: { id: Difficulty; label: string; desc: string }[] = [
  { id: "rookie", label: "Rookie", desc: "Forgiving rivals" },
  { id: "pro", label: "Pro", desc: "A real fight" },
  { id: "legend", label: "Legend", desc: "Flawless machines" },
];

export default function Menu() {
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  const bestTimes = useGameStore((s) => s.bestTimes);
  const loaded = useGameStore((s) => s.loaded);

  const start = () => {
    if (!loaded) return;
    gameHolder.game?.startRace(useGameStore.getState().settings);
  };

  const best = bestTimes[settings.difficulty];

  return (
    <div className="pointer-events-none fixed inset-0 flex flex-col">
      {/* top bar */}
      <div className="flex items-center justify-between px-6 pt-5 md:px-10">
        <div className="fade-up flex items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-cream/60">
          <span className="h-px w-8 bg-cream/30" />
          Golden Hour Circuit
        </div>
        <button
          onClick={() => {
            const m = !settings.muted;
            setSettings({ muted: m });
            gameHolder.game?.setMuted(m);
          }}
          className="btn-ghost pointer-events-auto rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.25em]"
        >
          {settings.muted ? "Sound off" : "Sound on"}
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-end px-6 pb-6 md:flex-row md:items-end md:justify-between md:px-10 md:pb-10">
        {/* title */}
        <div className="mb-6 md:mb-0 md:max-w-xl">
          <h1 className="title-shadow fade-up font-display text-[72px] font-extrabold uppercase leading-[0.86] tracking-tight text-cream sm:text-[96px] md:text-[128px]">
            Sundown
            <br />
            <span className="text-sand">Rally</span>
          </h1>
          <p className="fade-up fade-up-1 mt-4 max-w-md font-body text-sm leading-relaxed text-cream/70 md:text-base">
            Three laps of hard-packed desert against three relentless AI drivers. Brake late, slide through
            the hairpins, and beat the machines before the sun goes down.
          </p>
          <div className="fade-up fade-up-2 mt-5 hidden flex-wrap gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.22em] text-cream/55 md:flex">
            <span><kbd className="text-cream/90">W A S D</kbd> / arrows · drive</span>
            <span><kbd className="text-cream/90">Space</kbd> · handbrake</span>
            <span><kbd className="text-cream/90">C</kbd> · camera</span>
            <span><kbd className="text-cream/90">Esc</kbd> · pause</span>
          </div>
        </div>

        {/* settings panel */}
        <div className="panel pointer-events-auto fade-up fade-up-2 w-full rounded-2xl p-5 md:w-[380px] md:p-6">
          <div className="mb-4">
            <div className="mb-2 text-[11px] uppercase tracking-[0.25em] text-cream/55">Rival difficulty</div>
            <div className="grid grid-cols-3 gap-2">
              {DIFFS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSettings({ difficulty: d.id })}
                  className={cn("seg rounded-xl px-2 py-2.5 text-left", settings.difficulty === d.id && "active")}
                >
                  <div className="font-display text-lg font-bold uppercase leading-none tracking-wide">{d.label}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.12em] opacity-70">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-[1fr_auto] gap-4">
            <div>
              <div className="mb-2 text-[11px] uppercase tracking-[0.25em] text-cream/55">Livery</div>
              <div className="flex gap-2">
                {CAR_COLORS.map((c, i) => (
                  <button
                    key={c.name}
                    title={c.name}
                    onClick={() => setSettings({ carColor: i })}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-transform",
                      settings.carColor === i ? "scale-110 border-cream" : "border-white/15 hover:scale-105"
                    )}
                    style={{ background: "#" + c.hex.toString(16).padStart(6, "0") }}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11px] uppercase tracking-[0.25em] text-cream/55">Laps</div>
              <div className="flex gap-1.5">
                {[2, 3, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setSettings({ laps: n })}
                    className={cn("seg h-8 w-9 rounded-lg font-display text-base font-bold", settings.laps === n && "active")}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={start}
            disabled={!loaded}
            className="btn-primary flex w-full items-center justify-between rounded-xl px-5 py-3.5 font-display text-2xl font-extrabold uppercase tracking-wider disabled:opacity-60"
          >
            <span>{loaded ? "Start race" : "Building circuit…"}</span>
            <span className="text-base opacity-80">→</span>
          </button>

          <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-cream/50">
            <span>Best · {DIFFS.find((d) => d.id === settings.difficulty)?.label}</span>
            <span className="font-display text-base tracking-wide text-sand">{best ? formatTime(best) : "No time set"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
