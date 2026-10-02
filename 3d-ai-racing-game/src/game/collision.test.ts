import { describe, expect, it } from "vitest";
import { ColliderGrid } from "./collision";
import type { Collider } from "./props";

const c = (x: number, z: number, r = 0.5): Collider => ({ x, z, r });

describe("ColliderGrid", () => {
  it("returns the collider sitting on the query point", () => {
    const grid = new ColliderGrid([c(5, 5)]);
    const out: Collider[] = [];
    expect(grid.query(5, 5, out)).toHaveLength(1);
  });

  it("returns nothing in empty space", () => {
    const grid = new ColliderGrid([c(5, 5)]);
    const out: Collider[] = [];
    expect(grid.query(500, -500, out)).toHaveLength(0);
  });

  it("reuses the output array instead of allocating", () => {
    const grid = new ColliderGrid([c(5, 5)]);
    const out: Collider[] = [];
    const first = grid.query(5, 5, out);
    expect(first).toBe(out);
    grid.query(500, 500, out);
    expect(out).toHaveLength(0);
  });

  it("never misses a collider a car-sized body could touch", () => {
    // Brute force cross-check: every collider within (r + pad) must be found
    // by a single-cell query, which is the whole point of the padding.
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const list: Collider[] = [];
    for (let i = 0; i < 400; i++) {
      list.push(c((rnd() - 0.5) * 400, (rnd() - 0.5) * 400, 0.4 + rnd() * 2.5));
    }
    const grid = new ColliderGrid(list);
    const out: Collider[] = [];
    const carR = grid.pad;
    for (let n = 0; n < 300; n++) {
      const x = (rnd() - 0.5) * 420;
      const z = (rnd() - 0.5) * 420;
      const expected = list.filter((k) => Math.hypot(k.x - x, k.z - z) <= k.r + carR);
      const found = new Set(grid.query(x, z, out));
      for (const e of expected) expect(found.has(e)).toBe(true);
    }
  });

  it("keeps the candidate set far smaller than the full list", () => {
    let seed = 99;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const list: Collider[] = [];
    for (let i = 0; i < 500; i++) list.push(c((rnd() - 0.5) * 500, (rnd() - 0.5) * 500, 0.6));
    const grid = new ColliderGrid(list);
    const out: Collider[] = [];
    let total = 0;
    const samples = 200;
    for (let n = 0; n < samples; n++) {
      grid.query((rnd() - 0.5) * 500, (rnd() - 0.5) * 500, out);
      total += out.length;
    }
    expect(total / samples).toBeLessThan(list.length / 10);
    expect(grid.cellCount).toBeGreaterThan(0);
  });

  it("handles an empty world", () => {
    const grid = new ColliderGrid([]);
    expect(grid.cellCount).toBe(0);
    expect(grid.query(0, 0, [])).toHaveLength(0);
  });
});
