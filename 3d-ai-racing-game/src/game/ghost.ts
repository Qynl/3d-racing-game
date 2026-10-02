import * as THREE from "three";
import { wrapAngle } from "./noise";

/** One recorded pose: time, x, y, z, yaw, roll. */
export const GHOST_STRIDE = 6;
export const GHOST_RATE = 24; // samples per second

export interface GhostLap {
  trackId: string;
  carClassId: string;
  lapTime: number;
  data: Float32Array;
}

export class GhostRecorder {
  private buf: number[] = [];
  private acc = 0;
  private t = 0;

  reset() {
    this.buf.length = 0;
    this.acc = 0;
    this.t = 0;
  }

  sample(dt: number, pos: THREE.Vector3, yaw: number, roll: number, force = false) {
    this.t += dt;
    this.acc += dt;
    const period = 1 / GHOST_RATE;
    if (!force && this.acc < period) return;
    this.acc = 0;
    this.buf.push(this.t, pos.x, pos.y, pos.z, yaw, roll);
  }

  get duration(): number {
    return this.t;
  }

  finish(): Float32Array {
    return new Float32Array(this.buf);
  }
}

export class GhostPlayer {
  private data: Float32Array;
  private cursor = 0;
  readonly duration: number;

  constructor(data: Float32Array) {
    this.data = data;
    this.duration = data.length >= GHOST_STRIDE ? data[data.length - GHOST_STRIDE] : 0;
  }

  get valid(): boolean {
    return this.data.length >= GHOST_STRIDE * 2;
  }

  reset() {
    this.cursor = 0;
  }

  /** Interpolated pose at lap-relative time `t`. Returns false past the end. */
  poseAt(t: number, outPos: THREE.Vector3): { yaw: number; roll: number } | null {
    const d = this.data;
    const n = d.length / GHOST_STRIDE;
    if (n < 2) return null;
    if (t <= d[0]) {
      outPos.set(d[1], d[2], d[3]);
      return { yaw: d[4], roll: d[5] };
    }
    if (t >= d[(n - 1) * GHOST_STRIDE]) return null;
    // forward scan from the cursor (monotonic playback)
    let i = Math.min(this.cursor, n - 2);
    while (i < n - 2 && d[(i + 1) * GHOST_STRIDE] < t) i++;
    while (i > 0 && d[i * GHOST_STRIDE] > t) i--;
    this.cursor = i;
    const a = i * GHOST_STRIDE;
    const b = (i + 1) * GHOST_STRIDE;
    const t0 = d[a];
    const t1 = d[b];
    const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    outPos.set(
      d[a + 1] + (d[b + 1] - d[a + 1]) * f,
      d[a + 2] + (d[b + 2] - d[a + 2]) * f,
      d[a + 3] + (d[b + 3] - d[a + 3]) * f,
    );
    const yaw = d[a + 4] + wrapAngle(d[b + 4] - d[a + 4]) * f;
    const roll = d[a + 5] + (d[b + 5] - d[a + 5]) * f;
    return { yaw, roll };
  }
}

// ---------------------------------------------------------------- persistence

const KEY = "sundown-rally-ghosts-v1";

interface StoredGhost {
  lapTime: number;
  carClassId: string;
  b64: string;
}

function toBase64(buf: Float32Array): string {
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function fromBase64(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

function readAll(): Record<string, StoredGhost> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, StoredGhost>;
  } catch {
    return {};
  }
}

export function loadGhost(trackId: string): GhostLap | null {
  const all = readAll();
  const g = all[trackId];
  if (!g) return null;
  try {
    return { trackId, carClassId: g.carClassId, lapTime: g.lapTime, data: fromBase64(g.b64) };
  } catch {
    return null;
  }
}

export function saveGhost(lap: GhostLap): void {
  try {
    const all = readAll();
    const prev = all[lap.trackId];
    if (prev && prev.lapTime <= lap.lapTime) return;
    all[lap.trackId] = {
      lapTime: lap.lapTime,
      carClassId: lap.carClassId,
      b64: toBase64(lap.data),
    };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* quota or disabled storage — ghosts are a nicety, never fatal */
  }
}
