import { useEffect, useRef } from "react";
import { Game, WebGLUnavailableError } from "../game/Game";
import { useGameStore } from "../game/store";

export default function GameCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || started.current) return;
    started.current = true;
    let game: Game | null = null;
    let cancelled = false;

    // Defer a frame so the loading screen paints before heavy world generation.
    const id = requestAnimationFrame(() => {
      Game.create(canvas)
        .then((g) => {
          if (cancelled) {
            g.dispose();
            return;
          }
          game = g;
        })
        .catch((err: unknown) => {
          console.error(err);
          const msg =
            err instanceof WebGLUnavailableError
              ? "This browser or device can't start WebGL. Try a different browser, enable hardware acceleration, or update your graphics drivers."
              : err instanceof Error
                ? err.message
                : "Unknown error while building the world.";
          useGameStore.getState().setFatal(msg);
        });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
      game?.dispose();
      started.current = false;
    };
  }, []);

  return <canvas ref={ref} className="game-canvas" aria-label="Race view" />;
}
