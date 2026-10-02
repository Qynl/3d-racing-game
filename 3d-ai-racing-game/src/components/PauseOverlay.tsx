import { gameHolder } from "../game/Game";
import { QUALITY_ORDER, QUALITY_PRESETS } from "../game/config";
import { useGameStore } from "../game/store";
import { Label, Segmented, Slider, Toggle } from "./ui";

const CAM_NAMES = ["Chase", "Wide", "Hood"];

export default function PauseOverlay() {
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);

  const apply = (patch: Parameters<typeof setSettings>[0]) => {
    setSettings(patch);
    gameHolder.game?.applySettings(useGameStore.getState().settings);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-[3px]">
      <div className="panel fade-up max-h-[92vh] w-[min(94vw,420px)] overflow-y-auto rounded-2xl p-6">
        <div className="text-[11px] uppercase tracking-[0.3em] text-cream/55">Race paused</div>
        <div className="font-display mt-1 text-5xl font-extrabold uppercase leading-none text-cream">
          Breathe.
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <button
            autoFocus
            onClick={() => gameHolder.game?.resume()}
            className="btn-primary rounded-xl px-5 py-3 font-display text-xl font-extrabold uppercase tracking-wider"
          >
            Resume
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => gameHolder.game?.restart()}
              className="btn-ghost rounded-xl px-5 py-3 font-display text-lg font-bold uppercase tracking-wider"
            >
              Restart
            </button>
            <button
              onClick={() => gameHolder.game?.quitToMenu()}
              className="btn-ghost rounded-xl px-5 py-3 font-display text-lg font-bold uppercase tracking-wider"
            >
              Quit
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={() => apply({ cameraMode: (settings.cameraMode + 1) % 3 })}
            className="seg rounded-lg px-3 py-2 text-left"
          >
            <div className="text-[10px] uppercase tracking-[0.2em] opacity-60">Camera · C</div>
            <div className="font-display text-base font-bold uppercase">{CAM_NAMES[settings.cameraMode]}</div>
          </button>
          <button
            onClick={() => apply({ muted: !settings.muted })}
            className="seg rounded-lg px-3 py-2 text-left"
          >
            <div className="text-[10px] uppercase tracking-[0.2em] opacity-60">Sound · M</div>
            <div className="font-display text-base font-bold uppercase">{settings.muted ? "Off" : "On"}</div>
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-4 border-t border-cream/10 pt-5">
          <div>
            <Label>Graphics</Label>
            <Segmented
              ariaLabel="Graphics quality"
              columns={4}
              options={QUALITY_ORDER.map((q) => ({ id: q, label: QUALITY_PRESETS[q].name }))}
              value={settings.quality}
              onChange={(quality) => apply({ quality })}
            />
          </div>
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
            label="Racing line"
            checked={settings.showRacingLine}
            onChange={(showRacingLine) => apply({ showRacingLine })}
          />
          <Toggle
            label="Ghost car"
            checked={settings.showGhost}
            onChange={(showGhost) => apply({ showGhost })}
          />
          <Toggle
            label="Reduced motion"
            checked={settings.reducedMotion}
            onChange={(reducedMotion) => apply({ reducedMotion })}
          />
        </div>
      </div>
    </div>
  );
}
