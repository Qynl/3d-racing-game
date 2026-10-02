import * as THREE from "three";
import type { TrackDef } from "./config";
import { SECTOR_COUNT } from "./config";
import { mulberry32 } from "./noise";

/** Fallback half-width; the authoritative value lives on each Track instance. */
export const TRACK_HALF_WIDTH = 7.2;

export class Track {
  readonly def: TrackDef;
  readonly halfWidth: number;
  points: THREE.Vector3[] = [];
  tangents: THREE.Vector3[] = [];
  rights: THREE.Vector3[] = [];
  curvature: Float32Array;
  heights: Float32Array;
  /** Index of the first sample of each sector. */
  sectorStarts: number[] = [];
  count: number;
  spacing: number;
  length: number;
  private grid = new Map<number, number[]>();
  private cell = 12;

  readonly reversed: boolean;

  constructor(def: TrackDef, reversed = false) {
    this.def = def;
    this.reversed = reversed;
    this.halfWidth = def.halfWidth;
    const rand = mulberry32(def.seed);
    const radii = def.radii;
    const n = radii.length;
    const ctrl: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.12;
      const r = radii[i] * (0.97 + rand() * 0.06);
      ctrl.push(new THREE.Vector3(Math.cos(ang) * r * def.stretch[0], 0, Math.sin(ang) * r * def.stretch[1]));
    }
    const curve = new THREE.CatmullRomCurve3(ctrl, true, "centripetal");
    const M = 1600;
    const pts = curve.getSpacedPoints(M);
    pts.pop();
    if (reversed) {
      // Drive the same ribbon the other way: keep sample 0 where it was so the
      // grid, start line and minimap framing stay put, then flip the order.
      const head = pts.shift()!;
      pts.reverse();
      pts.unshift(head);
    }
    this.points = pts;
    this.count = M;
    this.length = curve.getLength();
    this.spacing = this.length / M;
    this.heights = new Float32Array(M);
    this.curvature = new Float32Array(M);

    for (let i = 0; i < M; i++) {
      const prev = pts[(i - 1 + M) % M];
      const next = pts[(i + 1) % M];
      const t = new THREE.Vector3().subVectors(next, prev);
      t.y = 0;
      t.normalize();
      this.tangents.push(t);
      this.rights.push(new THREE.Vector3(-t.z, 0, t.x));
    }
    const raw = new Float32Array(M);
    for (let i = 0; i < M; i++) {
      const t0 = this.tangents[(i - 2 + M) % M];
      const t1 = this.tangents[(i + 2) % M];
      // positive = right turn
      const s = t0.x * t1.z - t0.z * t1.x;
      raw[i] = Math.asin(Math.max(-1, Math.min(1, s))) / (4 * this.spacing);
    }
    // smooth curvature
    const R = 8;
    for (let i = 0; i < M; i++) {
      let sum = 0;
      for (let k = -R; k <= R; k++) sum += raw[(i + k + M) % M];
      this.curvature[i] = sum / (2 * R + 1);
    }

    for (let s = 0; s < SECTOR_COUNT; s++) {
      this.sectorStarts.push(Math.round((s / SECTOR_COUNT) * M) % M);
    }

    // spatial hash
    for (let i = 0; i < M; i++) {
      const key = this.key(pts[i].x, pts[i].z);
      let arr = this.grid.get(key);
      if (!arr) {
        arr = [];
        this.grid.set(key, arr);
      }
      arr.push(i);
    }
  }

  private key(x: number, z: number): number {
    const cx = Math.floor(x / this.cell) + 200;
    const cz = Math.floor(z / this.cell) + 200;
    return cx * 1000 + cz;
  }

  /** Which sector a sample index belongs to. */
  sectorOf(index: number): number {
    for (let s = SECTOR_COUNT - 1; s >= 0; s--) {
      if (index >= this.sectorStarts[s]) return s;
    }
    return 0;
  }

  /** Nearest sample index within maxDist using the spatial hash. index = -1 if none. */
  nearest(x: number, z: number, maxDist: number): { index: number; dist: number } {
    const cr = Math.ceil(maxDist / this.cell);
    const cx = Math.floor(x / this.cell) + 200;
    const cz = Math.floor(z / this.cell) + 200;
    let best = -1;
    let bestD = maxDist * maxDist;
    for (let i = -cr; i <= cr; i++) {
      for (let j = -cr; j <= cr; j++) {
        const arr = this.grid.get((cx + i) * 1000 + (cz + j));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const p = this.points[arr[k]];
          const dx = p.x - x;
          const dz = p.z - z;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = arr[k];
          }
        }
      }
    }
    return { index: best, dist: best >= 0 ? Math.sqrt(bestD) : Infinity };
  }

  /** Refine a candidate index to the true local minimum (cheap, bounded). */
  refine(x: number, z: number, startIdx: number, window = 24): number {
    const M = this.count;
    const origin = ((startIdx % M) + M) % M;
    let best = origin;
    let bestD = Infinity;
    for (let k = -window; k <= window; k++) {
      const i = (origin + k + M) % M;
      const p = this.points[i];
      const dx = p.x - x;
      const dz = p.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Nearest sample near a previously known index (fast per-frame tracking). */
  nearestInWindow(x: number, z: number, startIdx: number, window = 80): number {
    const M = this.count;
    let best = startIdx;
    let bestD = Infinity;
    for (let k = -window; k <= window; k++) {
      const i = (startIdx + k + M) % M;
      const p = this.points[i];
      const dx = p.x - x;
      const dz = p.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  distanceToTrack(x: number, z: number, idx: number): number {
    const p = this.points[idx];
    const r = this.rights[idx];
    // lateral distance along right vector (more accurate than point distance)
    return Math.abs((x - p.x) * r.x + (z - p.z) * r.z);
  }

  signedLateral(x: number, z: number, idx: number): number {
    const p = this.points[idx];
    const r = this.rights[idx];
    return (x - p.x) * r.x + (z - p.z) * r.z;
  }

  yawAt(i: number): number {
    const t = this.tangents[i];
    return Math.atan2(t.x, t.z);
  }

  offsetPoint(i: number, lateral: number, out: THREE.Vector3): THREE.Vector3 {
    const p = this.points[i];
    const r = this.rights[i];
    return out.set(p.x + r.x * lateral, p.y, p.z + r.z * lateral);
  }
}

/** Builds the dirt ribbon mesh of the track. */
export function buildTrackMesh(track: Track, getHeight: (x: number, z: number) => number): THREE.Mesh {
  const M = track.count;
  const hw = track.halfWidth;
  const offsets = [-1, -0.9, -0.78, -0.42, 0.42, 0.78, 0.9, 1];
  const edge = new THREE.Color(0xa8784f);
  const mid = new THREE.Color(0x8a5f41);
  const groove = new THREE.Color(0x7a5238);
  const cols = [edge, edge, mid, groove, groove, mid, edge, edge];
  const across = offsets.length;
  const positions = new Float32Array(M * across * 3);
  const colors = new Float32Array(M * across * 3);
  const uvs = new Float32Array(M * across * 2);
  const indices: number[] = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < across; j++) {
      track.offsetPoint(i, offsets[j] * hw, tmp);
      const y = getHeight(tmp.x, tmp.z) + 0.1 - Math.abs(offsets[j]) * 0.08;
      const vi = i * across + j;
      positions[vi * 3] = tmp.x;
      positions[vi * 3 + 1] = y;
      positions[vi * 3 + 2] = tmp.z;
      const shade = 0.94 + Math.sin(i * 0.37) * 0.02 + Math.sin(i * 1.7 + j) * 0.02;
      colors[vi * 3] = cols[j].r * shade;
      colors[vi * 3 + 1] = cols[j].g * shade;
      colors[vi * 3 + 2] = cols[j].b * shade;
      uvs[vi * 2] = (offsets[j] + 1) * 0.5;
      uvs[vi * 2 + 1] = (i * track.spacing) / 4;
    }
  }
  for (let i = 0; i < M; i++) {
    const n = (i + 1) % M;
    for (let j = 0; j < across - 1; j++) {
      const a = i * across + j;
      const b = i * across + j + 1;
      const c = n * across + j;
      const d = n * across + j + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = "track";
  return mesh;
}

/** Optional driving-line overlay — a glowing ribbon through the ideal line. */
export function buildRacingLine(track: Track, getHeight: (x: number, z: number) => number): THREE.Mesh {
  const M = track.count;
  const hw = track.halfWidth;
  const half = 0.42;
  const positions = new Float32Array(M * 2 * 3);
  const colors = new Float32Array(M * 2 * 3);
  const indices: number[] = [];
  const tmp = new THREE.Vector3();
  const fast = new THREE.Color(0x5fe08a);
  const slow = new THREE.Color(0xe2593f);
  const c = new THREE.Color();
  // Smooth the "inside of the corner" offset to approximate a racing line.
  const lateral = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    const k = track.curvature[i];
    lateral[i] = Math.max(-1, Math.min(1, k * 70)) * (hw - 2.1);
  }
  const smoothed = new Float32Array(M);
  const R = 40;
  for (let i = 0; i < M; i++) {
    let sum = 0;
    for (let k = -R; k <= R; k++) sum += lateral[(i + k + M) % M];
    smoothed[i] = sum / (2 * R + 1);
  }
  for (let i = 0; i < M; i++) {
    const kAbs = Math.abs(track.curvature[i]);
    c.copy(fast).lerp(slow, Math.min(1, kAbs * 55));
    for (let j = 0; j < 2; j++) {
      track.offsetPoint(i, smoothed[i] + (j === 0 ? -half : half), tmp);
      const vi = i * 2 + j;
      positions[vi * 3] = tmp.x;
      positions[vi * 3 + 1] = getHeight(tmp.x, tmp.z) + 0.16;
      positions[vi * 3 + 2] = tmp.z;
      colors[vi * 3] = c.r;
      colors[vi * 3 + 1] = c.g;
      colors[vi * 3 + 2] = c.b;
    }
  }
  for (let i = 0; i < M; i++) {
    const n = (i + 1) % M;
    indices.push(i * 2, i * 2 + 1, n * 2, i * 2 + 1, n * 2 + 1, n * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.visible = false;
  mesh.name = "racingLine";
  return mesh;
}

export function makeCheckerTexture(cols: number, rows: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = cols * 16;
  c.height = rows * 16;
  const ctx = c.getContext("2d")!;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#f1ebe0" : "#26221f";
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function buildStartLine(track: Track, getHeight: (x: number, z: number) => number): THREE.Group {
  const g = new THREE.Group();
  const p = track.points[0];
  g.position.set(p.x, getHeight(p.x, p.z) + 0.16, p.z);
  g.rotation.y = track.yawAt(0);
  const tex = makeCheckerTexture(16, 3);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(track.halfWidth * 2, 2.2),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  g.add(plane);
  g.name = "startLine";
  return g;
}

export interface StartGantry {
  group: THREE.Group;
  /**
   * Lights the countdown bulbs: 3/2/1 light up red one at a time, 0 turns the
   * whole bar green for the start, and -1 switches everything off.
   */
  setLights: (n: number) => void;
  dispose: () => void;
}

/**
 * Start/finish gantry: two pylons, a banner across the top and five bulbs that
 * actually run the countdown you can see from the grid.
 */
export function buildStartGantry(track: Track, getHeight: (x: number, z: number) => number): StartGantry {
  const group = new THREE.Group();
  group.name = "gantry";
  const p = track.points[0];
  const baseY = getHeight(p.x, p.z);
  group.position.set(p.x, baseY, p.z);
  group.rotation.y = track.yawAt(0);

  const span = track.halfWidth * 2 + 4.5;
  const height = 7.2;
  const mats: THREE.Material[] = [];
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.55, metalness: 0.55 });
  const banner = new THREE.MeshStandardMaterial({ color: 0xc2553a, roughness: 0.85 });
  mats.push(steel, banner);

  const legGeo = new THREE.CylinderGeometry(0.22, 0.28, height, 8);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, steel);
    leg.position.set((side * span) / 2, height / 2, 0);
    leg.castShadow = true;
    group.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), steel);
    foot.position.set((side * span) / 2, 0.25, 0);
    group.add(foot);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 0.45, 0.5), steel);
  beam.position.y = height;
  beam.castShadow = true;
  group.add(beam);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(span * 0.78, 1.5, 0.18), banner);
  sign.position.set(0, height - 1.15, 0.12);
  group.add(sign);

  // --- countdown bulbs
  const bulbs: THREE.Mesh[] = [];
  const bulbGeo = new THREE.SphereGeometry(0.33, 12, 8);
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a2320,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.4,
    });
    mats.push(mat);
    const bulb = new THREE.Mesh(bulbGeo, mat);
    bulb.position.set((i - 2) * 1.25, height - 0.62, 0.42);
    group.add(bulb);
    bulbs.push(bulb);
  }

  const setLights = (n: number) => {
    for (let i = 0; i < bulbs.length; i++) {
      const m = bulbs[i].material as THREE.MeshStandardMaterial;
      let on = false;
      let green = false;
      if (n === 0) {
        on = true;
        green = true;
      } else if (n > 0) {
        // 3 -> two outer bulbs, 2 -> four, 1 -> all five red
        on = i < Math.min(5, 2 * (4 - n) - 1);
      }
      m.color.set(on ? (green ? 0x2f7f4a : 0x5a1f16) : 0x2a2320);
      m.emissive.set(on ? (green ? 0x3cff8a : 0xff3b22) : 0x000000);
      m.emissiveIntensity = on ? 3.2 : 0;
    }
  };
  setLights(-1);

  const dispose = () => {
    legGeo.dispose();
    bulbGeo.dispose();
    for (const m of mats) m.dispose();
  };

  return { group, setLights, dispose };
}
