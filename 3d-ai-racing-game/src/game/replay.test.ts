import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  REPLAY_RATE,
  ReplayRecorder,
  busiestMoment,
  makePose,
  sampleReplay,
  type RecordableCar,
} from "./replay";

function car(x: number, z: number, yaw = 0, speed = 30, alive = true): RecordableCar {
  return { pos: new THREE.Vector3(x, 0, z), yaw, roll: 0, speed, alive };
}

/** Records `seconds` of two cars driving straight down +z at different speeds. */
function record(seconds: number, dt = 1 / 60) {
  const rec = new ReplayRecorder();
  rec.reset([
    { name: "YOU", color: 0x111111, isPlayer: true },
    { name: "ATLAS", color: 0x222222, isPlayer: false },
  ]);
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const t = i * dt;
    rec.sample(dt, [car(0, t * 30), car(4, t * 20)]);
  }
  return rec;
}

describe("ReplayRecorder", () => {
  it("records at the advertised rate", () => {
    const rec = record(10);
    expect(rec.frameCount).toBeGreaterThan(10 * REPLAY_RATE - 3);
    expect(rec.frameCount).toBeLessThan(10 * REPLAY_RATE + 3);
    expect(rec.duration).toBeGreaterThan(9.5);
  });

  it("produces nothing useful from an empty session", () => {
    const rec = new ReplayRecorder();
    rec.reset([{ name: "YOU", color: 1, isPlayer: true }]);
    expect(rec.finish()).toBeNull();
    rec.sample(1, [car(0, 0)], true);
    expect(rec.finish()).toBeNull();
  });

  it("grows past its initial allocation without losing frames", () => {
    const rec = record(150);
    const replay = rec.finish()!;
    expect(replay.frames).toBeGreaterThan(140 * REPLAY_RATE);
    const pose = makePose();
    sampleReplay(replay, 140, 0, pose);
    expect(pose.pos.z).toBeGreaterThan(4000);
  });

  it("stays within a sane memory budget for a long race", () => {
    const rec = record(300);
    // Two cars, five minutes: well under ten megabytes.
    expect(rec.bytes).toBeLessThan(10_000_000);
  });
});

describe("sampleReplay", () => {
  it("interpolates between recorded frames", () => {
    const replay = record(5).finish()!;
    const pose = makePose();
    sampleReplay(replay, 2, 0, pose);
    expect(pose.pos.z).toBeGreaterThan(55);
    expect(pose.pos.z).toBeLessThan(65);
    sampleReplay(replay, 2.025, 0, pose);
    const mid = pose.pos.z;
    sampleReplay(replay, 2.05, 0, pose);
    expect(mid).toBeLessThan(pose.pos.z);
  });

  it("clamps to the ends instead of reading out of bounds", () => {
    const replay = record(3).finish()!;
    const pose = makePose();
    sampleReplay(replay, -10, 1, pose);
    expect(Number.isFinite(pose.pos.z)).toBe(true);
    sampleReplay(replay, 9999, 1, pose);
    expect(Number.isFinite(pose.pos.z)).toBe(true);
    expect(pose.pos.x).toBeCloseTo(4, 3);
  });

  it("takes the short way round the yaw seam", () => {
    const rec = new ReplayRecorder();
    rec.reset([{ name: "YOU", color: 1, isPlayer: true }]);
    const dt = 1 / REPLAY_RATE;
    rec.sample(dt, [car(0, 0, Math.PI - 0.05)], true);
    rec.sample(dt, [car(0, 0, -Math.PI + 0.05)], true);
    const replay = rec.finish()!;
    const pose = makePose();
    sampleReplay(replay, 0.5 / REPLAY_RATE, 0, pose);
    // Halfway across the seam, not halfway around the world.
    expect(Math.abs(Math.abs(pose.yaw) - Math.PI)).toBeLessThan(0.1);
  });

  it("keeps eliminated cars switched off", () => {
    const rec = new ReplayRecorder();
    rec.reset([
      { name: "YOU", color: 1, isPlayer: true },
      { name: "OUT", color: 2, isPlayer: false },
    ]);
    const dt = 1 / REPLAY_RATE;
    rec.sample(dt, [car(0, 0), car(5, 0, 0, 30, true)], true);
    rec.sample(dt, [car(0, 1), car(5, 0, 0, 0, false)], true);
    rec.sample(dt, [car(0, 2), car(5, 0, 0, 0, false)], true);
    const replay = rec.finish()!;
    const pose = makePose();
    sampleReplay(replay, 0, 1, pose);
    expect(pose.alive).toBe(false); // frame 0 -> 1 straddles the elimination
    sampleReplay(replay, 2 / REPLAY_RATE, 1, pose);
    expect(pose.alive).toBe(false);
    sampleReplay(replay, 0, 0, pose);
    expect(pose.alive).toBe(true);
  });
});

describe("busiestMoment", () => {
  it("finds the time when cars are closest together", () => {
    const rec = new ReplayRecorder();
    rec.reset([
      { name: "A", color: 1, isPlayer: true },
      { name: "B", color: 2, isPlayer: false },
    ]);
    const dt = 1 / REPLAY_RATE;
    // B closes on A, touches at t = 1 s, then drops away again.
    for (let i = 0; i < 2 * REPLAY_RATE; i++) {
      const t = i * dt;
      const gap = Math.abs(1 - t) * 40 + 1;
      rec.sample(dt, [car(0, 0), car(gap, 0)], true);
    }
    const best = busiestMoment(rec.finish()!);
    expect(best).toBeGreaterThan(0.8);
    expect(best).toBeLessThan(1.2);
  });

  it("is harmless with a single car", () => {
    const rec = new ReplayRecorder();
    rec.reset([{ name: "A", color: 1, isPlayer: true }]);
    rec.sample(1, [car(0, 0)], true);
    rec.sample(1, [car(0, 1)], true);
    expect(busiestMoment(rec.finish()!)).toBe(0);
  });
});
