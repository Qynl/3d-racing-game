import { describe, expect, it } from "vitest";
import {
  checkObjective,
  evaluateObjectives,
  objectiveReward,
  objectiveSeed,
  objectivesFor,
  type ObjectiveContext,
  type RaceOutcome,
} from "./objectives";

const ctx: ObjectiveContext = {
  trackId: "sundown",
  mode: "race",
  laps: 3,
  difficulty: "pro",
  rivals: 3,
};

const outcome = (patch: Partial<RaceOutcome> = {}): RaceOutcome => ({
  position: 1,
  carCount: 4,
  lapsCompleted: 3,
  overtakes: 3,
  driftScore: 2000,
  airTime: 4,
  topSpeedKmh: 215,
  cleanRace: true,
  tyreWear: 0.3,
  damage: 0.05,
  survived: 3,
  ...patch,
});

describe("objective generation", () => {
  it("always offers exactly three goals with distinct kinds", () => {
    for (const mode of ["race", "knockout", "timetrial", "championship"]) {
      const list = objectivesFor({ ...ctx, mode });
      expect(list).toHaveLength(3);
      expect(new Set(list.map((o) => o.kind)).size).toBe(3);
      for (const o of list) {
        expect(o.reward).toBeGreaterThan(0);
        expect(o.label.length).toBeGreaterThan(5);
      }
    }
  });

  it("is stable for a configuration so you can retry a goal", () => {
    const a = objectivesFor(ctx).map((o) => o.id);
    const b = objectivesFor({ ...ctx }).map((o) => o.id);
    expect(a).toEqual(b);
  });

  it("changes when the race changes", () => {
    const base = objectivesFor(ctx).map((o) => o.id).join();
    const other = objectivesFor({ ...ctx, trackId: "canyon" }).map((o) => o.id).join();
    const laps = objectivesFor({ ...ctx, laps: 7 }).map((o) => o.id).join();
    expect(objectiveSeed(ctx)).not.toBe(objectiveSeed({ ...ctx, trackId: "canyon" }));
    expect([other, laps].some((v) => v !== base)).toBe(true);
  });

  it("pays more on harder difficulties", () => {
    const rookie = objectivesFor({ ...ctx, difficulty: "rookie" });
    const legend = objectivesFor({ ...ctx, difficulty: "legend" });
    const sum = (l: typeof rookie) => l.reduce((t, o) => t + o.reward, 0);
    expect(sum(legend)).toBeGreaterThan(sum(rookie));
  });

  it("never asks a time trial to win a race", () => {
    const list = objectivesFor({ ...ctx, mode: "timetrial", rivals: 0 });
    expect(list.some((o) => o.kind === "win" || o.kind === "podium")).toBe(false);
  });

  it("asks knockout racers to survive", () => {
    const list = objectivesFor({ ...ctx, mode: "knockout", rivals: 7 });
    const ids = list.map((o) => o.kind);
    expect(ids.some((k) => ["survive", "win", "overtakes", "noDamage", "drift"].includes(k))).toBe(true);
  });
});

describe("objective evaluation", () => {
  it("checks each kind against the outcome", () => {
    const cases: [Parameters<typeof checkObjective>[0], RaceOutcome, boolean][] = [
      [{ id: "a", kind: "win", target: 1, label: "", reward: 1 }, outcome({ position: 1 }), true],
      [{ id: "a", kind: "win", target: 1, label: "", reward: 1 }, outcome({ position: 2 }), false],
      [{ id: "b", kind: "podium", target: 3, label: "", reward: 1 }, outcome({ position: 3 }), true],
      [{ id: "c", kind: "beat", target: 2, label: "", reward: 1 }, outcome({ position: 2, carCount: 4 }), true],
      [{ id: "d", kind: "overtakes", target: 4, label: "", reward: 1 }, outcome({ overtakes: 3 }), false],
      [{ id: "e", kind: "drift", target: 1500, label: "", reward: 1 }, outcome({ driftScore: 1500 }), true],
      [{ id: "f", kind: "air", target: 3, label: "", reward: 1 }, outcome({ airTime: 2.9 }), false],
      [{ id: "g", kind: "topSpeed", target: 210, label: "", reward: 1 }, outcome({ topSpeedKmh: 211 }), true],
      [{ id: "h", kind: "clean", target: 1, label: "", reward: 1 }, outcome({ cleanRace: false }), false],
      [{ id: "i", kind: "tyres", target: 0.5, label: "", reward: 1 }, outcome({ tyreWear: 0.51 }), false],
      [{ id: "j", kind: "noDamage", target: 0.15, label: "", reward: 1 }, outcome({ damage: 0.1 }), true],
      [{ id: "k", kind: "survive", target: 4, label: "", reward: 1 }, outcome({ survived: 4 }), true],
    ];
    for (const [o, r, want] of cases) {
      expect(checkObjective(o, r), `${o.kind}`).toBe(want);
    }
  });

  it("only pays for the goals that were met", () => {
    const list = [
      { id: "a", kind: "win" as const, target: 1, label: "Win", reward: 400 },
      { id: "b", kind: "drift" as const, target: 9999, label: "Drift", reward: 200 },
    ];
    const res = evaluateObjectives(list, outcome());
    expect(res.map((r) => r.met)).toEqual([true, false]);
    expect(objectiveReward(res)).toBe(400);
  });

  it("awards nothing for an empty set", () => {
    expect(objectiveReward([])).toBe(0);
    expect(evaluateObjectives([], outcome())).toEqual([]);
  });
});
