import * as THREE from "three";
import { Noise, clamp, lerp, mulberry32, smoothstep } from "./noise";
import { Track, TRACK_HALF_WIDTH } from "./track";

export const WORLD_SIZE = 580;
export const SEGMENTS = 290;
export const WORLD_RADIUS = 268;

export class Terrain {
  heights: Float32Array;
  mesh: THREE.Mesh;
  step: number;
  half: number;
  noise: Noise;
  private trackDist: Float32Array;

  constructor(noise: Noise, track: Track) {
    this.noise = noise;
    this.step = WORLD_SIZE / SEGMENTS;
    this.half = WORLD_SIZE / 2;
    const N = SEGMENTS + 1;
    this.heights = new Float32Array(N * N);
    this.trackDist = new Float32Array(N * N);

    // --- track heights: smoothed base terrain along the spline
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

    // --- heightmap
    const hw = TRACK_HALF_WIDTH;
    for (let gz = 0; gz < N; gz++) {
      for (let gx = 0; gx < N; gx++) {
        const x = -this.half + gx * this.step;
        const z = -this.half + gz * this.step;
        let h = this.baseHeight(x, z);
        const near = track.nearest(x, z, 34);
        let td = 40;
        if (near.index >= 0) {
          td = track.distanceToTrack(x, z, near.index);
          const d = Math.max(td, near.dist - 3);
          const w = smoothstep(hw + 1.2, hw + 26, d);
          const shoulder = smoothstep(hw + 0.5, hw + 5, d) * 0.35 * (1 - w);
          h = lerp(track.heights[near.index], h, w) + shoulder;
        }
        this.heights[gz * N + gx] = h;
        this.trackDist[gz * N + gx] = td;
      }
    }

    this.mesh = this.buildMesh();
  }

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

  private buildMesh(): THREE.Mesh {
    const N = SEGMENTS + 1;
    const triCount = SEGMENTS * SEGMENTS * 2;
    const positions = new Float32Array(triCount * 9);
    const colors = new Float32Array(triCount * 9);
    const rand = mulberry32(99);

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

    let ptr = 0;
    const px = (gx: number) => -this.half + gx * this.step;
    const pz = (gz: number) => -this.half + gz * this.step;
    const H = (gx: number, gz: number) => this.heights[gz * N + gx];
    const TD = (gx: number, gz: number) => this.trackDist[gz * N + gx];

    const pushTri = (
      ax: number, az: number,
      bx: number, bz: number,
      cx: number, cz: number
    ) => {
      tmpA.set(px(ax), H(ax, az), pz(az));
      tmpB.set(px(bx), H(bx, bz), pz(bz));
      tmpC.set(px(cx), H(cx, cz), pz(cz));
      // normal
      nrm.subVectors(tmpB, tmpA).cross(new THREE.Vector3().subVectors(tmpC, tmpA)).normalize();
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
      c.lerp(dirt, 1 - smoothstep(TRACK_HALF_WIDTH + 0.5, TRACK_HALF_WIDTH + 7, td));
      const v = 0.95 + rand() * 0.1;
      positions[ptr] = tmpA.x; positions[ptr + 1] = tmpA.y; positions[ptr + 2] = tmpA.z;
      positions[ptr + 3] = tmpB.x; positions[ptr + 4] = tmpB.y; positions[ptr + 5] = tmpB.z;
      positions[ptr + 6] = tmpC.x; positions[ptr + 7] = tmpC.y; positions[ptr + 8] = tmpC.z;
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
    mesh.castShadow = true;
    return mesh;
  }
}
