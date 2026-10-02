import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { WEATHERS } from "./sky";
import { Precipitation } from "./weather";

const camera = () => new THREE.Vector3(10, 4, -6);

describe("Precipitation", () => {
  it("is invisible and costs nothing in clear weather", () => {
    const p = new Precipitation(500);
    p.configure(WEATHERS.clear, camera());
    expect(p.points.visible).toBe(false);
    expect(p.points.geometry.drawRange.count).toBe(0);
    p.dispose();
  });

  it("spawns a capped number of particles for rain", () => {
    const p = new Precipitation(500);
    p.configure(WEATHERS.rain, camera());
    expect(p.points.visible).toBe(true);
    expect(p.points.geometry.drawRange.count).toBe(500);
    p.dispose();
  });

  it("keeps every particle inside the box around the camera", () => {
    const p = new Precipitation(400);
    const c = camera();
    p.configure(WEATHERS.rain, c);
    for (let i = 0; i < 200; i++) p.update(1 / 60, c);
    const pos = p.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < 400; i++) {
      expect(Math.abs(pos.getX(i) - c.x)).toBeLessThanOrEqual(27);
      expect(Math.abs(pos.getY(i) - c.y)).toBeLessThanOrEqual(27);
      expect(Math.abs(pos.getZ(i) - c.z)).toBeLessThanOrEqual(27);
    }
    p.dispose();
  });

  it("follows the camera when it moves", () => {
    const p = new Precipitation(200);
    const c = camera();
    p.configure(WEATHERS.sandstorm, c);
    const far = new THREE.Vector3(400, 4, 400);
    for (let i = 0; i < 400; i++) p.update(1 / 60, far);
    const pos = p.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    let inside = 0;
    for (let i = 0; i < 200; i++) {
      if (Math.abs(pos.getX(i) - far.x) <= 27 && Math.abs(pos.getZ(i) - far.z) <= 27) inside++;
    }
    expect(inside).toBe(200);
    p.dispose();
  });

  it("switches off again when the weather clears", () => {
    const p = new Precipitation(300);
    const c = camera();
    p.configure(WEATHERS.rain, c);
    p.configure(WEATHERS.clear, c);
    expect(p.points.visible).toBe(false);
    p.update(0.016, c); // must be a no-op, not a crash
    p.dispose();
  });
});
