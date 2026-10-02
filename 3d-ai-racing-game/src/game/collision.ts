import type { Collider } from "./props";

/**
 * Uniform-grid broad phase for the static scenery colliders.
 *
 * Every collider is registered into all cells it can possibly touch, padded by
 * the car radius, so a lookup is a single hash hit instead of a scan over the
 * few hundred rocks, cacti and barriers in the world.
 */
export class ColliderGrid {
  private cell: number;
  private map = new Map<number, Collider[]>();
  /** Largest radius the grid was padded for — the biggest querying body. */
  readonly pad: number;

  constructor(list: Collider[], cell = 10, pad = 1.8) {
    this.cell = cell;
    this.pad = pad;
    for (const c of list) {
      const r = Math.ceil((c.r + pad) / cell);
      const cx = Math.floor(c.x / cell);
      const cz = Math.floor(c.z / cell);
      for (let i = -r; i <= r; i++) {
        for (let j = -r; j <= r; j++) {
          const key = (cx + i) * 4096 + (cz + j);
          let arr = this.map.get(key);
          if (!arr) {
            arr = [];
            this.map.set(key, arr);
          }
          arr.push(c);
        }
      }
    }
  }

  /** Number of occupied cells — diagnostics and tests. */
  get cellCount(): number {
    return this.map.size;
  }

  /** Fills `out` with every collider that could overlap a body at (x, z). */
  query(x: number, z: number, out: Collider[]): Collider[] {
    out.length = 0;
    const key = Math.floor(x / this.cell) * 4096 + Math.floor(z / this.cell);
    const arr = this.map.get(key);
    if (arr) out.push(...arr);
    return out;
  }
}
