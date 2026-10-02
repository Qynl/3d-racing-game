import { useCallback, useEffect, useRef, useState } from "react";
import { gameHolder } from "../game/Game";
import { TouchState } from "../game/input";
import { useGameStore } from "../game/store";
import { cn } from "../utils/cn";

type HoldKey = Exclude<keyof TouchState, "axis">;

function useHold(id: HoldKey) {
  const [pressed, setPressed] = useState(false);
  const set = useCallback(
    (v: boolean) => {
      setPressed(v);
      const g = gameHolder.game;
      if (g) g.input.touch[id] = v;
    },
    [id],
  );
  // Safety net: a pointer released outside the element must still let go.
  useEffect(() => {
    const release = () => set(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
      set(false);
    };
  }, [set]);
  return [pressed, set] as const;
}

function TouchButton({
  id,
  label,
  className,
  sub,
}: {
  id: HoldKey;
  label: string;
  className?: string;
  sub?: string;
}) {
  const [pressed, set] = useHold(id);
  return (
    <button
      aria-label={label}
      className={cn(
        "touch-btn flex select-none flex-col items-center justify-center rounded-2xl font-display font-bold uppercase tracking-wider",
        pressed && "pressed",
        className,
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span>{label}</span>
      {sub && <span className="mt-0.5 text-[9px] tracking-[0.2em] opacity-60">{sub}</span>}
    </button>
  );
}

function SteerPad() {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(0);
  const active = useRef(false);

  const apply = useCallback((clientX: number) => {
    const el = ref.current;
    const g = gameHolder.game;
    if (!el || !g) return;
    const r = el.getBoundingClientRect();
    const v = Math.max(-1, Math.min(1, ((clientX - r.left) / r.width) * 2 - 1));
    const dead = Math.abs(v) < 0.06 ? 0 : v;
    g.input.touch.axis = dead;
    setValue(dead);
  }, []);

  const release = useCallback(() => {
    active.current = false;
    const g = gameHolder.game;
    if (g) g.input.touch.axis = null;
    setValue(0);
  }, []);

  useEffect(() => {
    const up = () => {
      if (active.current) release();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", up);
      release();
    };
  }, [release]);

  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Steering"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={Number(value.toFixed(2))}
      className="touch-btn relative h-[86px] w-[190px] overflow-hidden rounded-2xl sm:w-[230px]"
      onPointerDown={(e) => {
        e.preventDefault();
        active.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        apply(e.clientX);
      }}
      onPointerMove={(e) => {
        if (active.current) apply(e.clientX);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="absolute inset-y-0 left-1/2 w-px bg-cream/20" />
      <div
        className="absolute top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cream/40 bg-sand/30 transition-transform duration-75"
        style={{ left: `${50 + value * 42}%` }}
      />
      <div className="absolute bottom-1.5 left-0 right-0 text-center text-[9px] uppercase tracking-[0.25em] text-cream/45">
        Steer
      </div>
    </div>
  );
}

function TiltBar() {
  return (
    <button
      onClick={() => gameHolder.game?.input.calibrateTilt()}
      className="touch-btn h-[86px] w-[190px] rounded-2xl font-display text-sm font-bold uppercase tracking-wider sm:w-[230px]"
    >
      Tilt to steer
      <div className="mt-1 text-[9px] tracking-[0.2em] opacity-60">Tap to re-centre</div>
    </button>
  );
}

export default function TouchControls() {
  const mode = useGameStore((s) => s.settings.touchSteer);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-end justify-between gap-2 p-3 pb-5 safe-pad">
      <div className="pointer-events-auto flex items-end gap-2">
        {mode === "buttons" ? (
          <>
            <TouchButton id="left" label="◀" className="h-[86px] w-[86px] text-2xl" />
            <TouchButton id="right" label="▶" className="h-[86px] w-[86px] text-2xl" />
          </>
        ) : mode === "tilt" ? (
          <TiltBar />
        ) : (
          <SteerPad />
        )}
      </div>
      <div className="pointer-events-auto flex items-end gap-2">
        <TouchButton id="handbrake" label="Hand" sub="brake" className="h-[62px] w-[66px] text-xs" />
        <TouchButton id="brake" label="Brake" className="h-[62px] w-[78px] text-sm" />
        <TouchButton id="boost" label="Boost" className="h-[86px] w-[78px] text-sm" />
        <TouchButton id="gas" label="Gas" className="h-[106px] w-[94px] text-lg" />
      </div>
    </div>
  );
}
