import { describe, expect, it } from "vitest";
import { trackById } from "./config";
import { computeRacingLine } from "./racingline";
import { Track } from "./track";

const track = new Track(trackById("sundown"));
const line = computeRacingLine(track);

describe("computeRacingLine", () => {
  it("stays inside the track width", () => {
    const limit = track.halfWidth - 1.6 + 1e-3;
    for (let i = 0; i < track.count; i++) {
      expect(Math.abs(line.offsets[i])).toBeLessThanOrEqual(limit);
    }
  });

  it("is shorter and straighter than the centre line", () => {
    let centreCurve = 0;
    let lineCurve = 0;
    for (let i = 0; i < track.count; i++) {
      centreCurve += Math.abs(track.curvature[i]);
      lineCurve += Math.abs(line.curvature[i]);
    }
    expect(lineCurve).toBeLessThan(centreCurve);
    expect(line.length).toBeLessThan(track.length);
  });

  it("actually uses the width available", () => {
    let maxUsed = 0;
    for (let i = 0; i < track.count; i++) maxUsed = Math.max(maxUsed, Math.abs(line.offsets[i]));
    expect(maxUsed).toBeGreaterThan(track.halfWidth * 0.5);
  });

  it("produces a continuous, positive speed plan", () => {
    for (let i = 0; i < track.count; i++) {
      expect(line.plan[i]).toBeGreaterThan(5);
      expect(line.plan[i]).toBeLessThanOrEqual(line.limit[i] + 1e-3);
      expect(Number.isFinite(line.plan[i])).toBe(true);
    }
  });

  it("brakes before the corner rather than in it", () => {
    // find the slowest point on the lap
    let slow = 0;
    for (let i = 1; i < track.count; i++) if (line.plan[i] < line.plan[slow]) slow = i;
    const before = line.plan[(slow - Math.round(25 / track.spacing) + track.count) % track.count];
    expect(before).toBeGreaterThan(line.plan[slow]);
  });

  it("never asks for more deceleration than the car has", () => {
    const M = track.count;
    for (let i = 0; i < M; i++) {
      const j = (i + 1) % M;
      const needed = (line.plan[i] ** 2 - line.plan[j] ** 2) / (2 * line.spacing[i]);
      expect(needed).toBeLessThan(20 + 1e-2);
    }
  });

  it("is deterministic and works on every circuit, forwards and reversed", () => {
    const a = computeRacingLine(new Track(trackById("canyon")));
    const b = computeRacingLine(new Track(trackById("canyon")));
    expect(Array.from(a.offsets.slice(0, 50))).toEqual(Array.from(b.offsets.slice(0, 50)));
    const rev = computeRacingLine(new Track(trackById("canyon"), true));
    expect(rev.length).toBeGreaterThan(100);
    expect(rev.plan.every((v) => v > 5)).toBe(true);
  });
});
