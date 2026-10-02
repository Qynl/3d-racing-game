import * as THREE from "three";
import { nextFrame, type ProgressFn } from "./async";
import { Noise, clamp, lerp, mulberry32, smoothstep } from "./noise";
import { Track } from "./track";

export const WORLD_SIZE = 580;
export const SEGMENTS = 290;
export const WORLD_RADIUS = 268;

export class Terrain {
  heights: Float32Array;
  mesh!: THREE.Mesh;
  step: number;
  half: number;
  noise: Noise;
  /** Nearest track sample index for every grid node (approximate Voronoi). */
  nearIndex: Int32Array;
  /** Lateral distance from the centre line for every grid node. */
  trackDist: Float32Array;
  private track: Track;

  private constructor(noise: Noise, track: Track) {
    this.noise = noise;
    this.track = track;
    this.step = WORLD_SIZE / SEGMENTS;
    this.half = WORLD_SIZE / 2;
    const N = SEGMENTS + 1;
    this.heights = new Float32Array(N * N);
    this.trackDist = new Float32Array(N * N);
    this.nearIndex = new Int32Array(N * N).fill(-1);
  }

  /**
   * Staged construction. Each stage yields to the event loop so the loading
   * screen stays alive and shows honest progress.
   */
  static async create(noise: Noise, track: Track, progress: ProgressFn): Promise<Terrain> {
    const t = new Terrain(noise, track);
    progress(0.05, "Carving the valley");
    await nextFrame();
    t.smoothTrackHeights(track);

    progress(0.18, "Measuring the circuit");
    await nextFrame();
    t.buildNearestField(track);

    progress(0.42, "Raising the dunes");
    await nextFrame();
    t.buildHeightmap(track);

    progress(0.62, "Painting the sand");
    await nextFrame();
    t.mesh = t.buildMesh();
    t.releaseScratch();
    progress(0.76, "Scattering rocks");
    await nextFrame();
    return t;
  }

  // ---------------------------------------------------------------- stages

  /** Flatten the terrain along the spline so the ribbon is drivable. */
  private smoothTrackHeights(track: Track) {
    const M = track.count;
    const raw = new Float32Array(M);
    for (let i = 0; i < M; i++) {
      const p = track.points[i];
      raw[i] = this.baseHeight(p.x, p.z);
    }
    let cur = raw;
    for (let pass = 0; pass < 3; pass++) {
      const next = new Float32Array(M);
      const R = 55;
      let sum = 0;
      for (let k = -R; k <= R; k++) sum += cur[(k + M) % M];
      for (let i = 0; i < M; i++) {
        next[i] = sum / (2 * R + 1);
        sum -= cur[(i - R + M) % M];
        sum += cur[(i + R + 1) % M];
      }
      cur = next;
    }
    for (let i = 0; i < M; i++) {
      track.heights[i] = cur[i];
      track.points[i].y = cur[i];
    }
  }

  /**
   * Approximate nearest-track-sample field via seed + 8-neighbour chamfer sweeps
   * plus a bounded local refine. Replaces ~85M spatial-hash probes with ~4M ops.
   */
  private buildNearestField(track: Track) {
    const N = SEGMENTS + 1;
    const idx = this.nearIndex;
    const d2 = new Float32Array(N * N).fill(Number.MAX_VALUE);
    const pts = track.points;
    const step = this.step;
    const half = this.half;

    // --- seed grid nodes around every track sample
    for (let i = 0; i < track.count; i++) {
      const p = pts[i];
      const gx = Math.round((p.x + half) / step);
      const gz = Math.round((p.z + half) / step);
      for (let oz = -1; oz <= 1; oz++) {
        const cz = gz + oz;
        if (cz < 0 || cz >= N) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const cx = gx + ox;
          if (cx < 0 || cx >= N) continue;
          const wx = -half + cx * step;
          const wz = -half + cz * step;
          const dd = (p.x - wx) * (p.x - wx) + (p.z - wz) * (p.z - wz);
          const k = cz * N + cx;
          if (dd < d2[k]) {
            d2[k] = dd;
            idx[k] = i;
          }
        }
      }
    }

    const relax = (k: number, kn: number, wx: number, wz: number) => {
      const cand = idx[kn];
      if (cand < 0) return;
      const p = pts[cand];
      const dd = (p.x - wx) * (p.x - wx) + (p.z - wz) * (p.z - wz);
      if (dd < d2[k]) {
        d2[k] = dd;
        idx[k] = cand;
      }
    };

    // --- forward sweep
    for (let gz = 0; gz < N; gz++) {
      const wz = -half + gz * step;
      for (let gx = 0; gx < N; gx++) {
        const k = gz * N + gx;
        const wx = -half + gx * step;
        if (gx > 0) relax(k, k - 1, wx, wz);
        if (gz > 0) {
          relax(k, k - N, wx, wz);
          if (gx > 0) relax(k, k - N - 1, wx, wz);
          if (gx < N - 1) relax(k, k - N + 1, wx, wz);
        }
      }
    }
    // --- backward sweep
    for (let gz = N - 1; gz >= 0; gz--) {
      const wz = -half + gz * step;
      for (let gx = N - 1; gx >= 0; gx--) {
        const k = gz * N + gx;
        const wx = -half + gx * step;
        if (gx < N - 1) relax(k, k + 1, wx, wz);
        if (gz < N - 1) {
          relax(k, k + N, wx, wz);
          if (gx < N - 1) relax(k, k + N + 1, wx, wz);
          if (gx > 0) relax(k, k + N - 1, wx, wz);
        }
      }
    }

    // --- bounded refine + lateral distance
    for (let gz = 0; gz < N; gz++) {
      const wz = -half + gz * step;
      for (let gx = 0; gx < N; gx++) {
        const k = gz * N + gx;
        const wx = -half + gx * step;
        const best = track.refine(wx, wz, idx[k] < 0 ? 0 : idx[k], 12);
        idx[k] = best;
        const p = pts[best];
        d2[k] = (p.x - wx) * (p.x - wx) + (p.z - wz) * (p.z - wz);
        this.trackDist[k] = Math.abs(track.distanceToTrack(wx, wz, best));
      }
    }
    this.pointDist = d2;
  }

  private pointDist: Float32Array = new Float32Array(0);

  private buildHeightmap(track: Track) {
    const N = SEGMENTS + 1;
    const hw = track.halfWidth;
    for (let gz = 0; gz < N; gz++) {
      for (let gx = 0; gx < N; gx++) {
        const k = gz * N + gx;
        const x = -this.half + gx * this.step;
        const z = -this.half + gz * this.step;
        let h = this.baseHeight(x, z);
        const near = this.nearIndex[k];
        if (near >= 0) {
          const td = this.trackDist[k];
          const pd = Math.sqrt(this.pointDist[k]);
          const d = Math.max(td, pd - 3);
          const w = smoothstep(hw + 1.2, hw + 26, d);
          const shoulder = smoothstep(hw + 0.5, hw + 5, d) * 0.35 * (1 - w);
          h = lerp(track.heights[near], h, w) + shoulder;
        }
        this.heights[k] = h;
      }
    }
  }

  // ---------------------------------------------------------------- queries

  baseHeight(x: number, z: number): number {
    const n = this.noise;
    const r = Math.sqrt(x * x + z * z);
    let h = n.fbm(x * 0.0042, z * 0.0042, 5, 2.0, 0.5) * 24;
    h += n.fbm(x * 0.024 + 37, z * 0.024 - 11, 2) * 1.4;
    const rim = smoothstep(205, 300, r);
    h += rim * rim * 95 + n.ridged(x * 0.011 + 5, z * 0.011, 3) * rim * 45;
    const hill = smoothstep(96, 22, r);
    h += hill * 36 + hill * n.fbm(x * 0.028, z * 0.028, 2) * 7;
    return h;
  }

  getHeight(x: number, z: number): number {
    const N = SEGMENTS + 1;
    const fx = clamp((x + this.half) / this.step, 0, SEGMENTS - 0.0001);
    const fz = clamp((z + this.half) / this.step, 0, SEGMENTS - 0.0001);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const i00 = iz * N + ix;
    const h00 = this.heights[i00];
    const h10 = this.heights[i00 + 1];
    const h01 = this.heights[i00 + N];
    const h11 = this.heights[i00 + N + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  getNormal(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const e = 1.2;
    const hL = this.getHeight(x - e, z);
    const hR = this.getHeight(x + e, z);
    const hD = this.getHeight(x, z - e);
    const hU = this.getHeight(x, z + e);
    out.set(-(hR - hL) / (2 * e), 1, -(hU - hD) / (2 * e));
    return out.normalize();
  }

  /**
   * The lateral-distance field is only needed while colouring the mesh. Drop it
   * afterwards: at 291x291 nodes it is ~340 kB that would otherwise live for
   * the whole session (and twice that while switching tracks).
   */
  releaseScratch() {
    this.trackDist = new Float32Array(0);
  }

  /** Cheap approximate "which bit of track is nearest" — used by scenery scattering. */
  trackInfoAt(x: number, z: number): { index: number; lateral: number } {
    const N = SEGMENTS + 1;
    const gx = Math.round(clamp((x + this.half) / this.step, 0, SEGMENTS));
    const gz = Math.round(clamp((z + this.half) / this.step, 0, SEGMENTS));
    const seed = this.nearIndex[gz * N + gx];
    const index = this.track.refine(x, z, seed < 0 ? 0 : seed, 6);
    return { index, lateral: this.track.distanceToTrack(x, z, index) };
  }

  // ---------------------------------------------------------------- mesh

  private buildMesh(): THREE.Mesh {
    const N = SEGMENTS + 1;
    const triCount = SEGMENTS * SEGMENTS * 2;
    const positions = new Float32Array(triCount * 9);
    const colors = new Float32Array(triCount * 9);
    const rand = mulberry32(99);
    const hw = this.track.halfWidth;

    const sandLow = new THREE.Color(0xd9b07c);
    const sandMid = new THREE.Color(0xc98f5c);
    const rockHigh = new THREE.Color(0x9f5c45);
    const rockSteep = new THREE.Color(0x76463a);
    const pale = new THREE.Color(0xe6cf9f);
    const dirt = new THREE.Color(0xb07f54);
    const rim = new THREE.Color(0x6e4a44);
    const c = new THREE.Color();
    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    const tmpC = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();

    let ptr = 0;
    const px = (gx: number) => -this.half + gx * this.step;
    const pz = (gz: number) => -this.half + gz * this.step;
    const H = (gx: number, gz: number) => this.heights[gz * N + gx];
    const TD = (gx: number, gz: number) => this.trackDist[gz * N + gx];

    const pushTri = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) => {
      tmpA.set(px(ax), H(ax, az), pz(az));
      tmpB.set(px(bx), H(bx, bz), pz(bz));
      tmpC.set(px(cx), H(cx, cz), pz(cz));
      ab.subVectors(tmpB, tmpA);
      ac.subVectors(tmpC, tmpA);
      nrm.copy(ab).cross(ac).normalize();
      const h = (tmpA.y + tmpB.y + tmpC.y) / 3;
      const mx = (tmpA.x + tmpB.x + tmpC.x) / 3;
      const mz = (tmpA.z + tmpB.z + tmpC.z) / 3;
      const td = (TD(ax, az) + TD(bx, bz) + TD(cx, cz)) / 3;
      const slope = 1 - nrm.y;
      const r = Math.sqrt(mx * mx + mz * mz);

      c.copy(sandLow);
      c.lerp(sandMid, smoothstep(1, 11, h));
      c.lerp(rockHigh, smoothstep(13, 30, h));
      const patch = this.noise.fbm(mx * 0.035 + 200, mz * 0.035, 2);
      c.lerp(pale, smoothstep(0.2, 0.55, patch) * (1 - smoothstep(6, 16, h)) * 0.6);
      c.lerp(rockSteep, smoothstep(0.18, 0.42, slope));
      c.lerp(rim, smoothstep(215, 290, r) * 0.7);
      c.lerp(dirt, 1 - smoothstep(hw + 0.5, hw + 7, td));
      const v = 0.95 + rand() * 0.1;
      positions[ptr] = tmpA.x;
      positions[ptr + 1] = tmpA.y;
      positions[ptr + 2] = tmpA.z;
      positions[ptr + 3] = tmpB.x;
      positions[ptr + 4] = tmpB.y;
      positions[ptr + 5] = tmpB.z;
      positions[ptr + 6] = tmpC.x;
      positions[ptr + 7] = tmpC.y;
      positions[ptr + 8] = tmpC.z;
      for (let k = 0; k < 3; k++) {
        colors[ptr + k * 3] = c.r * v;
        colors[ptr + k * 3 + 1] = c.g * v;
        colors[ptr + k * 3 + 2] = c.b * v;
      }
      ptr += 9;
    };

    for (let gz = 0; gz < SEGMENTS; gz++) {
      for (let gx = 0; gx < SEGMENTS; gx++) {
        if ((gx + gz) % 2 === 0) {
          pushTri(gx, gz, gx, gz + 1, gx + 1, gz);
          pushTri(gx + 1, gz, gx, gz + 1, gx + 1, gz + 1);
        } else {
          pushTri(gx, gz, gx, gz + 1, gx + 1, gz + 1);
          pushTri(gx, gz, gx + 1, gz + 1, gx + 1, gz);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    // The terrain is flat-shaded and self-occluding; casting it into the shadow
    // map costs a full extra pass over 168k triangles for almost no visual gain.
    mesh.castShadow = false;
    mesh.name = "terrain";
    return mesh;
  }
}
