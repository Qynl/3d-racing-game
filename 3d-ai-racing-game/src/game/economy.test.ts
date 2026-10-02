import { describe, expect, it } from "vitest";
import { type PayoutInput, computePayout } from "./economy";

const base: PayoutInput = {
  mode: "race",
  position: 1,
  carCount: 4,
  laps: 3,
  difficulty: "pro",
  weather: "clear",
  cleanRace: true,
  driftScore: 0,
  airTime: 0,
  newLapRecord: false,
  newRaceRecord: false,
};

describe("race payouts", () => {
  it("pays more for winning than for losing", () => {
    const first = computePayout({ ...base, position: 1 }).total;
    const last = computePayout({ ...base, position: 4 }).total;
    expect(first).toBeGreaterThan(last);
    expect(last).toBeGreaterThan(0);
  });

  it("itemises every line and the lines add up to the total", () => {
    const out = computePayout({ ...base, driftScore: 7000, airTime: 3, newLapRecord: true });
    const sum = out.lines.reduce((a, l) => a + l.amount, 0);
    expect(out.total).toBe(Math.round(sum));
    expect(out.lines.some((l) => l.label === "Clean race")).toBe(true);
    expect(out.lines.some((l) => l.label === "New lap record")).toBe(true);
  });

  it("scales with difficulty and weather", () => {
    const rookieClear = computePayout({ ...base, difficulty: "rookie" }).total;
    const legendClear = computePayout({ ...base, difficulty: "legend" }).total;
    const legendStorm = computePayout({ ...base, difficulty: "legend", weather: "sandstorm" }).total;
    expect(legendClear).toBeGreaterThan(rookieClear);
    expect(legendStorm).toBeGreaterThan(legendClear);
  });

  it("caps the drift and air-time bonuses so they can't be farmed", () => {
    const huge = computePayout({ ...base, driftScore: 10_000_000, airTime: 10_000 });
    expect(huge.lines.find((l) => l.label === "Drift score")?.amount).toBe(600);
    expect(huge.lines.find((l) => l.label === "Air time")?.amount).toBe(240);
  });

  it("pays a flat session fee for time trials and a title bonus for seasons", () => {
    const tt = computePayout({ ...base, mode: "timetrial" });
    expect(tt.lines[0].label).toBe("Time trial session");
    const champ = computePayout({ ...base, mode: "championship", seasonFinished: true, seasonWon: true });
    expect(champ.lines.some((l) => l.label === "Championship won")).toBe(true);
    expect(champ.total).toBeGreaterThan(computePayout(base).total);
  });

  it("pays knockout by how long you survived", () => {
    const winner = computePayout({ ...base, mode: "knockout", carCount: 8, position: 1 });
    const firstOut = computePayout({ ...base, mode: "knockout", carCount: 8, position: 8 });
    expect(winner.total).toBeGreaterThan(firstOut.total);
    expect(winner.lines.some((l) => l.label === "Last car standing")).toBe(true);
    expect(firstOut.lines.some((l) => l.label === "Last car standing")).toBe(false);
    expect(firstOut.total).toBeGreaterThan(0);
  });

  it("never returns a negative or fractional total", () => {
    const out = computePayout({ ...base, position: 9, laps: 0, cleanRace: false });
    expect(out.total).toBeGreaterThan(0);
    expect(Number.isInteger(out.total)).toBe(true);
  });
});
