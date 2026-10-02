import * as THREE from "three";
import { wrapAngle } from "./noise";

/**
 * Race replays.
 *
 * Every car's pose is sampled at a fixed rate into one flat Float32Array, which
 * keeps a full race in a couple of megabytes and makes seeking a constant-time
 * index calculation rather than a search. Poses are interpolated on playback so
 * a 20 Hz recording plays back smoothly at any frame rate or speed.
 */
export const REPLAY_RATE = 20;
/** x, y, z, yaw, roll, speed, alive */
export const REPLAY_STRIDE = 7;
/** Hard cap so a forgotten race cannot grow without bound (~12 minutes). */
export const REPLAY_MAX_SECONDS = 720;

export interface ReplayCar {
  name: string;
  color: number;
  isPlayer: boolean;
}

export interface Replay {
  carCount: number;
  frames: number;
  /** Seconds of race covered. */
  duration: number;
  rate: number;
  data: Float32Array;
  cars: ReplayCar[];
}

export interface ReplayPose {
  pos: THREE.Vector3;
  yaw: number;
  roll: number;
  speed: number;
  /** False while the car is not on track (eliminated, or before it existed). */
  alive: boolean;
}

export function makePose(): ReplayPose {
  return { pos: new THREE.Vector3(), yaw: 0, roll: 0, speed: 0, alive: false };
}

/** Pose source handed to the recorder once per sample. */
export interface RecordableCar {
  pos: THREE.Vector3;
  yaw: number;
  roll: number;
  speed: number;
  alive: boolean;
}

export class ReplayRecorder {
  private data: Float32Array;
  private frames = 0;
  private capacity: number;
  private acc = 0;
  private t = 0;
  private carCount = 0;
  private cars: ReplayCar[] = [];

  constructor(private readonly maxSeconds = REPLAY_MAX_SECONDS) {
    this.capacity = 0;
    this.data = new Float32Array(0);
  }

  /** Starts a new recording for a given field. */
  reset(cars: ReplayCar[]) {
    this.cars = cars.map((c) => ({ ...c }));
    this.carCount = cars.length;
    this.frames = 0;
    this.acc = 0;
    this.t = 0;
    // Allocate for 90 seconds up front and grow geometrically after that.
    this.capacity = Math.max(1, Math.ceil(90 * REPLAY_RATE));
    this.data = new Float32Array(this.capacity * this.carCount * REPLAY_STRIDE);
  }

  get duration(): number {
    return this.frames > 0 ? (this.frames - 1) / REPLAY_RATE : 0;
  }

  get frameCount(): number {
    return this.frames;
  }

  /** Approximate memory footprint in bytes, for diagnostics. */
  get bytes(): number {
    return this.data.byteLength;
  }

  private grow() {
    const next = Math.min(
      Math.ceil(this.maxSeconds * REPLAY_RATE),
      Math.max(this.capacity * 2, this.capacity + REPLAY_RATE * 30),
    );
    if (next <= this.capacity) return false;
    const bigger = new Float32Array(next * this.carCount * REPLAY_STRIDE);
    bigger.set(this.data);
    this.data = bigger;
    this.capacity = next;
    return true;
  }

  /**
   * Advances the clock and stores a frame when one is due.
   *
   * Returns true when a frame was written, which is only useful for tests.
   */
  sample(dt: number, cars: RecordableCar[], force = false): boolean {
    if (this.carCount === 0) return false;
    this.t += dt;
    this.acc += dt;
    const period = 1 / REPLAY_RATE;
    if (!force && this.acc < period) return false;
    this.acc = 0;
    if (this.frames >= this.capacity && !this.grow()) return false;
    const base = this.frames * this.carCount * REPLAY_STRIDE;
    for (let i = 0; i < this.carCount; i++) {
      const c = cars[i];
      const o = base + i * REPLAY_STRIDE;
      if (!c) {
        this.data[o + 6] = 0;
        continue;
      }
      this.data[o] = c.pos.x;
      this.data[o + 1] = c.pos.y;
      this.data[o + 2] = c.pos.z;
      this.data[o + 3] = c.yaw;
      this.data[o + 4] = c.roll;
      this.data[o + 5] = c.speed;
      this.data[o + 6] = c.alive ? 1 : 0;
    }
    this.frames++;
    return true;
  }

  /** Freezes the recording into something playable. Cheap: it copies once. */
  finish(): Replay | null {
    if (this.frames < 2) return null;
    return {
      carCount: this.carCount,
      frames: this.frames,
      duration: this.duration,
      rate: REPLAY_RATE,
      data: this.data.slice(0, this.frames * this.carCount * REPLAY_STRIDE),
      cars: this.cars.map((c) => ({ ...c })),
    };
  }
}

/**
 * Samples a car's pose at an arbitrary time, interpolating between frames.
 *
 * Yaw is interpolated the short way round so a car crossing the ±π seam does
 * not spin on its roof.
 */
export function sampleReplay(replay: Replay, time: number, car: number, out: ReplayPose): ReplayPose {
  const last = replay.frames - 1;
  const t = Math.min(Math.max(time, 0), replay.duration);
  const f = t * replay.rate;
  const i0 = Math.min(last, Math.floor(f));
  const i1 = Math.min(last, i0 + 1);
  const k = i1 === i0 ? 0 : f - i0;
  const stride = REPLAY_STRIDE;
  const row = replay.carCount * stride;
  const a = i0 * row + car * stride;
  const b = i1 * row + car * stride;
  const d = replay.data;
  out.pos.set(
    d[a] + (d[b] - d[a]) * k,
    d[a + 1] + (d[b + 1] - d[a + 1]) * k,
    d[a + 2] + (d[b + 2] - d[a + 2]) * k,
  );
  out.yaw = d[a + 3] + wrapAngle(d[b + 3] - d[a + 3]) * k;
  out.roll = d[a + 4] + (d[b + 4] - d[a + 4]) * k;
  out.speed = d[a + 5] + (d[b + 5] - d[a + 5]) * k;
  // A car that is out stays out: never fade a dead car back in mid-interpolation.
  out.alive = d[a + 6] > 0.5 && d[b + 6] > 0.5;
  return out;
}

/** The moment with the most cars inside a short radius — a good highlight. */
export function busiestMoment(replay: Replay, radius = 14): number {
  if (replay.carCount < 2) return 0;
  const row = replay.carCount * REPLAY_STRIDE;
  let bestScore = -1;
  let bestTime = 0;
  for (let f = 0; f < replay.frames; f++) {
    const base = f * row;
    let score = 0;
    for (let i = 0; i < replay.carCount; i++) {
      const oi = base + i * REPLAY_STRIDE;
      if (replay.data[oi + 6] < 0.5) continue;
      for (let j = i + 1; j < replay.carCount; j++) {
        const oj = base + j * REPLAY_STRIDE;
        if (replay.data[oj + 6] < 0.5) continue;
        const dx = replay.data[oi] - replay.data[oj];
        const dz = replay.data[oi + 2] - replay.data[oj + 2];
        const dist = Math.hypot(dx, dz);
        if (dist < radius) score += 1 - dist / radius;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestTime = f / replay.rate;
    }
  }
  return bestTime;
}
