import { useEffect, useRef } from "react";
import { Game } from "../game/Game";

export default function GameCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let game: Game | null = null;
    // defer a frame so the loading screen paints before heavy world generation
    const id = requestAnimationFrame(() => {
      game = new Game(canvas);
    });
    return () => {
      cancelAnimationFrame(id);
      game?.dispose();
    };
  }, []);

  return <canvas ref={ref} className="game-canvas" />;
}
