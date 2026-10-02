import { useEffect } from "react";
import { useGameStore } from "../game/store";
import { cn } from "../utils/cn";

function Toast({ id, text, sub, kind }: { id: number; text: string; sub?: string; kind: string }) {
  const drop = useGameStore((s) => s.dropToast);
  useEffect(() => {
    const t = setTimeout(() => drop(id), 2600);
    return () => clearTimeout(t);
  }, [id, drop]);
  return (
    <div
      className={cn(
        "fade-up hud-chip mt-2 min-w-[120px] rounded-xl px-3 py-2 text-right",
        kind === "good" && "border-juniper/60",
        kind === "bad" && "border-clay/60",
      )}
    >
      <div
        className={cn(
          "font-display text-base font-bold uppercase leading-none tracking-wide",
          kind === "good" ? "text-juniper-bright" : kind === "bad" ? "text-clay-bright" : "text-cream",
        )}
      >
        {text}
      </div>
      {sub && <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-cream/55">{sub}</div>}
    </div>
  );
}

export default function Toasts() {
  const toasts = useGameStore((s) => s.toasts);
  return (
    <div className="pointer-events-none flex flex-col items-end" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} id={t.id} text={t.text} sub={t.sub} kind={t.kind} />
      ))}
    </div>
  );
}
