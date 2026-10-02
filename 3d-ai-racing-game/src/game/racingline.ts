import { maxCornerSpeed } from "./ai";
import type { Track } from "./track";

export interface RacingLineOptions {
  /** How close to the kerb the line is allowed to run, in metres. */
  margin?: number;
  /** Smoothing passes per stride level. */
  iterations?: number;
  /** Grip margin applied to the theoretical corner speed (1 = on the limit). */
  grip?: number;
  /** Braking capability used for the backward pass, m/s². */
  decel?: number;
  /** Drive-out capability used for the forward pass, m/s². */
  accel?: number;
  /** Speed ceiling, m/s. */
  topSpeed?: number;
  /** Hard cap on the curvature of the generated line, 1/m. */
  maxCurvature?: number;
}

export interface RacingLine {
  /** Lateral offset from the centre line at each track sample, metres. */
  offsets: Float32Array;
  /** Curvature of the resulting line, 1/m (positive = right-hand bend). */
  curvature: Float32Array;
  /** Pure cornering limit at each sample, m/s. */
  limit: Float32Array;
  /** Achievable speed once braking and acceleration are taken into account. */
  plan: Float32Array;
  /** Metres of travel between samples along the line. */
  spacing: Float32Array;
  /** Total length of the line, metres. */
  length: number;
}

/**
 * Builds a driveable racing line for a circuit.
 *
 * The line is relaxed with multi-scale Laplacian smoothing: each sample is
 * pulled towards the midpoint of its neighbours — first with a long stride so
 * the shape of whole corner sequences settles, then with shorter strides for
 * local detail — while being clamped inside the track width. That produces the
 * classic out-in-out geometry (late apex on exit-critical corners, straightened
 * esses) without an expensive optimiser, and it is completely deterministic, so
 * the AI, the on-screen racing-line aid and the unit tests all agree.
 *
 * A backward braking pass and a forward traction pass then turn the geometry
 * into a speed plan, which is what gives the AI realistic braking points
 * instead of "slow down when the corner is already here".
 */
export function computeRacingLine(track: Track, opts: RacingLineOptions = {}): RacingLine {
  const M = track.count;
  const margin = opts.margin ?? 1.6;
  const iterations = opts.iterations ?? 6;
  const grip = opts.grip ?? 0.98;
  const decel = opts.decel ?? 20;
  const accel = opts.accel ?? 11;
  const topSpeed = opts.topSpeed ?? 70;
  const maxOff = Math.max(0, track.halfWidth - margin);

  const offsets = new Float32Array(M);
  const next = new Float32Array(M);

  // ---- geometry relaxation, coarse strides first
  const strides = [48, 24, 12, 6, 3, 1].filter((s) => s < M / 4);
  for (const stride of strides) {
    const weight = stride > 6 ? 1 : 0.65;
    for (let pass = 0; pass < iterations; pass++) {
      for (let i = 0; i < M; i++) {
        const a = (i - stride + M) % M;
        const b = (i + stride) % M;
        // Midpoint of the neighbours, expressed in this sample's lateral frame.
        const pa = track.points[a];
        const pb = track.points[b];
        const pc = track.points[i];
        const r = track.rights[i];
        const mx = (pa.x + pb.x) * 0.5 - pc.x;
        const mz = (pa.z + pb.z) * 0.5 - pc.z;
        const lateralMid = mx * r.x + mz * r.z + (offsets[a] + offsets[b]) * 0.5;
        const v = offsets[i] + (lateralMid - offsets[i]) * weight;
        next[i] = v > maxOff ? maxOff : v < -maxOff ? -maxOff : v;
      }
      offsets.set(next);
    }
  }

  // Clamping against the kerb can leave a saw-tooth on hairpins, which would
  // show up as an absurd curvature spike; a short low-pass fixes it.
  for (let pass = 0; pass < 10; pass++) {
    for (let i = 0; i < M; i++) {
      const a = offsets[(i - 1 + M) % M];
      const b = offsets[(i + 1) % M];
      const v = (a + 2 * offsets[i] + b) * 0.25;
      next[i] = v > maxOff ? maxOff : v < -maxOff ? -maxOff : v;
    }
    offsets.set(next);
  }

  // Limit how fast the line may move across the track: without this a hairpin
  // can fold the path back on itself, which reads as an infinite-curvature cusp.
  const maxStep = track.spacing * 0.28;
  for (let pass = 0; pass < 6; pass++) {
    for (let n = 1; n <= M; n++) {
      const i = n % M;
      const h = (i - 1 + M) % M;
      const lo = offsets[h] - maxStep;
      const hi = offsets[h] + maxStep;
      if (offsets[i] < lo) offsets[i] = lo;
      else if (offsets[i] > hi) offsets[i] = hi;
    }
    for (let n = M - 1; n >= 0; n--) {
      const i = n % M;
      const j = (i + 1) % M;
      const lo = offsets[j] - maxStep;
      const hi = offsets[j] + maxStep;
      if (offsets[i] < lo) offsets[i] = lo;
      else if (offsets[i] > hi) offsets[i] = hi;
    }
  }

  // ---- geometry, with a curvature cap
  //
  // Cutting to the kerb on a tight hairpin can make the *inside* radius smaller
  // than the centre line's, which is slower, not faster — and in the limit it
  // folds into a cusp. So we measure the line we built and relax the offsets
  // back wherever it got tighter than a car can realistically take.
  const px = new Float64Array(M);
  const pz = new Float64Array(M);
  const spacing = new Float32Array(M);
  const curvature = new Float32Array(M);
  const smoothed = new Float32Array(M);
  let length = 0;

  const measure = () => {
    for (let i = 0; i < M; i++) {
      px[i] = track.points[i].x + track.rights[i].x * offsets[i];
      pz[i] = track.points[i].z + track.rights[i].z * offsets[i];
    }
    length = 0;
    for (let i = 0; i < M; i++) {
      const j = (i + 1) % M;
      const d = Math.hypot(px[j] - px[i], pz[j] - pz[i]);
      spacing[i] = d;
      length += d;
    }
    for (let i = 0; i < M; i++) {
      const a = (i - 6 + M) % M;
      const b = (i + 6) % M;
      const ax = px[i] - px[a];
      const az = pz[i] - pz[a];
      const bx = px[b] - px[i];
      const bz = pz[b] - pz[i];
      const la = Math.hypot(ax, az) || 1e-6;
      const lb = Math.hypot(bx, bz) || 1e-6;
      // signed angle between the two chords, divided by the distance travelled
      const cross = (ax / la) * (bz / lb) - (az / la) * (bx / lb);
      const dot = (ax / la) * (bx / lb) + (az / la) * (bz / lb);
      curvature[i] = Math.atan2(cross, dot) / ((la + lb) * 0.5 + 1e-6);
    }
    for (let i = 0; i < M; i++) {
      let sum = 0;
      for (let k = -6; k <= 6; k++) sum += curvature[(i + k + M) % M];
      smoothed[i] = sum / 13;
    }
    curvature.set(smoothed);
  };

  const kCap = opts.maxCurvature ?? 0.2;
  measure();
  for (let fix = 0; fix < 14; fix++) {
    let worst = 0;
    for (let i = 0; i < M; i++) worst = Math.max(worst, Math.abs(curvature[i]));
    if (worst <= kCap) break;
    // pull the offending stretch back towards the centre line, then re-smooth
    for (let i = 0; i < M; i++) {
      if (Math.abs(curvature[i]) <= kCap) continue;
      const excess = Math.min(1, Math.abs(curvature[i]) / kCap - 1);
      const scale = 1 - 0.35 * excess;
      for (let k = -10; k <= 10; k++) {
        const j = (i + k + M) % M;
        const falloff = 1 - Math.abs(k) / 12;
        offsets[j] *= 1 - (1 - scale) * falloff;
      }
    }
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 0; i < M; i++) {
        const a = offsets[(i - 1 + M) % M];
        const b = offsets[(i + 1) % M];
        next[i] = (a + 2 * offsets[i] + b) * 0.25;
      }
      offsets.set(next);
    }
    measure();
  }

  // ---- speed plan
  const limit = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    limit[i] = Math.min(topSpeed, maxCornerSpeed(curvature[i]) * grip);
  }
  const plan = Float32Array.from(limit);
  // Two wrapped passes each way so the plan is consistent across the start line.
  for (let pass = 0; pass < 2; pass++) {
    for (let n = M - 1; n >= 0; n--) {
      const i = n % M;
      const j = (i + 1) % M;
      const ds = spacing[i];
      const v = Math.sqrt(plan[j] * plan[j] + 2 * decel * ds);
      if (v < plan[i]) plan[i] = v;
    }
    for (let n = 0; n < M; n++) {
      const i = n % M;
      const h = (i - 1 + M) % M;
      const ds = spacing[h];
      const v = Math.sqrt(plan[h] * plan[h] + 2 * accel * ds);
      if (v < plan[i]) plan[i] = v;
    }
  }

  return { offsets, curvature, limit, plan, spacing, length };
}

/** Sample the plan a given distance ahead of a track index. */
export function planAhead(line: RacingLine, track: Track, index: number, metres: number): number {
  const M = track.count;
  const step = Math.max(1, Math.round(metres / track.spacing));
  return line.plan[(index + step) % M];
}
