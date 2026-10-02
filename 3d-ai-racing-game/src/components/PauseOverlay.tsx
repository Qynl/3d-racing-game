import { useGameStore } from "../game/store";
import { gameHolder } from "../game/Game";

export default function PauseOverlay() {
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  const camNames = ["Chase", "Wide", "Hood"];

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-ink/55 backdrop-blur-[3px]">
      <div className="panel fade-up w-[min(92vw,380px)] rounded-2xl p-6">
        <div className="text-[11px] uppercase tracking-[0.3em] text-cream/55">Race paused</div>
        <div className="font-display mt-1 text-5xl font-extrabold uppercase leading-none text-cream">Breathe.</div>
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={() => gameHolder.game?.resume()}
            className="btn-primary rounded-xl px-5 py-3 font-display text-xl font-extrabold uppercase tracking-wider"
          >
            Resume
          </button>
          <button
            onClick={() => gameHolder.game?.restart()}
            className="btn-ghost rounded-xl px-5 py-3 font-display text-xl font-bold uppercase tracking-wider"
          >
            Restart race
          </button>
          <button
            onClick={() => gameHolder.game?.quitToMenu()}
            className="btn-ghost rounded-xl px-5 py-3 font-display text-xl font-bold uppercase tracking-wider"
          >
            Quit to menu
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              const mode = (settings.cameraMode + 1) % 3;
              setSettings({ cameraMode: mode });
              if (gameHolder.game) gameHolder.game.cameraMode = mode;
            }}
            className="seg rounded-lg px-3 py-2 text-left"
          >
            <div className="text-[10px] uppercase tracking-[0.2em] opacity-60">Camera · C</div>
            <div className="font-display text-base font-bold uppercase">{camNames[settings.cameraMode]}</div>
          </button>
          <button
            onClick={() => {
              const m = !settings.muted;
              setSettings({ muted: m });
              gameHolder.game?.setMuted(m);
            }}
            className="seg rounded-lg px-3 py-2 text-left"
          >
            <div className="text-[10px] uppercase tracking-[0.2em] opacity-60">Sound · M</div>
            <div className="font-display text-base font-bold uppercase">{settings.muted ? "Off" : "On"}</div>
          </button>
        </div>
      </div>
    </div>
  );
}
