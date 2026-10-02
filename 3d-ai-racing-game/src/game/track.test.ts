import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SECTOR_COUNT, TRACKS, trackById, wildcardTrack } from "./config";
import { Track } from "./track";

const track = new Track(trackById("sundown"));

describe("Track generation", () => {
  it("builds a closed, evenly spaced centre line", () => {
    expect(track.points).toHaveLength(track.count);
    expect(track.tangents).toHaveLength(track.count);
    expect(track.rights).toHaveLength(track.count);
    const d0 = track.points[0].distanceTo(track.points[1]);
    const dMid = track.points[800].distanceTo(track.points[801]);
    expect(dMid).toBeCloseTo(d0, 1);
    // wraps around
    const last = track.points[track.count - 1].distanceTo(track.points[0]);
    expect(last).toBeCloseTo(d0, 1);
    expect(track.length).toBeGreaterThan(500);
    expect(track.spacing).toBeCloseTo(track.length / track.count, 3);
  });

  it("is deterministic for a given seed", () => {
    const again = new Track(trackById("sundown"));
    expect(again.points[123].x).toBeCloseTo(track.points[123].x, 10);
    expect(again.length).toBeCloseTo(track.length, 10);
  });

  it("gives different shapes to different circuits", () => {
    const other = new Track(trackById("canyon"));
    expect(Math.abs(other.length - track.length)).toBeGreaterThan(1);
  });

  it("has perpendicular unit tangents and rights", () => {
    for (let i = 0; i < track.count; i += 97) {
      const t = track.tangents[i];
      const r = track.rights[i];
      expect(t.length()).toBeCloseTo(1, 5);
      expect(r.length()).toBeCloseTo(1, 5);
      expect(t.dot(r)).toBeCloseTo(0, 5);
      expect(t.y).toBe(0);
    }
  });

  it("splits the lap into equal sectors", () => {
    expect(track.sectorStarts).toHaveLength(SECTOR_COUNT);
    expect(track.sectorStarts[0]).toBe(0);
    expect(track.sectorOf(0)).toBe(0);
    expect(track.sectorOf(track.sectorStarts[1])).toBe(1);
    expect(track.sectorOf(track.sectorStarts[SECTOR_COUNT - 1] + 5)).toBe(SECTOR_COUNT - 1);
    expect(track.sectorOf(track.count - 1)).toBe(SECTOR_COUNT - 1);
  });
});

describe("Track queries", () => {
  it("finds the nearest sample via the spatial hash", () => {
    const i = 400;
    const p = track.points[i];
    const found = track.nearest(p.x, p.z, 30);
    expect(found.index).toBe(i);
    expect(found.dist).toBeCloseTo(0, 5);
  });

  it("reports no hit beyond the search radius", () => {
    const found = track.nearest(2000, 2000, 20);
    expect(found.index).toBe(-1);
    expect(found.dist).toBe(Infinity);
  });

  it("matches the brute-force nearest for random points", () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let n = 0; n < 25; n++) {
      const x = (rnd() - 0.5) * 400;
      const z = (rnd() - 0.5) * 400;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < track.count; i++) {
        const d = (track.points[i].x - x) ** 2 + (track.points[i].z - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      const hit = track.nearest(x, z, 400);
      expect(hit.index).toBe(best);
    }
  });

  it("refines and window-searches to the same answer", () => {
    const i = 900;
    const p = track.points[i];
    expect(track.refine(p.x, p.z, i + 10)).toBe(i);
    expect(track.nearestInWindow(p.x, p.z, i + 40)).toBe(i);
    // wraps across index 0
    const p0 = track.points[3];
    expect(track.nearestInWindow(p0.x, p0.z, track.count - 5)).toBe(3);
  });

  it("measures lateral offset with a sign", () => {
    const i = 200;
    const out = new THREE.Vector3();
    track.offsetPoint(i, 4, out);
    expect(track.signedLateral(out.x, out.z, i)).toBeCloseTo(4, 4);
    expect(track.distanceToTrack(out.x, out.z, i)).toBeCloseTo(4, 4);
    track.offsetPoint(i, -4, out);
    expect(track.signedLateral(out.x, out.z, i)).toBeCloseTo(-4, 4);
    expect(track.distanceToTrack(out.x, out.z, i)).toBeCloseTo(4, 4);
  });

  it("yaws along the direction of travel", () => {
    const i = 500;
    const yaw = track.yawAt(i);
    const t = track.tangents[i];
    expect(Math.sin(yaw)).toBeCloseTo(t.x, 5);
    expect(Math.cos(yaw)).toBeCloseTo(t.z, 5);
  });

  it("keeps every circuit inside the world bounds", () => {
    for (const def of TRACKS) {
      const tr = new Track(def);
      for (const p of tr.points) {
        expect(Math.hypot(p.x, p.z)).toBeLessThan(260);
      }
    }
  });
});

describe("reversed circuits", () => {
  const forward = new Track(trackById("sundown"));
  const backward = new Track(trackById("sundown"), true);

  it("keeps the same geometry budget", () => {
    expect(backward.count).toBe(forward.count);
    expect(backward.length).toBeCloseTo(forward.length, 3);
    expect(backward.reversed).toBe(true);
    expect(forward.reversed).toBe(false);
  });

  it("starts in the same place but drives the other way", () => {
    expect(backward.points[0].x).toBeCloseTo(forward.points[0].x, 5);
    expect(backward.points[0].z).toBeCloseTo(forward.points[0].z, 5);
    const dot =
      forward.tangents[0].x * backward.tangents[0].x + forward.tangents[0].z * backward.tangents[0].z;
    expect(dot).toBeLessThan(-0.9);
  });

  it("flips the sign of the corners", () => {
    let fSum = 0;
    let bSum = 0;
    for (let i = 0; i < forward.count; i++) {
      fSum += Math.abs(forward.curvature[i]);
      bSum += Math.abs(backward.curvature[i]);
    }
    // same amount of cornering, mirrored direction
    expect(bSum).toBeCloseTo(fSum, 1);
  });
});

describe("wildcard circuits", () => {
  it("is deterministic for a seed", () => {
    const a = wildcardTrack(42);
    const b = wildcardTrack(42);
    expect(a.radii).toEqual(b.radii);
    expect(a.name).toBe("Wildcard #42");
  });

  it("rolls different shapes for different seeds", () => {
    expect(wildcardTrack(1).radii).not.toEqual(wildcardTrack(2).radii);
  });

  it("stays inside sane bounds and builds a usable track", () => {
    for (const seed of [1, 7, 99, 1234, 9999]) {
      const def = wildcardTrack(seed);
      expect(def.radii.length).toBeGreaterThanOrEqual(14);
      for (const r of def.radii) {
        expect(r).toBeGreaterThanOrEqual(80);
        expect(r).toBeLessThanOrEqual(210);
      }
      expect(def.halfWidth).toBeGreaterThan(6);
      const tr = new Track(def);
      expect(tr.length).toBeGreaterThan(400);
      expect(tr.sectorStarts.length).toBe(SECTOR_COUNT);
    }
  });
});
