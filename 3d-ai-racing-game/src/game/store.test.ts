import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultHud,
  defaultSettings,
  emptyRecord,
  formatDelta,
  formatGap,
  formatShort,
  formatTime,
  ordinal,
  raceKey,
  useGameStore,
} from "./store";

const reset = () =>
  useGameStore.setState({
    screen: "menu",
    settings: { ...defaultSettings },
    hud: { ...defaultHud },
    results: null,
    records: {},
    toasts: [],
    fatal: null,
    loaded: false,
  });

describe("formatting", () => {
  it("formats lap times as mm:ss.mmm", () => {
    expect(formatTime(0)).toBe("00:00.000");
    expect(formatTime(61.5)).toBe("01:01.500");
    expect(formatTime(599.999)).toBe("09:59.999");
  });

  it("handles missing and non-finite times", () => {
    expect(formatTime(null)).toBe("--:--.---");
    expect(formatTime(undefined)).toBe("--:--.---");
    expect(formatTime(Infinity)).toBe("--:--.---");
    expect(formatTime(NaN)).toBe("--:--.---");
    expect(formatShort(null)).toBe("--.---");
  });

  it("formats negative times with a leading sign", () => {
    expect(formatTime(-1.25)).toBe("-00:01.250");
  });

  it("shortens sub-minute times", () => {
    expect(formatShort(42.318)).toBe("42.318");
    expect(formatShort(72)).toBe("01:12.000");
  });

  it("signs deltas and keeps gaps unsigned", () => {
    expect(formatDelta(0.432)).toBe("+0.432");
    expect(formatDelta(-0.432)).toBe("−0.432");
    expect(formatDelta(0)).toBe("0.000");
    expect(formatDelta(null)).toBe("");
    expect(formatGap(-2.34)).toBe("2.3s");
  });

  it("produces ordinal suffixes", () => {
    expect(ordinal(1)).toBe("st");
    expect(ordinal(2)).toBe("nd");
    expect(ordinal(3)).toBe("rd");
    expect(ordinal(4)).toBe("th");
    expect(ordinal(11)).toBe("th");
    expect(ordinal(12)).toBe("th");
    expect(ordinal(13)).toBe("th");
    expect(ordinal(21)).toBe("st");
  });
});

describe("raceKey", () => {
  it("separates every scoring dimension", () => {
    expect(raceKey("pro", 3, "race", "coyote")).toBe("race:pro:3:coyote");
    expect(raceKey("pro", 3, "race", "coyote")).not.toBe(raceKey("pro", 3, "timetrial", "coyote"));
    expect(raceKey("pro", 3, "race", "coyote")).not.toBe(raceKey("legend", 3, "race", "coyote"));
    expect(raceKey("pro", 3, "race", "coyote")).not.toBe(raceKey("pro", 5, "race", "coyote"));
  });
});

describe("records", () => {
  beforeEach(reset);

  it("starts empty with one slot per sector", () => {
    const r = emptyRecord();
    expect(r.bestLap).toBeNull();
    expect(r.bestSectors).toHaveLength(3);
    expect(useGameStore.getState().recordFor("sundown").bestLap).toBeNull();
  });

  it("stores a first result as a record", () => {
    const key = raceKey("pro", 3, "race", "coyote");
    const beat = useGameStore.getState().commitRecords("sundown", key, 180, 55, [18, 19, 18]);
    expect(beat).toEqual({ lap: true, race: true });
    const rec = useGameStore.getState().recordFor("sundown");
    expect(rec.bestLap).toBe(55);
    expect(rec.races[key]).toBe(180);
    expect(rec.bestSectors).toEqual([18, 19, 18]);
  });

  it("only overwrites when faster, per sector", () => {
    const key = raceKey("pro", 3, "race", "coyote");
    const st = useGameStore.getState();
    st.commitRecords("sundown", key, 180, 55, [18, 19, 18]);
    const beat = useGameStore.getState().commitRecords("sundown", key, 190, 56, [17.5, 20, 18]);
    expect(beat).toEqual({ lap: false, race: false });
    const rec = useGameStore.getState().recordFor("sundown");
    expect(rec.bestLap).toBe(55);
    expect(rec.races[key]).toBe(180);
    // sector one improved even though the lap and race did not
    expect(rec.bestSectors).toEqual([17.5, 19, 18]);
  });

  it("keeps records per track and per race key", () => {
    const a = raceKey("pro", 3, "race", "coyote");
    const b = raceKey("legend", 5, "race", "vulture");
    useGameStore.getState().commitRecords("sundown", a, 180, 55, []);
    useGameStore.getState().commitRecords("sundown", b, 300, 54, []);
    useGameStore.getState().commitRecords("mesa", a, 200, 60, []);
    const sundown = useGameStore.getState().recordFor("sundown");
    expect(sundown.races[a]).toBe(180);
    expect(sundown.races[b]).toBe(300);
    expect(sundown.bestLap).toBe(54);
    expect(useGameStore.getState().recordFor("mesa").bestLap).toBe(60);
  });

  it("ignores a null race time (unfinished session)", () => {
    const key = raceKey("rookie", 1, "timetrial", "coyote");
    const beat = useGameStore.getState().commitRecords("dunes", key, null, 48, [null, 16, null]);
    expect(beat.race).toBe(false);
    expect(beat.lap).toBe(true);
    const rec = useGameStore.getState().recordFor("dunes");
    expect(rec.races[key]).toBeUndefined();
    expect(rec.bestSectors[1]).toBe(16);
  });
});

describe("toasts", () => {
  beforeEach(reset);

  it("assigns ids, caps the queue and drops by id", () => {
    const st = useGameStore.getState();
    for (let i = 0; i < 6; i++) st.pushToast({ text: `t${i}`, kind: "info" });
    const toasts = useGameStore.getState().toasts;
    expect(toasts.length).toBeLessThanOrEqual(4);
    expect(new Set(toasts.map((t) => t.id)).size).toBe(toasts.length);
    useGameStore.getState().dropToast(toasts[0].id);
    expect(useGameStore.getState().toasts.find((t) => t.id === toasts[0].id)).toBeUndefined();
  });
});

describe("settings", () => {
  beforeEach(reset);

  it("merges patches without losing other keys", () => {
    useGameStore.getState().setSettings({ laps: 7 });
    useGameStore.getState().setSettings({ difficulty: "legend" });
    const s = useGameStore.getState().settings;
    expect(s.laps).toBe(7);
    expect(s.difficulty).toBe("legend");
    expect(s.trackId).toBe(defaultSettings.trackId);
  });

  it("has defaults inside valid ranges", () => {
    expect(defaultSettings.masterVolume).toBeGreaterThanOrEqual(0);
    expect(defaultSettings.masterVolume).toBeLessThanOrEqual(1);
    expect(defaultSettings.laps).toBeGreaterThan(0);
    expect(defaultHud.sectorDeltas).toHaveLength(3);
  });
});
