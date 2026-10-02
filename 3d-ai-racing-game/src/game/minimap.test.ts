import { describe, expect, it } from "vitest";
import { trackById } from "./config";
import { computeMinimapBounds } from "./minimap";
import { Track } from "./track";

const track = new Track(trackById("dunes"));

describe("computeMinimapBounds", () => {
  it("fits the whole circuit inside the canvas with a margin", () => {
    const W = 180;
    const H = 180;
    const pad = 16;
    const b = computeMinimapBounds(track, W, H, pad);
    for (const p of track.points) {
      const x = b.offX + (p.x - b.minX) * b.scale;
      const z = b.offZ + (p.z - b.minZ) * b.scale;
      expect(x).toBeGreaterThanOrEqual(pad - 0.001);
      expect(x).toBeLessThanOrEqual(W - pad + 0.001);
      expect(z).toBeGreaterThanOrEqual(pad - 0.001);
      expect(z).toBeLessThanOrEqual(H - pad + 0.001);
    }
  });

  it("centres the circuit", () => {
    const b = computeMinimapBounds(track, 200, 200);
    let minX = Infinity;
    let maxX = -Infinity;
    for (const p of track.points) {
      const x = b.offX + (p.x - b.minX) * b.scale;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    expect(minX + maxX).toBeCloseTo(200, 3);
  });

  it("keeps the aspect ratio square (no stretching)", () => {
    const wide = computeMinimapBounds(track, 400, 100);
    // a single uniform scale is used for both axes
    expect(wide.scale).toBeGreaterThan(0);
    for (const p of track.points) {
      const z = wide.offZ + (p.z - wide.minZ) * wide.scale;
      expect(z).toBeGreaterThanOrEqual(15.999);
      expect(z).toBeLessThanOrEqual(84.001);
    }
  });

  it("works for every circuit", () => {
    for (const id of ["sundown", "mesa", "dunes", "canyon"]) {
      const b = computeMinimapBounds(new Track(trackById(id)), 180, 180);
      expect(Number.isFinite(b.scale)).toBe(true);
      expect(b.scale).toBeGreaterThan(0);
    }
  });
});
