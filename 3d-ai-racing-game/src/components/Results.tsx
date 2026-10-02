import { gameHolder } from "../game/Game";
import { trackById, wildcardTrack } from "../game/config";
import { formatShort, formatTime, ordinal, useGameStore } from "../game/store";
import { cn } from "../utils/cn";

const HEADLINES: Record<number, { title: string; sub: string }> = {
  1: { title: "You beat the machines.", sub: "Flawless. They never saw you coming." },
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
        <div
          className="countdown-num title-shadow font-display text-6xl font-extrabold uppercase tracking-[0.15em] text-cream md:text-9xl"
          style={{ animationDuration: "2.4s" }}
        >
          Finish
        </div>
      </div>
    );
  }

  const timeTrial = results.mode === "timetrial";
  const standings = results.standings ?? [];
  const head = HEADLINES[Math.min(4, results.position)];
  const track =
    results.trackId === "wildcard" ? wildcardTrack(settings.wildcardSeed) : trackById(results.trackId);

  const stats: [string, string][] = [
    ["Top speed", `${Math.round(results.topSpeed)} km/h`],
    ["Drift score", results.driftScore.toLocaleString()],
    ["Air time", `${results.airTime.toFixed(1)}s`],
  ];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-ink/50 p-4 backdrop-blur-[2px] safe-pad">
      <div className="panel fade-up my-auto w-[min(96vw,600px)] rounded-3xl p-5 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-cream/55">
              {track.name} · {timeTrial ? "Time trial" : settings.difficulty} · {settings.laps} laps
            </div>
            {!timeTrial && (
              <div className="mt-2 flex items-end gap-2">
                <div className="font-display text-[72px] font-extrabold leading-[0.8] text-cream md:text-[110px]">
                  {results.position}
                </div>
                <div className="font-display mb-1 text-2xl font-bold uppercase text-sand md:text-3xl">
                  {ordinal(results.position)}
                </div>
              </div>
            )}
            <div className="font-display mt-3 text-2xl font-extrabold uppercase leading-none text-cream md:text-4xl">
              {timeTrial ? "Clock stopped." : head.title}
            </div>
            <div className="mt-1 text-sm text-cream/65">
              {timeTrial ? "Every tenth is yours to find." : head.sub}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] uppercase tracking-[0.25em] text-cream/55">Total</div>
            <div className="font-display text-2xl font-bold tabular-nums text-cream md:text-3xl">
              {formatTime(results.totalTime)}
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.25em] text-cream/55">Best lap</div>
            <div className="font-display text-lg font-bold tabular-nums text-sand md:text-xl">
              {formatTime(results.bestLap)}
            </div>
            <div className="mt-2 flex flex-col items-end gap-1">
              {results.isRecordLap && (
                <span className="inline-block rounded-full border border-sand/50 bg-sand/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-sand">
                  Lap record
                </span>
              )}
              {results.isRecordRace && (
                <span className="inline-block rounded-full border border-juniper/60 bg-juniper/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-juniper-bright">
                  Race record
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-cream/10 px-3 py-2">
              <div className="text-[9px] uppercase tracking-[0.2em] text-cream/50">{k}</div>
              <div className="font-display text-lg font-bold tabular-nums text-cream">{v}</div>
            </div>
          ))}
        </div>

        {results.bestSectors.some((s) => s !== null) && (
          <div className="mt-3 flex gap-2">
            {results.bestSectors.map((s, i) => (
              <div key={i} className="flex-1 rounded-lg border border-cream/10 px-2.5 py-1.5">
                <div className="text-[9px] uppercase tracking-[0.2em] text-cream/50">S{i + 1}</div>
                <div className="font-display text-sm font-bold tabular-nums text-sand">{formatShort(s)}</div>
              </div>
            ))}
          </div>
        )}

        {!timeTrial && (
          <div className="mt-5 overflow-hidden rounded-xl border border-cream/10">
            {results.cars.map((c, i) => (
              <div
                key={c.name}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-sm md:px-4",
                  i % 2 === 0 ? "bg-cream/[0.04]" : "bg-transparent",
                  c.isPlayer && "bg-sand/15",
                )}
              >
                <div className="font-display w-5 text-lg font-bold text-cream/70">{i + 1}</div>
                <div
                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/20"
                  style={{ background: "#" + c.color.toString(16).padStart(6, "0") }}
                />
                <div
                  className={cn(
                    "font-display flex-1 truncate text-base font-bold uppercase tracking-wide md:text-lg",
                    c.isPlayer ? "text-cream" : "text-cream/80",
                  )}
                >
                  {c.name}
                </div>
                <div className="hidden text-[11px] uppercase tracking-[0.15em] text-cream/50 sm:block">
                  best {formatShort(c.bestLap)}
                </div>
                <div className="font-display w-24 text-right text-base tabular-nums text-cream/90 md:w-28 md:text-lg">
                  {c.time !== null ? formatTime(c.time) : "DNF"}
                  {c.provisional && c.time !== null && (
                    <span className="ml-1 text-[9px] uppercase tracking-wider text-cream/40">est</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {standings.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-cream/55">
              <span>Championship standings</span>
              {results.seasonRace && (
                <span className="tracking-[0.2em] text-cream/40">
                  Round {results.seasonRace.index} / {results.seasonRace.total}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {standings.map((row, i) => (
                <div
                  key={row.name}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-1.5",
                    row.isPlayer ? "bg-sand/15" : "bg-cream/5",
                  )}
                >
                  <span className="font-display w-5 text-sm tabular-nums text-cream/50">{i + 1}</span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: `#${row.color.toString(16).padStart(6, "0")}` }}
                  />
                  <span
                    className={cn(
                      "flex-1 truncate font-display text-base uppercase",
                      row.isPlayer ? "text-sand" : "text-cream/85",
                    )}
                  >
                    {row.name}
                  </span>
                  {row.gained > 0 && (
                    <span className="text-[11px] uppercase tracking-[0.15em] text-juniper-bright">
                      +{row.gained}
                    </span>
                  )}
                  <span className="font-display w-10 text-right text-base tabular-nums text-cream">
                    {row.points}
                  </span>
                </div>
              ))}
            </div>
            {results.seasonDone && (
              <div className="mt-2 text-sm text-sand">
                Season complete — {standings[0]?.name} takes the title.
              </div>
            )}
          </div>
        )}

        {results.lapTimes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {results.lapTimes.map((t, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg border px-2.5 py-1 font-display text-sm tabular-nums",
                  t === results.bestLap ? "border-sand/60 text-sand" : "border-cream/10 text-cream/70",
                )}
              >
                L{i + 1} {formatShort(t)}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {results.seasonRace && !results.seasonDone && (
            <button
              autoFocus
              onClick={() => gameHolder.game?.nextSeasonRace()}
              className="btn-primary flex-1 rounded-xl px-5 py-3 font-display text-xl font-extrabold uppercase tracking-wider"
            >
              Next round
            </button>
          )}
          {results.seasonDone && (
            <button
              autoFocus
              onClick={() => {
                useGameStore.getState().endSeason();
                gameHolder.game?.quitToMenu();
              }}
              className="btn-primary flex-1 rounded-xl px-5 py-3 font-display text-xl font-extrabold uppercase tracking-wider"
            >
              New season
            </button>
          )}
          <button
            autoFocus={!results.seasonRace}
            onClick={() => gameHolder.game?.restart()}
            className="btn-primary flex-1 rounded-xl px-5 py-3 font-display text-xl font-extrabold uppercase tracking-wider"
          >
            {results.seasonRace ? "Replay round" : "Race again"}
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
