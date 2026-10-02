import { formatTime, ordinal, useGameStore } from "../game/store";
import { gameHolder } from "../game/Game";
import { cn } from "../utils/cn";

const HEADLINES: Record<number, { title: string; sub: string }> = {
  1: { title: "You beat the machines.", sub: "Flawless. The AI never saw you coming." },
  2: { title: "So close.", sub: "One more clean lap and the win is yours." },
  3: { title: "Podium.", sub: "The machines are quick — but they can be beaten." },
  4: { title: "Outpaced.", sub: "Study the lines. Brake later. Go again." },
};

export default function Results() {
  const results = useGameStore((s) => s.results);
  const settings = useGameStore((s) => s.settings);

  if (!results) {
    return (
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="countdown-num title-shadow font-display text-7xl font-extrabold uppercase tracking-[0.15em] text-cream md:text-9xl" style={{ animationDuration: "2.4s" }}>
          Finish
        </div>
      </div>
    );
  }

  const head = HEADLINES[Math.min(4, results.position)];

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]">
      <div className="panel fade-up w-[min(94vw,560px)] rounded-3xl p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-cream/55">
              Race complete · {settings.difficulty} · {results.lapTimes.length} laps
            </div>
            <div className="mt-2 flex items-end gap-2">
              <div className="font-display text-[88px] font-extrabold leading-[0.8] text-cream md:text-[110px]">{results.position}</div>
              <div className="font-display mb-1 text-3xl font-bold uppercase text-sand">{ordinal(results.position)}</div>
            </div>
            <div className="font-display mt-3 text-3xl font-extrabold uppercase leading-none text-cream md:text-4xl">{head.title}</div>
            <div className="mt-1 text-sm text-cream/65">{head.sub}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.25em] text-cream/55">Total</div>
            <div className="font-display text-3xl font-bold tabular-nums text-cream">{formatTime(results.totalTime)}</div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.25em] text-cream/55">Best lap</div>
            <div className="font-display text-xl font-bold tabular-nums text-sand">{formatTime(results.bestLap)}</div>
            {results.isRecord && (
              <div className="mt-2 inline-block rounded-full border border-sand/50 bg-sand/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-sand">
                New record
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-cream/10">
          {results.cars.map((c, i) => (
            <div
              key={c.name}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 text-sm",
                i % 2 === 0 ? "bg-cream/[0.04]" : "bg-transparent",
                c.isPlayer && "bg-sand/15"
              )}
            >
              <div className="font-display w-6 text-lg font-bold text-cream/70">{i + 1}</div>
              <div className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ background: "#" + c.color.toString(16).padStart(6, "0") }} />
              <div className={cn("font-display flex-1 text-lg font-bold uppercase tracking-wide", c.isPlayer ? "text-cream" : "text-cream/80")}>
                {c.name}
              </div>
              <div className="hidden text-[11px] uppercase tracking-[0.15em] text-cream/50 sm:block">
                best {formatTime(c.bestLap).slice(3)}
              </div>
              <div className="font-display w-28 text-right text-lg tabular-nums text-cream/90">{c.time !== null ? formatTime(c.time) : "DNF"}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => gameHolder.game?.restart()}
            className="btn-primary flex-1 rounded-xl px-5 py-3 font-display text-xl font-extrabold uppercase tracking-wider"
          >
            Race again
          </button>
          <button
            onClick={() => gameHolder.game?.quitToMenu()}
            className="btn-ghost flex-1 rounded-xl px-5 py-3 font-display text-xl font-bold uppercase tracking-wider"
          >
            Main menu
          </button>
        </div>
      </div>
    </div>
  );
}
