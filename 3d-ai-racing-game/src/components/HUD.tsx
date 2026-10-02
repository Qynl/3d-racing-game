import { useEffect, useRef, useState } from "react";
import { formatTime, ordinal, useGameStore } from "../game/store";
import { gameHolder } from "../game/Game";
import { cn } from "../utils/cn";

function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    gameHolder.game?.setMinimap(c);
    // in case the game is created after mount
    const id = setInterval(() => {
      if (gameHolder.game && c) {
        gameHolder.game.setMinimap(c);
        clearInterval(id);
      }
    }, 200);
    return () => {
      clearInterval(id);
      gameHolder.game?.setMinimap(null);
    };
  }, []);
  return (
    <div className="hud-chip rounded-2xl p-2">
      <canvas ref={ref} width={180} height={180} className="h-[120px] w-[120px] md:h-[150px] md:w-[150px]" />
    </div>
  );
}

function Speedometer({ speed, offTrack, drifting }: { speed: number; offTrack: boolean; drifting: boolean }) {
  const max = 210;
  const frac = Math.min(1, speed / max);
  const r = 54;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.75;
  return (
    <div className="hud-chip relative flex h-[132px] w-[132px] items-center justify-center rounded-full md:h-[160px] md:w-[160px]">
      <svg viewBox="0 0 128 128" className="absolute inset-0 h-full w-full -rotate-[135deg]">
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(243,234,217,0.12)" strokeWidth="6" strokeDasharray={`${arc} ${circ}`} strokeLinecap="round" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={offTrack ? "#d1a03c" : "#e9c48f"}
          strokeWidth="6"
          strokeDasharray={`${arc * frac} ${circ}`}
          strokeLinecap="round"
          className="speed-ring"
        />
      </svg>
      <div className="relative flex flex-col items-center">
        <div className="font-display text-[44px] font-extrabold leading-none tracking-tight text-cream tabular-nums md:text-[54px]">
          {Math.round(speed)}
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.3em] text-cream/55">km/h</div>
        <div
          className={cn(
            "mt-1 text-[9px] uppercase tracking-[0.25em] transition-opacity",
            drifting ? "text-sand opacity-100" : offTrack ? "text-ochre opacity-100" : "opacity-0"
          )}
        >
          {drifting ? "Drift" : "Off track"}
        </div>
      </div>
    </div>
  );
}

export default function HUD({ touch = false }: { touch?: boolean }) {
  const hud = useGameStore((s) => s.hud);
  const screen = useGameStore((s) => s.screen);
  const [finalLapFlash, setFinalLapFlash] = useState(false);
  const prevLap = useRef(hud.lap);

  useEffect(() => {
    const changed = prevLap.current !== hud.lap;
    prevLap.current = hud.lap;
    if (hud.finalLap && changed) {
      setFinalLapFlash(true);
      const t = setTimeout(() => setFinalLapFlash(false), 2600);
      return () => clearTimeout(t);
    }
  }, [hud.lap, hud.finalLap]);

  const racing = screen === "racing" || screen === "paused" || screen === "countdown";
  const showCenter = screen !== "paused";

  return (
    <div className={cn("pointer-events-none fixed inset-0 transition-opacity duration-300", screen === "finished" && "opacity-0")}>
      {/* top left: position + lap */}
      <div className="absolute left-4 top-4 flex items-start gap-3 md:left-7 md:top-6">
        <div className="hud-chip flex items-end gap-1 rounded-2xl px-4 py-2.5 md:px-5 md:py-3">
          <div className="font-display text-[46px] font-extrabold leading-none text-cream md:text-[60px]">{hud.position}</div>
          <div className="mb-1 flex flex-col leading-none">
            <span className="font-display text-lg font-bold uppercase text-sand md:text-xl">{ordinal(hud.position)}</span>
            <span className="text-[10px] uppercase tracking-[0.25em] text-cream/55">of {hud.carCount}</span>
          </div>
        </div>
        <div className="hud-chip rounded-2xl px-4 py-2.5 md:px-5 md:py-3">
          <div className="text-[10px] uppercase tracking-[0.3em] text-cream/55">Lap</div>
          <div className="font-display text-[30px] font-extrabold leading-none text-cream md:text-[38px]">
            {hud.lap}
            <span className="text-lg text-cream/50 md:text-xl">/{hud.totalLaps}</span>
          </div>
        </div>
      </div>

      {/* top center: time */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 md:top-6">
        <div className="hud-chip flex flex-col items-center rounded-2xl px-5 py-2 md:px-7 md:py-2.5">
          <div className="font-display text-[26px] font-bold leading-none tracking-wide text-cream tabular-nums md:text-[32px]">
            {formatTime(hud.time)}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-cream/55">
            <span>Lap {formatTime(hud.currentLapTime).slice(3)}</span>
            {hud.gapAhead !== null && (
              <span className={cn("tabular-nums", hud.gapAhead >= 0 ? "text-ochre" : "text-sand")}>
                {hud.gapAhead >= 0 ? `+${hud.gapAhead.toFixed(1)}s` : `${hud.gapAhead.toFixed(1)}s lead`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* top right: minimap */}
      <div className="absolute right-4 top-4 md:right-7 md:top-6">{racing && <Minimap />}</div>

      {/* bottom left: lap times */}
      <div className="absolute bottom-4 left-4 hidden md:bottom-7 md:left-7 md:block">
        <div className="hud-chip min-w-[170px] rounded-2xl px-4 py-3">
          <div className="mb-1.5 text-[10px] uppercase tracking-[0.3em] text-cream/55">Lap times</div>
          {hud.lapTimes.length === 0 && <div className="font-display text-base text-cream/40">—</div>}
          {hud.lapTimes.map((t, i) => (
            <div key={i} className="flex items-center justify-between gap-6 font-display text-base tabular-nums">
              <span className="text-cream/55">L{i + 1}</span>
              <span className={cn(t === hud.bestLap ? "text-sand" : "text-cream")}>{formatTime(t)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* bottom right: speed */}
      <div className={cn("absolute right-4 md:bottom-7 md:right-7", touch ? "bottom-36" : "bottom-4")}>
        <Speedometer speed={hud.speed} offTrack={hud.offTrack} drifting={hud.drifting} />
      </div>

      {/* center callouts */}
      {showCenter && (
        <div className="absolute inset-0 flex items-center justify-center">
          {hud.countdown > 0 && (
            <div
              key={hud.countdown}
              className="countdown-num title-shadow font-display text-[140px] font-extrabold leading-none text-cream md:text-[200px]"
            >
              {hud.countdown}
            </div>
          )}
          {hud.countdown === 0 && (
            <div key="go" className="countdown-num title-shadow font-display text-[120px] font-extrabold uppercase leading-none text-sand md:text-[180px]">
              Go
            </div>
          )}
          {hud.countdown < 0 && hud.wrongWay && (
            <div className="blink hud-chip rounded-2xl px-6 py-3 font-display text-3xl font-extrabold uppercase tracking-[0.2em] text-ochre md:text-4xl">
              Wrong way
            </div>
          )}
          {hud.countdown < 0 && !hud.wrongWay && finalLapFlash && (
            <div className="countdown-num title-shadow font-display text-6xl font-extrabold uppercase tracking-[0.1em] text-sand md:text-8xl" style={{ animationDuration: "2.4s" }}>
              Final lap
            </div>
          )}
        </div>
      )}
    </div>
  );
}
