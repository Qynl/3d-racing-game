import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { GHOST_RATE, GHOST_STRIDE, GhostPlayer, GhostRecorder } from "./ghost";

function recordStraightLine(seconds: number, dt = 1 / 60): Float32Array {
  const rec = new GhostRecorder();
  const p = new THREE.Vector3();
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    p.set(i * dt * 10, 0, 0);
    rec.sample(dt, p, 0, 0, i === steps - 1);
  }
  return rec.finish();
}

describe("GhostRecorder", () => {
  it("samples at roughly the ghost rate", () => {
    const data = recordStraightLine(2);
    const frames = data.length / GHOST_STRIDE;
    expect(data.length % GHOST_STRIDE).toBe(0);
    expect(frames).toBeGreaterThan(GHOST_RATE * 2 * 0.8);
    expect(frames).toBeLessThan(GHOST_RATE * 2 * 1.4);
  });

  it("tracks elapsed time and resets cleanly", () => {
    const rec = new GhostRecorder();
    const p = new THREE.Vector3();
    for (let i = 0; i < 60; i++) rec.sample(1 / 60, p, 0, 0);
    expect(rec.duration).toBeCloseTo(1, 5);
    rec.reset();
    expect(rec.duration).toBe(0);
    expect(rec.finish().length).toBe(0);
  });

  it("stores monotonically increasing timestamps", () => {
    const data = recordStraightLine(3);
    for (let i = GHOST_STRIDE; i < data.length; i += GHOST_STRIDE) {
      expect(data[i]).toBeGreaterThan(data[i - GHOST_STRIDE]);
    }
  });
});

describe("GhostPlayer", () => {
  it("rejects degenerate recordings", () => {
    expect(new GhostPlayer(new Float32Array(0)).valid).toBe(false);
    expect(new GhostPlayer(new Float32Array(GHOST_STRIDE)).valid).toBe(false);
    expect(new GhostPlayer(recordStraightLine(2)).valid).toBe(true);
  });

  it("reports the recorded duration", () => {
    const player = new GhostPlayer(recordStraightLine(2));
    expect(player.duration).toBeGreaterThan(1.8);
    expect(player.duration).toBeLessThanOrEqual(2.01);
  });

  it("interpolates between samples", () => {
    const player = new GhostPlayer(recordStraightLine(2));
    const pos = new THREE.Vector3();
    expect(player.poseAt(0.5, pos)).not.toBeNull();
    const x1 = pos.x;
    // the car travels at 10 m/s along +x
    expect(x1).toBeCloseTo(5, 0);
    expect(player.poseAt(1.0, pos)).not.toBeNull();
    expect(pos.x).toBeGreaterThan(x1);
    expect(pos.x).toBeCloseTo(10, 0);
  });

  it("clamps before the first sample and ends after the last", () => {
    const player = new GhostPlayer(recordStraightLine(2));
    const pos = new THREE.Vector3();
    expect(player.poseAt(-5, pos)).not.toBeNull();
    expect(pos.x).toBeLessThan(1);
    expect(player.poseAt(99, pos)).toBeNull();
  });

  it("can seek backwards after a reset", () => {
    const player = new GhostPlayer(recordStraightLine(2));
    const pos = new THREE.Vector3();
    player.poseAt(1.8, pos);
    const far = pos.x;
    player.reset();
    player.poseAt(0.25, pos);
    expect(pos.x).toBeLessThan(far);
    expect(pos.x).toBeCloseTo(2.5, 0);
  });

  it("returns a yaw and roll alongside the position", () => {
    const rec = new GhostRecorder();
    const p = new THREE.Vector3();
    for (let i = 0; i < 120; i++) {
      p.set(i, 0, 0);
      rec.sample(1 / 60, p, i * 0.01, 0.1, false);
    }
    const player = new GhostPlayer(rec.finish());
    const pose = player.poseAt(1, new THREE.Vector3());
    expect(pose).not.toBeNull();
    expect(pose!.roll).toBeCloseTo(0.1, 5);
    expect(pose!.yaw).toBeGreaterThan(0);
  });
});
