import { useEffect, useRef, useState } from "react";
import { gameHolder } from "../game/Game";
import { SECTOR_COUNT } from "../game/config";
import type { HudData } from "../game/store";
import { formatDelta, formatGap, formatShort, formatTime, ordinal, useGameStore } from "../game/store";
import { cn } from "../utils/cn";
import Toasts from "./Toasts";

const SECTOR_FLASH_MS = 2400;

/** Live timing tower: the running order with gaps to the leader. */
function TimingTower() {
  const order = useGameStore((s) => s.hud.order);
  if (order.length < 2) return null;
  return (
    <div className="hud-chip mt-2 hidden w-[186px] rounded-2xl px-2.5 py-2 md:block">
      <div className="mb-1 px-1 text-[9px] uppercase tracking-[0.3em] text-cream/50">Order</div>
      <ol>
        {order.map((row, i) => (
          <li
            key={row.name}
            className={cn(
              "flex items-center gap-1.5 rounded px-1 py-[3px] text-[11px] tabular-nums",
              row.isPlayer ? "bg-sand/15 text-cream" : "text-cream/70",
            )}
          >
            <span className="w-3 text-right font-display font-bold text-cream/50">{i + 1}</span>
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: `#${row.color.toString(16).padStart(6, "0")}` }}
            />
            <span className="flex-1 truncate font-display font-semibold uppercase tracking-wide">
              {row.name}
            </span>
            <span className="text-[10px] text-cream/55">
              {i === 0 ? "LEAD" : row.gap === null ? "—" : `+${row.gap.toFixed(1)}`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    // Registers as soon as the game exists — and again if it is rebuilt.
    const unsubscribe = gameHolder.subscribe((game) => game?.setMinimap(c));
    return () => {
      unsubscribe();
      gameHolder.game?.setMinimap(null);
    };
  }, []);
  return (
    <div className="hud-chip rounded-2xl p-2">
      <canvas
        ref={ref}
        width={180}
        height={180}
        className="h-[104px] w-[104px] md:h-[150px] md:w-[150px]"
        aria-hidden
      />
    </div>
  );
}

function Speedometer({
  speed,
  gear,
  boost,
  boosting,
  offTrack,
  drifting,
}: {
  speed: number;
  gear: number;
  boost: number;
  boosting: boolean;
  offTrack: boolean;
  drifting: boolean;
}) {
  const max = 230;
  const frac = Math.min(1, speed / max);
  const r = 54;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.75;
  const rb = 44;
  const circB = 2 * Math.PI * rb;
  const arcB = circB * 0.75;
  return (
    <div className="hud-chip relative flex h-[124px] w-[124px] items-center justify-center rounded-full md:h-[160px] md:w-[160px]">
      <svg viewBox="0 0 128 128" className="absolute inset-0 h-full w-full -rotate-[135deg]">
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="rgba(243,234,217,0.12)"
          strokeWidth="6"
          strokeDasharray={`${arc} ${circ}`}
          strokeLinecap="round"
        />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={boosting ? "#ffb257" : offTrack ? "#d1a03c" : "#e9c48f"}
          strokeWidth="6"
          strokeDasharray={`${arc * frac} ${circ}`}
          strokeLinecap="round"
          className="speed-ring"
        />
        <circle
          cx="64"
          cy="64"
          r={rb}
          fill="none"
          stroke="rgba(93,214,255,0.1)"
          strokeWidth="3"
          strokeDasharray={`${arcB} ${circB}`}
          strokeLinecap="round"
        />
        <circle
          cx="64"
          cy="64"
          r={rb}
          fill="none"
          stroke={boost > 0.33 ? "#5fd6ff" : "#2f7f9c"}
          strokeWidth="3"
          strokeDasharray={`${arcB * Math.min(1, boost)} ${circB}`}
          strokeLinecap="round"
          className="speed-ring"
        />
      </svg>
      <div className="relative flex flex-col items-center">
        <div className="font-display text-[40px] font-extrabold leading-none tracking-tight text-cream tabular-nums md:text-[52px]">
          {Math.round(speed)}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-cream/55">
          <span>km/h</span>
          <span className="font-display text-sm tracking-normal text-sand">
            {gear === 0 ? "R" : `G${gear}`}
          </span>
        </div>
        <div
          className={cn(
            "mt-0.5 text-[9px] uppercase tracking-[0.25em] transition-opacity",
            boosting
              ? "text-ochre opacity-100"
              : drifting
                ? "text-sand opacity-100"
                : offTrack
                  ? "text-ochre opacity-100"
                  : "opacity-0",
          )}
        >
          {boosting ? "Boost" : drifting ? "Drift" : "Off track"}
        </div>
      </div>
    </div>
  );
}

function SectorFlash() {
  const flash = useGameStore((s) => s.hud.sectorFlash);
  // Remounted per flash via the key, so each one gets its own hide timer.
  if (!flash) return null;
  return <SectorFlashCard key={flash.at} flash={flash} />;
}

function SectorFlashCard({ flash }: { flash: NonNullable<HudData["sectorFlash"]> }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), SECTOR_FLASH_MS);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  const good = flash.delta !== null && flash.delta < 0;
  return (
    <div
      className={cn(
        "fade-up hud-chip mt-2 rounded-xl px-3 py-2 text-right",
        good ? "border-juniper/50" : flash.delta === null ? "" : "border-clay/50",
      )}
    >
      <div className="text-[9px] uppercase tracking-[0.25em] text-cream/55">Sector {flash.index + 1}</div>
      <div
        className={cn(
          "font-display text-lg font-bold tabular-nums leading-none",
          flash.delta === null ? "text-sand" : good ? "text-juniper-bright" : "text-clay-bright",
        )}
      >
        {flash.delta === null ? "Set" : formatDelta(flash.delta)}
      </div>
    </div>
  );
}

/** Launch-control rev meter shown while the lights are on. */
function RevMeter({ revs }: { revs: number }) {
  const inBand = revs >= 0.5 && revs <= 0.92;
  return (
    <div className="hud-chip w-[220px] rounded-2xl px-4 py-3 md:w-[300px]">
      <div className="mb-1.5 flex items-center justify-between text-[9px] uppercase tracking-[0.25em] text-cream/55">
        <span>Launch revs</span>
        <span className={cn(inBand ? "text-juniper-bright" : "text-cream/40")}>
          {inBand ? "Hold it" : revs > 0.92 ? "Lift off" : "Build revs"}
        </span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-cream/10">
        {/* the green band you want to be in when the lights go out */}
        <div className="absolute inset-y-0 left-[50%] w-[42%] bg-juniper/35" />
        <div
          className={cn(
            "relative h-full rounded-full",
            revs > 0.92 ? "bg-clay-bright" : inBand ? "bg-juniper-bright" : "bg-sand",
          )}
          style={{ width: `${Math.round(revs * 100)}%` }}
        />
      </div>
    </div>
  );
}

function DamageBar({ damage }: { damage: number }) {
  if (damage < 0.06) return null;
  return (
    <div className="hud-chip mt-2 flex items-center gap-2 rounded-xl px-3 py-1.5">
      <span className="text-[9px] uppercase tracking-[0.25em] text-cream/55">Damage</span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-cream/10 md:w-28">
        <div
          className={cn("h-full rounded-full", damage > 0.5 ? "bg-clay-bright" : "bg-ochre")}
          style={{ width: `${Math.round(Math.min(1, damage) * 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function HUD({ touch = false }: { touch?: boolean }) {
  const hud = useGameStore((s) => s.hud);
  const screen = useGameStore((s) => s.screen);
  const fps = useGameStore((s) => s.fps);
  const showFps = useGameStore((s) => s.settings.autoQuality);
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

  const reduced = useGameStore((s) => s.settings.reducedMotion);
  const racing = screen === "racing" || screen === "paused" || screen === "countdown";
  const speedFrac = Math.min(1, Math.max(0, (hud.speed - 115) / 115));
  const showCenter = screen !== "paused";
  const deltaGood = hud.delta !== null && hud.delta < 0;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 transition-opacity duration-300 safe-pad",
        screen === "finished" && "opacity-0",
      )}
    >
      {/* speed lines — purely cosmetic, off when motion is reduced */}
      {!reduced && speedFrac > 0.02 && (
        <div
          className="speed-lines pointer-events-none absolute inset-0"
          style={{ opacity: speedFrac * (hud.boosting ? 0.95 : 0.6) }}
          aria-hidden
        />
      )}

      {/* conditions chip */}
      {hud.conditions !== "" && (
        <div className="absolute left-1/2 top-[96px] -translate-x-1/2 md:top-[112px]">
          <div
            className={cn(
              "hud-chip rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.25em]",
              hud.lowGrip ? "border-clay/50 text-clay-bright" : "text-cream/55",
            )}
          >
            {hud.conditions}
            {hud.lowGrip && " · low grip"}
          </div>
        </div>
      )}

      {/* top left: position + lap */}
      <div className="absolute left-4 top-4 flex items-start gap-2 md:left-7 md:top-6 md:gap-3">
        <div
          className="hud-chip flex items-end gap-1 rounded-2xl px-3 py-2 md:px-5 md:py-3"
          aria-live="polite"
        >
          <div className="font-display text-[38px] font-extrabold leading-none text-cream md:text-[60px]">
            {hud.position}
          </div>
          <div className="mb-1 flex flex-col leading-none">
            <span className="font-display text-base font-bold uppercase text-sand md:text-xl">
              {ordinal(hud.position)}
            </span>
            <span className="text-[9px] uppercase tracking-[0.25em] text-cream/55 md:text-[10px]">
              of {hud.carCount}
            </span>
          </div>
        </div>
        <div className="hud-chip rounded-2xl px-3 py-2 md:px-5 md:py-3">
          <div className="text-[9px] uppercase tracking-[0.3em] text-cream/55 md:text-[10px]">Lap</div>
          <div className="font-display text-[26px] font-extrabold leading-none text-cream md:text-[38px]">
            {hud.lap}
            <span className="text-base text-cream/50 md:text-xl">/{hud.totalLaps}</span>
          </div>
        </div>
      </div>

      {/* top center: time + delta */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 md:top-6">
        <div className="hud-chip flex flex-col items-center rounded-2xl px-4 py-2 md:px-7 md:py-2.5">
          <div className="font-display text-[22px] font-bold leading-none tracking-wide text-cream tabular-nums md:text-[32px]">
            {formatTime(hud.time)}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-cream/55">
            <span className="tabular-nums">Lap {formatShort(hud.currentLapTime)}</span>
            {hud.delta !== null && (
              <span
                className={cn(
                  "font-display tabular-nums",
                  deltaGood ? "text-juniper-bright" : "text-clay-bright",
                )}
              >
                {formatDelta(hud.delta)}
              </span>
            )}
          </div>
          {(hud.gapAhead !== null || hud.gapBehind !== null) && (
            <div
              className={cn(
                "mt-1 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] tabular-nums",
                hud.battle ? "text-cream/80" : "text-cream/45",
              )}
            >
              {hud.gapAhead !== null && (
                <span className="text-ochre">
                  ▲ {hud.rivalAhead ?? ""} {formatGap(hud.gapAhead)}
                </span>
              )}
              {hud.gapBehind !== null && (
                <span className="text-sand">
                  ▼ {hud.rivalBehind ?? ""} {formatGap(hud.gapBehind)}
                </span>
              )}
            </div>
          )}
          {hud.battle && (
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-clay-bright/50 bg-clay/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.25em] text-clay-bright">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clay-bright" />
              Battle
            </div>
          )}
        </div>
        <SectorFlash />
      </div>

      {/* top right: minimap + toasts */}
      <div className="absolute right-4 top-4 flex flex-col items-end md:right-7 md:top-6">
        {racing && <Minimap />}
        {racing && <TimingTower />}
        <Toasts />
      </div>

      {/* bottom left: lap + sector times */}
      <div className="absolute bottom-4 left-4 hidden md:bottom-7 md:left-7 md:block">
        <div className="hud-chip min-w-[186px] rounded-2xl px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-cream/55">
            <span>Lap times</span>
            {showFps && <span className="tracking-normal text-cream/35">{fps} fps</span>}
          </div>
          {hud.lapTimes.length === 0 && <div className="font-display text-base text-cream/40">—</div>}
          {hud.lapTimes.slice(-5).map((t, i) => {
            const n = hud.lapTimes.length - Math.min(5, hud.lapTimes.length) + i + 1;
            return (
              <div
                key={n}
                className="flex items-center justify-between gap-6 font-display text-base tabular-nums"
              >
                <span className="text-cream/55">L{n}</span>
                <span className={cn(t === hud.sessionBestLap ? "text-sand" : "text-cream")}>
                  {formatTime(t)}
                </span>
              </div>
            );
          })}
          <div className="mt-2 flex gap-1.5">
            {Array.from({ length: SECTOR_COUNT }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i === hud.sectorIndex ? "bg-sand" : "bg-cream/15",
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* bottom centre: boost + drift */}
      <div
        className={cn(
          "absolute left-1/2 -translate-x-1/2",
          touch ? "bottom-[150px]" : "bottom-4 md:bottom-7",
        )}
      >
        <div className="hud-chip flex items-center gap-3 rounded-2xl px-4 py-2">
          <div className="text-[9px] uppercase tracking-[0.25em] text-cream/55">Boost</div>
          <div className="relative h-2.5 w-28 overflow-hidden rounded-full bg-cream/10 md:w-40">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-150",
                hud.boosting ? "bg-ochre" : hud.boost > 0.33 ? "bg-[#5fd6ff]" : "bg-[#2f7f9c]",
              )}
              style={{ width: `${Math.round(hud.boost * 100)}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 w-full origin-left border-r border-cream/30"
              style={{ transform: `scaleX(${hud.driftCombo})`, pointerEvents: "none" }}
            />
          </div>
          {hud.driftScore > 0 && (
            <div className="font-display text-sm font-bold tabular-nums text-sand">
              {hud.driftScore.toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* bottom right: speed */}
      <div className={cn("absolute right-4 md:bottom-7 md:right-7", touch ? "bottom-[150px]" : "bottom-4")}>
        {hud.draft > 0.12 && (
          <div className="hud-chip mb-2 flex items-center justify-end gap-2 rounded-xl px-3 py-1.5">
            <span className="text-[9px] uppercase tracking-[0.25em] text-cream/55">Slipstream</span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-cream/10">
              <div
                className="h-full rounded-full bg-[#5fd6ff]"
                style={{ width: `${Math.round(hud.draft * 100)}%` }}
              />
            </div>
          </div>
        )}
        <Speedometer
          speed={hud.speed}
          gear={hud.gear}
          boost={hud.boost}
          boosting={hud.boosting}
          offTrack={hud.offTrack}
          drifting={hud.drifting}
        />
        <DamageBar damage={hud.damage} />
      </div>

      {/* center callouts */}
      {showCenter && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div aria-live="assertive" className="sr-only">
            {hud.countdown > 0 ? hud.countdown : hud.countdown === 0 ? "Go" : ""}
          </div>
          {hud.countdown > 0 && (
            <div
              key={hud.countdown}
              className="countdown-num title-shadow font-display text-[120px] font-extrabold leading-none text-cream md:text-[200px]"
            >
              {hud.countdown}
            </div>
          )}
          {hud.countdown > 0 && <RevMeter revs={hud.revs} />}
          {!!hud.launchRating && hud.countdown <= 0 && (
            <div
              className={cn(
                "fade-up hud-chip rounded-xl px-5 py-2 font-display text-xl font-bold uppercase tracking-[0.18em]",
                hud.launchRating === "Perfect launch"
                  ? "text-juniper-bright"
                  : hud.launchRating === "Wheelspin" || hud.launchRating === "Asleep"
                    ? "text-clay-bright"
                    : "text-sand",
              )}
            >
              {hud.launchRating}
            </div>
          )}
          {hud.countdown === 0 && (
            <div
              key="go"
              className="countdown-num title-shadow font-display text-[110px] font-extrabold uppercase leading-none text-sand md:text-[180px]"
            >
              Go
            </div>
          )}
          {hud.countdown < 0 && hud.wrongWay && (
            <div className="blink hud-chip rounded-2xl px-6 py-3 font-display text-2xl font-extrabold uppercase tracking-[0.2em] text-ochre md:text-4xl">
              Wrong way
            </div>
          )}
          {hud.countdown < 0 && hud.lapInvalid && !hud.wrongWay && (
            <div className="hud-chip rounded-2xl px-5 py-2 font-display text-lg font-bold uppercase tracking-[0.2em] text-clay-bright">
              Lap invalid — rejoin the track
            </div>
          )}
          {hud.countdown < 0 && hud.airborne && (
            <div className="countdown-num font-display text-5xl font-extrabold uppercase tracking-[0.1em] text-sand md:text-7xl">
              Air
            </div>
          )}
          {hud.countdown < 0 && !hud.wrongWay && finalLapFlash && (
            <div
              className="countdown-num title-shadow font-display text-5xl font-extrabold uppercase tracking-[0.1em] text-sand md:text-8xl"
              style={{ animationDuration: "2.4s" }}
            >
              Final lap
            </div>
          )}
          {hud.stuck && (
            <div className="hud-chip blink rounded-xl px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-cream/80">
              Press R to respawn
            </div>
          )}
        </div>
      )}
    </div>
  );
}
