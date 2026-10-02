// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "../App";
import { defaultHud, defaultSettings, useGameStore } from "../game/store";
import HUD from "./HUD";
import Menu from "./Menu";
import PauseOverlay from "./PauseOverlay";
import Results from "./Results";
import Toasts from "./Toasts";

function reset(patch: Partial<ReturnType<typeof useGameStore.getState>> = {}) {
  useGameStore.setState({
    screen: "menu",
    settings: { ...defaultSettings },
    hud: { ...defaultHud },
    results: null,
    records: {},
    toasts: [],
    fatal: null,
    loaded: true,
    loadProgress: 1,
    ...patch,
  });
}

afterEach(cleanup);

describe("screens render without crashing", () => {
  it("renders the menu with every tab's entry points", () => {
    reset();
    render(<Menu />);
    expect(screen.getByRole("button", { name: /start race/i })).toBeTruthy();
    expect(screen.getAllByRole("radio", { name: /sundown loop/i }).length).toBeGreaterThan(0);
  });

  it("renders the HUD", () => {
    reset({ screen: "racing" });
    const { container } = render(<HUD />);
    expect(container.querySelector("canvas")).toBeTruthy();
    expect(container.textContent?.toLowerCase()).toContain("lap");
  });

  it("shows the countdown and the GO callout", () => {
    reset({ screen: "countdown", hud: { ...defaultHud, countdown: 3 } });
    const { container, rerender } = render(<HUD />);
    expect(container.textContent).toContain("3");
    useGameStore.setState({ hud: { ...defaultHud, countdown: 0 } });
    rerender(<HUD />);
    expect(container.textContent?.toLowerCase()).toContain("go");
  });

  it("warns about wrong way and invalid laps", () => {
    reset({
      screen: "racing",
      hud: { ...defaultHud, wrongWay: true, lapInvalid: true },
    });
    const { container } = render(<HUD />);
    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).toContain("wrong way");
    expect(text).toContain("lap");
  });

  it("renders results with the finishing order", () => {
    reset({
      screen: "finished",
      results: {
        position: 1,
        totalTime: 182.5,
        lapTimes: [61.2, 60.5, 60.8],
        bestLap: 60.5,
        isRecordLap: true,
        isRecordRace: true,
        bestSectors: [19.1, 20.2, 21.2],
        cars: [
          { name: "YOU", color: 0xc2553a, time: 182.5, isPlayer: true, bestLap: 60.5, provisional: false },
          { name: "ATLAS", color: 0x4f6b4a, time: 184.1, isPlayer: false, bestLap: 61, provisional: true },
          { name: "VECTOR", color: 0xd1a03c, time: null, isPlayer: false, bestLap: null, provisional: false },
        ],
        topSpeed: 198,
        driftScore: 12400,
        airTime: 3.4,
        cleanRace: true,
        mode: "race",
        trackId: "sundown",
      },
    });
    const { container } = render(<Results />);
    const text = container.textContent ?? "";
    expect(text).toContain("YOU");
    expect(text).toContain("ATLAS");
    expect(text).toContain("DNF");
    expect(text.toLowerCase()).toContain("lap record");
    expect(screen.getByRole("button", { name: /race again/i })).toBeTruthy();
  });

  it("renders the pause overlay", () => {
    reset({ screen: "paused" });
    render(<PauseOverlay />);
    expect(screen.getByRole("button", { name: /resume/i })).toBeTruthy();
  });

  it("renders toasts", () => {
    reset({ screen: "racing" });
    useGameStore.getState().pushToast({ text: "P2", sub: "Overtook ATLAS", kind: "good" });
    const { container } = render(<Toasts />);
    expect(container.textContent).toContain("P2");
  });

  it("renders the loading screen then the menu", () => {
    reset({ loaded: false, loadProgress: 0.4, loadLabel: "Raising the dunes" });
    const { container } = render(<App />);
    expect(container.textContent).toContain("40%");
    expect(container.textContent).toContain("Raising the dunes");
  });

  it("renders a fatal error screen instead of the game", () => {
    reset({ fatal: "This browser can't start WebGL." });
    const { container } = render(<App />);
    expect(container.textContent).toContain("WebGL");
  });
});
