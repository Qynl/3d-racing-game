import { describe, expect, it } from "vitest";
import { Noise, clamp, damp, lerp, mulberry32, smoothstep, wrapAngle } from "./noise";

describe("mulberry32", () => {
  it("is deterministic for a seed", () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it("differs between seeds and stays in [0,1)", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
    const r = mulberry32(99);
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("Noise", () => {
  it("is deterministic and continuous", () => {
    const n1 = new Noise(7);
    const n2 = new Noise(7);
    expect(n1.fbm(12.5, -3.25, 4)).toBeCloseTo(n2.fbm(12.5, -3.25, 4), 10);
    const a = n1.fbm(10, 10, 4);
    const b = n1.fbm(10.001, 10, 4);
    expect(Math.abs(a - b)).toBeLessThan(0.05);
  });

  it("stays within a sane range", () => {
    const n = new Noise(3);
    for (let i = 0; i < 200; i++) {
      const v = n.fbm(i * 1.7, i * -0.9, 4);
      expect(Math.abs(v)).toBeLessThan(2);
    }
  });
});

describe("math helpers", () => {
  it("clamps", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });

  it("lerps", () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });

  it("smoothsteps with flat ends", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 6);
  });

  it("wraps angles into (-pi, pi]", () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 5);
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(-Math.PI, 5);
    expect(wrapAngle(0.3)).toBeCloseTo(0.3, 10);
  });

  it("damps towards a target and is framerate independent", () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 6, 1 / 60);
    let b = 0;
    for (let i = 0; i < 240; i++) b = damp(b, 1, 6, 1 / 240);
    expect(a).toBeGreaterThan(0.9);
    expect(Math.abs(a - b)).toBeLessThan(0.02);
  });
});
