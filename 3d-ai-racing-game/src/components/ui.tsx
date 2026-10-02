import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[11px] uppercase tracking-[0.25em] text-cream/55">{children}</div>;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  columns,
  ariaLabel,
}: {
  options: { id: T; label: string; desc?: string }[];
  value: T;
  onChange: (v: T) => void;
  columns?: number;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={String(o.id)}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn("seg rounded-xl px-2 py-2 text-left", value === o.id && "active")}
        >
          <div className="font-display text-base font-bold uppercase leading-none tracking-wide">
            {o.label}
          </div>
          {o.desc && <div className="mt-1 text-[10px] uppercase tracking-[0.12em] opacity-70">{o.desc}</div>}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
  label,
  display,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  display?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-cream/55">
        <span>{label}</span>
        <span className="font-display text-sm tracking-normal text-sand">
          {display ?? `${Math.round(value * 100)}%`}
        </span>
      </div>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="seg flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left"
    >
      <span>
        <span className="font-display block text-base font-bold uppercase leading-none tracking-wide">
          {label}
        </span>
        {hint && (
          <span className="mt-1 block text-[10px] uppercase tracking-[0.12em] opacity-60">{hint}</span>
        )}
      </span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
          checked ? "border-sand/70 bg-sand/35" : "border-cream/20 bg-cream/5",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-cream transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function Bar({ value, tone = "sand" }: { value: number; tone?: "sand" | "clay" | "juniper" }) {
  const colors = { sand: "bg-sand", clay: "bg-clay", juniper: "bg-juniper" } as const;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-cream/10">
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", colors[tone])}
        style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }}
      />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-cream/20 bg-cream/10 px-1.5 py-0.5 font-display text-[11px] font-semibold tracking-wide text-cream/90">
      {children}
    </kbd>
  );
}
