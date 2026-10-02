// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "../App";
import { defaultHud, defaultReplay, defaultSettings, useGameStore } from "../game/store";
import HUD from "./HUD";
import Menu from "./Menu";
import PauseOverlay from "./PauseOverlay";
import ReplayOverlay from "./ReplayOverlay";
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
    replay: { ...defaultReplay },
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

  it("shows the launch rev meter while the lights are on", () => {
    reset({ screen: "countdown", hud: { ...defaultHud, countdown: 2, revs: 0.7 } });
    const { container } = render(<HUD />);
    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).toContain("launch revs");
    expect(text).toContain("hold it");
  });

  it("shows slipstream and damage readouts when they are active", () => {
    reset({ screen: "racing", hud: { ...defaultHud, draft: 0.8, damage: 0.7 } });
    const { container } = render(<HUD />);
    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).toContain("slipstream");
    expect(text).toContain("damage");
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

  it("renders championship standings and a next-round button", () => {
    reset({
      screen: "finished",
      settings: { ...defaultSettings, mode: "championship" },
      results: {
        position: 2,
        credits: { total: 1240, lines: [{ label: "Finished P2", amount: 560 }] },
        weather: "rain",
      objectives: [],
        standings: [
          { name: "ATLAS", points: 16, isPlayer: false, color: 0x4f6b4a, gained: 10 },
          { name: "YOU", points: 12, isPlayer: true, color: 0xc2553a, gained: 6 },
        ],
        seasonRace: { index: 2, total: 4 },
        seasonDone: false,
        totalTime: 120,
        lapTimes: [60, 60],
        bestLap: 60,
        isRecordLap: false,
        isRecordRace: false,
        bestSectors: [20, 20, 20],
        cars: [],
        topSpeed: 190,
        driftScore: 10,
        airTime: 0.4,
        cleanRace: true,
        mode: "championship",
        trackId: "sundown",
      },
    });
    render(<Results />);
    expect(screen.getByRole("button", { name: /next round/i })).toBeTruthy();
    expect(screen.getByText(/round 2 \/ 4/i)).toBeTruthy();
    expect(screen.getByText(/\+10/)).toBeTruthy();
  });

  it("shows the garage with credits and buyable upgrades", () => {
    reset();
    useGameStore.setState({
      garage: { credits: 5000, upgrades: {}, racesRun: 3, wins: 1, spent: 0 },
    });
    render(<Menu />);
    fireEvent.click(screen.getByRole("button", { name: /garage/i }));
    expect(screen.getByText(/5,000 cr/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^600 cr$/i })).toBeTruthy();
    expect(screen.getByText(/3 races · 1 wins/i)).toBeTruthy();
  });

  it("itemises the payout on the results screen", () => {
    reset({
      screen: "finished",
      results: {
        position: 1,
        credits: {
          total: 1800,
          lines: [
            { label: "Finished P1", amount: 900 },
            { label: "Clean race", amount: 180 },
          ],
        },
        weather: "rain",
      objectives: [],
        standings: null,
        seasonRace: null,
        seasonDone: false,
        totalTime: 100,
        lapTimes: [50, 50],
        bestLap: 50,
        isRecordLap: false,
        isRecordRace: false,
        bestSectors: [16, 17, 17],
        cars: [],
        topSpeed: 180,
        driftScore: 0,
        airTime: 0,
        cleanRace: true,
        mode: "race",
        trackId: "sundown",
      },
    });
    const { container } = render(<Results />);
    const text = container.textContent ?? "";
    expect(text).toContain("+1,800 cr");
    expect(text).toContain("Finished P1");
    expect(text.toLowerCase()).toContain("rain");
  });

  it("renders results with the finishing order", () => {
    reset({
      screen: "finished",
      results: {
        position: 1,
        credits: null,
        weather: "clear",
      objectives: [],
        standings: null,
        seasonRace: null,
        seasonDone: false,
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

  it("shows the live timing tower with the running order", () => {
    reset({
      screen: "racing",
      hud: {
        ...defaultHud,
        carCount: 3,
        order: [
          { name: "VECTOR", color: 0xd1a03c, isPlayer: false, gap: 0, lap: 2, finished: false },
          { name: "YOU", color: 0x8899aa, isPlayer: true, gap: 1.4, lap: 2, finished: false },
          { name: "ATLAS", color: 0x4f6b4a, isPlayer: false, gap: 3.2, lap: 2, finished: false },
        ],
      },
    });
    const { container } = render(<HUD />);
    const text = container.textContent ?? "";
    expect(text).toContain("VECTOR");
    expect(text).toContain("LEAD");
    expect(text).toContain("+1.4");
  });

  it("flags a battle and names the cars either side", () => {
    reset({
      screen: "racing",
      hud: {
        ...defaultHud,
        gapAhead: 0.4,
        gapBehind: 0.8,
        rivalAhead: "KESTREL",
        rivalBehind: "MAGPIE",
        battle: true,
      },
    });
    const { container } = render(<HUD />);
    const text = container.textContent ?? "";
    expect(text).toContain("KESTREL");
    expect(text).toContain("MAGPIE");
    expect(text.toLowerCase()).toContain("battle");
  });

  it("lets you size the grid and previews the rivals you will face", () => {
    reset();
    render(<Menu />);
    const eight = screen.getByRole("button", { name: /^8 cars$/i });
    fireEvent.click(eight);
    expect(useGameStore.getState().settings.rivals).toBe(7);
    expect(screen.getByText(/HARRIER/)).toBeTruthy();
    expect(screen.getAllByText(/Racecraft/i).length).toBe(7);
  });

  it("shows the knockout clock, the drop zone and the tyre state", () => {
    reset({
      screen: "racing",
      hud: {
        ...defaultHud,
        carCount: 4,
        knockoutIn: 4.2,
        atRisk: "MAGPIE",
        survivors: 3,
        tyreWear: 0.42,
        tyreTemp: 0.6,
        tyreGrip: 0.95,
        order: [
          { name: "YOU", color: 0x8899aa, isPlayer: true, gap: 0, lap: 1, finished: false },
          { name: "MAGPIE", color: 0xb06a9c, isPlayer: false, gap: 2.1, lap: 1, finished: false },
          { name: "ATLAS", color: 0x4f6b4a, isPlayer: false, gap: 5, lap: 1, finished: false, out: true },
        ],
      },
    });
    const { container } = render(<HUD />);
    const text = container.textContent ?? "";
    expect(text).toContain("Drop in 4.2s");
    expect(text).toContain("MAGPIE");
    expect(text).toContain("3 left");
    expect(text).toContain("OUT");
    expect(text.toLowerCase()).toContain("tyres");
    expect(text).toContain("42%");
  });

  it("offers knockout in the menu and explains the rules", () => {
    reset();
    render(<Menu />);
    fireEvent.click(screen.getByRole("radio", { name: /knockout/i }));
    expect(useGameStore.getState().settings.mode).toBe("knockout");
    expect(screen.getByRole("button", { name: /start knockout/i })).toBeTruthy();
    expect(document.body.textContent).toMatch(/last place is eliminated/i);
  });

  it("lets you choose a tyre compound before the race", () => {
    reset();
    render(<Menu />);
    fireEvent.click(screen.getByRole("button", { name: /garage/i }));
    fireEvent.click(screen.getByRole("radio", { name: /soft/i }));
    expect(useGameStore.getState().settings.tyreCompound).toBe("soft");
  });

  it("lists the race objectives before you start", () => {
    reset();
    render(<Menu />);
    expect(screen.getByText(/objectives/i)).toBeTruthy();
    expect(screen.getAllByText(/\+\d+ cr/).length).toBe(3);
  });

  it("shows which objectives were met on the results screen", () => {
    reset({
      screen: "finished",
      results: {
        position: 2,
        credits: { total: 900, lines: [{ label: "Finished P2", amount: 900 }] },
        objectives: [
          { id: "win-1", label: "Win the race", reward: 400, met: false },
          { id: "clean-1", label: "Keep every lap clean", reward: 230, met: true },
        ],
        weather: "clear",
        standings: null,
        seasonRace: null,
        seasonDone: false,
        totalTime: 142.5,
        lapTimes: [71, 71.5],
        bestLap: 71,
        isRecordLap: false,
        isRecordRace: false,
        bestSectors: [null, null, null],
        cars: [],
        topSpeed: 210,
        driftScore: 900,
        airTime: 2,
        cleanRace: true,
        mode: "race",
        trackId: "sundown",
      },
    });
    const { container } = render(<Results />);
    const text = container.textContent ?? "";
    expect(text).toContain("Keep every lap clean");
    expect(text).toContain("+230 cr");
  });

  it("renders the replay director with its controls", () => {
    reset({
      screen: "replay",
      replay: {
        active: true,
        playing: true,
        time: 12.5,
        duration: 90,
        speed: 1,
        camera: "trackside",
        focus: 1,
        cars: [
          { name: "ATLAS", color: 0x4f6b4a, isPlayer: false },
          { name: "YOU", color: 0x8899aa, isPlayer: true },
        ],
      },
    });
    render(<ReplayOverlay />);
    expect(screen.getByRole("slider", { name: /replay position/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /pause replay/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /follow atlas/i })).toBeTruthy();
    expect(document.body.textContent).toContain("Trackside");
    expect(document.body.textContent).toContain("YOU");
  });

  it("hides the replay director when no replay is playing", () => {
    reset({ screen: "finished" });
    const { container } = render(<ReplayOverlay />);
    expect(container.textContent).toBe("");
  });

  it("renders a fatal error screen instead of the game", () => {
    reset({ fatal: "This browser can't start WebGL." });
    const { container } = render(<App />);
    expect(container.textContent).toContain("WebGL");
  });
});
