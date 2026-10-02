import { useCallback, useState } from "react";
import { gameHolder } from "../game/Game";
import { TouchState } from "../game/input";
import { cn } from "../utils/cn";

function TouchButton({ id, label, className }: { id: keyof TouchState; label: string; className?: string }) {
  const [pressed, setPressed] = useState(false);
  const set = useCallback(
    (v: boolean) => {
      setPressed(v);
      const g = gameHolder.game;
      if (g) g.input.touch[id] = v;
    },
    [id]
  );
  return (
    <button
      className={cn(
        "touch-btn flex select-none items-center justify-center rounded-2xl font-display text-2xl font-bold uppercase tracking-wider",
        pressed && "pressed",
        className
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onPointerLeave={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

export default function TouchControls() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-end justify-between p-4 pb-6">
      <div className="pointer-events-auto flex gap-3">
        <TouchButton id="left" label="◀" className="h-20 w-20" />
        <TouchButton id="right" label="▶" className="h-20 w-20" />
      </div>
      <div className="pointer-events-auto flex items-end gap-3">
        <TouchButton id="brake" label="Brake" className="h-16 w-24 text-base" />
        <TouchButton id="gas" label="Gas" className="h-24 w-24" />
      </div>
    </div>
  );
}
