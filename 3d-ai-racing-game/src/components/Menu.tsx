import { useEffect, useState } from "react";
import { gameHolder } from "../game/Game";
import {
  BINDABLE,
  type BindAction,
  CAR_CLASSES,
  CAR_COLORS,
  DEFAULT_KEYBINDS,
  DIFFICULTIES,
  QUALITY_ORDER,
  QUALITY_PRESETS,
  TRACKS,
  type QualityId,
  keyLabel,
  wildcardTrack,
} from "../game/config";
import {
  type Difficulty,
  type RaceMode,
  type TimeOfDay,
  type TouchSteerMode,
  formatTime,
  raceKey,
  useGameStore,
} from "../game/store";
import { cn } from "../utils/cn";
import { Bar, Kbd, Label, Segmented, Slider, Toggle } from "./ui";

const DIFF_BLURBS: Record<Difficulty, string> = {
  rookie: "Forgiving",
  pro: "A real fight",
  legend: "Flawless",
};

const DIFFS: { id: Difficulty; label: string; desc: string }[] = (["rookie", "pro", "legend"] as const).map(
  (id) => ({ id, label: DIFFICULTIES[id].name, desc: DIFF_BLURBS[id] }),
);

const MODES: { id: RaceMode; label: string; desc: string }[] = [
  { id: "race", label: "Race", desc: "3 AI rivals" },
  { id: "timetrial", label: "Time trial", desc: "You vs ghost" },
  { id: "championship", label: "Season", desc: "4 rounds, points" },
];

const TIMES: { id: TimeOfDay; label: string }[] = [
  { id: "sunset", label: "Sunset" },
  { id: "noon", label: "Noon" },
  { id: "night", label: "Night" },
];

/** One rebindable control row. Click, then press any key. */
function BindRow({
  action,
  label,
  keys,
  onBind,
}: {
  action: BindAction;
  label: string;
  keys: string[];
  onBind: (action: BindAction, key: string) => void;
}) {
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;
    const input = gameHolder.game?.input ?? null;
    if (!input) return;
    input.capturing = true;
    input.onCapture = (key) => {
      setListening(false);
      onBind(action, key);
    };
    return () => {
      input.capturing = false;
      input.onCapture = null;
    };
  }, [listening, action, onBind]);

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[11px] uppercase tracking-[0.18em] text-cream/60">{label}</span>
      <button
        onClick={() => setListening((v) => !v && !!gameHolder.game)}
        className={cn("seg rounded-lg px-3 py-1 font-display text-sm", listening && "active")}
      >
        {listening ? "Press a key…" : keys.map(keyLabel).join(" / ")}
      </button>
    </div>
  );
}

type Tab = "race" | "car" | "options";

const IS_TOUCH = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);

export default function Menu() {
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  const records = useGameStore((s) => s.records);
  const loaded = useGameStore((s) => s.loaded);
  const [tab, setTab] = useState<Tab>("race");

  const apply = (patch: Parameters<typeof setSettings>[0]) => {
    setSettings(patch);
    const next = useGameStore.getState().settings;
    gameHolder.game?.applySettings(next);
  };

  const start = () => {
    if (!loaded) return;
    gameHolder.game?.startRace(useGameStore.getState().settings);
  };

  const season = useGameStore((s) => s.season);
  const endSeason = useGameStore((s) => s.endSeason);
  const wildcard = wildcardTrack(settings.wildcardSeed);

  const rebind = (action: BindAction, key: string) => {
    // Steal the key from any action that can spare it (never leave one unbound).
    const next: Record<string, string[]> = {};
    for (const b of BINDABLE) {
      const cur = settings.keyBinds[b.id] ?? DEFAULT_KEYBINDS[b.id];
      const stripped = cur.filter((k) => k !== key);
      next[b.id] = b.id === action ? [key] : stripped.length ? stripped : cur;
    }
    apply({ keyBinds: next });
  };

  const rec = records[settings.trackId];
  const bestRace =
    rec?.races?.[raceKey(settings.difficulty, settings.laps, settings.mode, settings.carClassId)] ?? null;
  const bestLap = rec?.bestLap ?? null;
  const carClass = CAR_CLASSES.find((c) => c.id === settings.carClassId) ?? CAR_CLASSES[0];

  return (
    <div className="pointer-events-none fixed inset-0 flex flex-col safe-pad">
      {/* top bar */}
      <div className="flex items-center justify-between px-6 pt-5 md:px-10">
        <div className="fade-up flex items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-cream/60">
          <span className="h-px w-8 bg-cream/30" />
          Golden Hour Circuit
        </div>
        <button
          onClick={() => apply({ muted: !settings.muted })}
          className="btn-ghost pointer-events-auto rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.25em]"
        >
          {settings.muted ? "Sound off" : "Sound on"}
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-end gap-6 overflow-y-auto px-6 pb-6 md:flex-row md:items-end md:justify-between md:overflow-visible md:px-10 md:pb-10">
        {/* title */}
        <div className="shrink-0 md:max-w-xl">
          <h1 className="title-shadow fade-up font-display text-[64px] font-extrabold uppercase leading-[0.86] tracking-tight text-cream sm:text-[96px] md:text-[128px]">
            Sundown
            <br />
            <span className="text-sand">Rally</span>
          </h1>
          <p className="fade-up fade-up-1 mt-4 max-w-md font-body text-sm leading-relaxed text-cream/70 md:text-base">
            Hard-packed desert, three relentless AI drivers and a sun that's already going down. Slide through
            the hairpins to charge your boost, hunt your own ghost, and beat the machines.
          </p>
          <div className="fade-up fade-up-2 mt-5 hidden flex-wrap gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.18em] text-cream/55 md:flex">
            <span>
              <Kbd>W A S D</Kbd> drive
            </span>
            <span>
              <Kbd>Shift</Kbd> boost
            </span>
            <span>
              <Kbd>Space</Kbd> handbrake
            </span>
            <span>
              <Kbd>B</Kbd> look back
            </span>
            <span>
              <Kbd>R</Kbd> respawn
            </span>
            <span>
              <Kbd>C</Kbd> camera
            </span>
            <span>
              <Kbd>Esc</Kbd> pause
            </span>
          </div>
        </div>

        {/* settings panel */}
        <div className="panel pointer-events-auto fade-up fade-up-2 w-full shrink-0 rounded-2xl p-5 md:w-[400px] md:p-6">
          <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-cream/5 p-1">
            {(
              [
                ["race", "Race"],
                ["car", "Car"],
                ["options", "Options"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "rounded-lg px-2 py-1.5 font-display text-sm font-bold uppercase tracking-wide transition-colors",
                  tab === id ? "bg-sand/20 text-cream" : "text-cream/55 hover:text-cream/80",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[42vh] overflow-y-auto pr-1 md:max-h-[46vh]">
            {tab === "race" && (
              <div className="flex flex-col gap-4">
                <div>
                  <Label>Mode</Label>
                  <Segmented
                    ariaLabel="Race mode"
                    options={MODES}
                    value={settings.mode}
                    onChange={(mode) => apply({ mode })}
                  />
                </div>
                <div>
                  <Label>Circuit</Label>
                  <div role="radiogroup" aria-label="Circuit" className="grid grid-cols-2 gap-2">
                    {TRACKS.map((t) => (
                      <button
                        key={t.id}
                        role="radio"
                        aria-checked={settings.trackId === t.id}
                        onClick={() => {
                          apply({ trackId: t.id });
                          void gameHolder.game?.changeTrack(t.id);
                        }}
                        className={cn(
                          "seg rounded-xl px-3 py-2 text-left",
                          settings.trackId === t.id && "active",
                        )}
                      >
                        <div className="font-display text-base font-bold uppercase leading-none">
                          {t.name}
                        </div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.1em] opacity-70">
                          {t.subtitle}
                        </div>
                      </button>
                    ))}
                    <button
                      role="radio"
                      aria-checked={settings.trackId === "wildcard"}
                      onClick={() => {
                        apply({ trackId: "wildcard" });
                        void gameHolder.game?.changeTrack("wildcard");
                      }}
                      className={cn(
                        "seg col-span-2 flex items-center justify-between rounded-xl px-3 py-2 text-left",
                        settings.trackId === "wildcard" && "active",
                      )}
                    >
                      <span>
                        <span className="block font-display text-base font-bold uppercase leading-none">
                          {wildcard.name}
                        </span>
                        <span className="mt-1 block text-[10px] uppercase tracking-[0.1em] opacity-70">
                          {wildcard.subtitle} · {wildcard.grade}
                        </span>
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Roll a new wildcard circuit"
                        onClick={(e) => {
                          e.stopPropagation();
                          const seed = 1 + Math.floor(Math.random() * 9999);
                          apply({ trackId: "wildcard", wildcardSeed: seed });
                          void gameHolder.game?.changeTrack("wildcard");
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.stopPropagation();
                          e.preventDefault();
                          const seed = 1 + Math.floor(Math.random() * 9999);
                          apply({ trackId: "wildcard", wildcardSeed: seed });
                          void gameHolder.game?.changeTrack("wildcard");
                        }}
                        className="rounded-lg border border-cream/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] hover:border-cream/50"
                      >
                        Reroll
                      </span>
                    </button>
                  </div>
                  <div className="mt-2">
                    <Toggle
                      label="Reverse direction"
                      hint="Same circuit, mirrored corners"
                      checked={settings.reverse}
                      onChange={(reverse) => apply({ reverse })}
                    />
                  </div>
                </div>
                {settings.mode === "championship" && (
                  <div className="rounded-xl border border-sand/30 bg-sand/10 p-3 text-[11px] uppercase tracking-[0.18em] text-cream/70">
                    {season && !season.done ? (
                      <>
                        Season in progress · round {season.raceIndex + 1} of {season.trackIds.length}
                        <button
                          onClick={() => endSeason()}
                          className="ml-2 rounded border border-cream/25 px-2 py-0.5 text-[10px] hover:border-cream/60"
                        >
                          Reset
                        </button>
                      </>
                    ) : (
                      <>Four rounds, every circuit, points {"10/6/3/1"} — alternating direction.</>
                    )}
                  </div>
                )}
                {settings.mode === "race" && (
                  <div>
                    <Label>Rival difficulty</Label>
                    <Segmented
                      ariaLabel="Rival difficulty"
                      options={DIFFS}
                      value={settings.difficulty}
                      onChange={(difficulty) => apply({ difficulty })}
                    />
                  </div>
                )}
                <div>
                  <Label>Laps</Label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 5, 7].map((n) => (
                      <button
                        key={n}
                        onClick={() => apply({ laps: n })}
                        className={cn(
                          "seg h-9 flex-1 rounded-lg font-display text-base font-bold",
                          settings.laps === n && "active",
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "car" && (
              <div className="flex flex-col gap-4">
                <div>
                  <Label>Chassis</Label>
                  <div className="flex flex-col gap-2">
                    {CAR_CLASSES.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => apply({ carClassId: c.id })}
                        className={cn(
                          "seg rounded-xl px-3 py-2.5 text-left",
                          settings.carClassId === c.id && "active",
                        )}
                      >
                        <div className="font-display text-lg font-bold uppercase leading-none">{c.name}</div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.1em] opacity-70">
                          {c.blurb}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-cream/10 p-3">
                  <div className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-cream/80">
                    {carClass.name}
                  </div>
                  <div className="flex flex-col gap-2">
                    {(
                      [
                        ["Top speed", carClass.bars.speed],
                        ["Acceleration", carClass.bars.accel],
                        ["Grip", carClass.bars.grip],
                      ] as [string, number][]
                    ).map(([k, v]) => (
                      <div key={k}>
                        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-[0.2em] text-cream/50">
                          <span>{k}</span>
                        </div>
                        <Bar value={v} />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Livery</Label>
                  <div className="flex flex-wrap gap-2">
                    {CAR_COLORS.map((c, i) => (
                      <button
                        key={c.name}
                        title={c.name}
                        aria-label={`Livery ${c.name}`}
                        onClick={() => apply({ carColor: i })}
                        className={cn(
                          "h-9 w-9 rounded-full border-2 transition-transform",
                          settings.carColor === i
                            ? "scale-110 border-cream"
                            : "border-white/15 hover:scale-105",
                        )}
                        style={{ background: "#" + c.hex.toString(16).padStart(6, "0") }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "options" && (
              <div className="flex flex-col gap-4">
                <div>
                  <Label>Graphics</Label>
                  <Segmented
                    ariaLabel="Graphics quality"
                    columns={4}
                    options={QUALITY_ORDER.map((q: QualityId) => ({
                      id: q,
                      label: QUALITY_PRESETS[q].name,
                    }))}
                    value={settings.quality}
                    onChange={(quality) => apply({ quality })}
                  />
                </div>
                <Toggle
                  label="Auto performance"
                  hint="Drop resolution if the frame rate sags"
                  checked={settings.autoQuality}
                  onChange={(autoQuality) => apply({ autoQuality })}
                />
                <Slider
                  label="Master volume"
                  value={settings.masterVolume}
                  onChange={(masterVolume) => apply({ masterVolume, muted: false })}
                />
                <Slider
                  label="Music"
                  value={settings.musicVolume}
                  onChange={(musicVolume) => apply({ musicVolume })}
                />
                <Slider
                  label="Steering sensitivity"
                  min={0.5}
                  max={1.8}
                  step={0.05}
                  value={settings.steerSensitivity}
                  display={`${settings.steerSensitivity.toFixed(2)}×`}
                  onChange={(steerSensitivity) => apply({ steerSensitivity })}
                />
                <Toggle
                  label="Ghost car"
                  hint="Race your best lap"
                  checked={settings.showGhost}
                  onChange={(showGhost) => apply({ showGhost })}
                />
                <Toggle
                  label="Racing line"
                  hint="Green = flat out, red = brake"
                  checked={settings.showRacingLine}
                  onChange={(showRacingLine) => apply({ showRacingLine })}
                />
                <div>
                  <Label>Time of day</Label>
                  <Segmented
                    ariaLabel="Time of day"
                    columns={3}
                    options={TIMES}
                    value={settings.timeOfDay}
                    onChange={(timeOfDay) => apply({ timeOfDay })}
                  />
                </div>
                <Slider
                  label="Field of view"
                  min={-12}
                  max={18}
                  step={1}
                  value={settings.fovOffset}
                  display={`${settings.fovOffset > 0 ? "+" : ""}${settings.fovOffset}°`}
                  onChange={(fovOffset) => apply({ fovOffset })}
                />
                <Toggle
                  label="Invert steering"
                  hint="Flip left and right"
                  checked={settings.invertSteer}
                  onChange={(invertSteer) => apply({ invertSteer })}
                />
                <Toggle
                  label="Name tags"
                  hint="Floating rival names"
                  checked={settings.showNameTags}
                  onChange={(showNameTags) => apply({ showNameTags })}
                />
                <Toggle
                  label="Colour-blind safe"
                  hint="Blue / orange instead of green / red"
                  checked={settings.colorBlindSafe}
                  onChange={(colorBlindSafe) => apply({ colorBlindSafe })}
                />
                <Toggle
                  label="Reduced motion"
                  hint="No camera shake or FOV pumping"
                  checked={settings.reducedMotion}
                  onChange={(reducedMotion) => apply({ reducedMotion })}
                />
                <div className="rounded-xl border border-cream/10 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <Label>Keyboard</Label>
                    <button
                      onClick={() => apply({ keyBinds: { ...DEFAULT_KEYBINDS } })}
                      className="rounded border border-cream/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-cream/60 hover:border-cream/50"
                    >
                      Defaults
                    </button>
                  </div>
                  {BINDABLE.map((b) => (
                    <BindRow
                      key={b.id}
                      action={b.id}
                      label={b.label}
                      keys={settings.keyBinds[b.id] ?? DEFAULT_KEYBINDS[b.id]}
                      onBind={rebind}
                    />
                  ))}
                </div>
                {IS_TOUCH && (
                  <div>
                    <Label>Touch steering</Label>
                    <Segmented
                      ariaLabel="Touch steering style"
                      columns={3}
                      options={
                        [
                          { id: "slider", label: "Pad" },
                          { id: "buttons", label: "Buttons" },
                          { id: "tilt", label: "Tilt" },
                        ] as { id: TouchSteerMode; label: string }[]
                      }
                      value={settings.touchSteer}
                      onChange={(touchSteer) => {
                        apply({ touchSteer });
                        if (touchSteer === "tilt") {
                          void gameHolder.game?.input.requestTiltPermission().then(() => {
                            gameHolder.game?.input.calibrateTilt();
                          });
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={start}
            disabled={!loaded}
            className="btn-primary mt-4 flex w-full items-center justify-between rounded-xl px-5 py-3.5 font-display text-2xl font-extrabold uppercase tracking-wider disabled:opacity-60"
          >
            <span>
              {!loaded
                ? "Building…"
                : settings.mode === "race"
                  ? "Start race"
                  : settings.mode === "timetrial"
                    ? "Start time trial"
                    : season && !season.done
                      ? `Round ${season.raceIndex + 1}`
                      : "Start season"}
            </span>
            <span className="text-base opacity-80">→</span>
          </button>

          <div className="mt-3 grid grid-cols-2 gap-3 text-[10px] uppercase tracking-[0.18em] text-cream/50">
            <div>
              <div>Best lap</div>
              <div className="font-display text-base tracking-wide text-sand">
                {bestLap ? formatTime(bestLap) : "—"}
              </div>
            </div>
            <div className="text-right">
              <div>Best race</div>
              <div className="font-display text-base tracking-wide text-sand">
                {bestRace ? formatTime(bestRace) : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
