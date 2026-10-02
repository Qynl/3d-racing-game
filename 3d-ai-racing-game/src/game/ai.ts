import * as THREE from "three";
import { CarInput, CarPhysics, STEER_RATE } from "./car";
import { clamp, damp, wrapAngle } from "./noise";
import { Track, TRACK_HALF_WIDTH } from "./track";

export interface AIParams {
  topSpeed: number;
  cornerGrip: number; // margin multiplier on theoretical corner speed
  lookahead: number; // seconds of lookahead scaled by speed
  aggression: number;
}

/** Maximum speed that still allows following curvature k with the arcade steering model. */
export function maxCornerSpeed(k: number): number {
  const kk = Math.max(Math.abs(k), 1e-4);
  const S = STEER_RATE * 0.92;
  // v (1 + v/55) = S / k  ->  v^2/55 + v - S/k = 0
  const c = S / kk;
  return (-1 + Math.sqrt(1 + (4 * c) / 55)) / (2 / 55);
}

export class AIController {
  params: AIParams;
  speedScale = 1;
  private offset = 0;
  private offsetBase: number;
  private phase: number;
  private stuckTimer = 0;
  private reverseTimer = 0;
  private reverseSteer = 0;
  private target = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private rgt = new THREE.Vector3();
  private lastSteer = 0;

  constructor(private track: Track, params: AIParams, seed: number) {
    this.params = params;
    this.offsetBase = ((seed * 37) % 7) * 0.6 - 1.8;
    this.phase = seed * 1.7;
  }

  update(car: CarPhysics, others: CarPhysics[], dt: number, time: number, raceStarted: boolean): CarInput {
    const track = this.track;
    const M = track.count;
    const speed = car.speedF;
    const idx = car.trackIndex;
    car.forward(this.fwd);
    car.right(this.rgt);

    // reverse recovery
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      return { throttle: 0, brake: 1, steer: this.reverseSteer, handbrake: false };
    }
    if (raceStarted && Math.abs(speed) < 1.2) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.6) {
        this.stuckTimer = 0;
        this.reverseTimer = 1.3;
        this.reverseSteer = -Math.sign(this.lastSteer || 1);
      }
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt);
    }

    // desired lateral offset (varies slowly, collapses to 0 when off track)
    const offTrack = car.trackDist > TRACK_HALF_WIDTH + 1.5;
    let desired = offTrack ? 0 : this.offsetBase + Math.sin(time * 0.35 + this.phase) * 1.6;
    // bias toward the inside of corners
    const kHere = track.curvature[(idx + Math.floor(12 / track.spacing)) % M];
    desired += clamp(kHere * 60, -1, 1) * 1.8;
    this.offset = damp(this.offset, desired, 1.2, dt);

    // avoidance
    let avoid = 0;
    let throttleCap = 1;
    for (const o of others) {
      if (o === car) continue;
      const dx = o.pos.x - car.pos.x;
      const dz = o.pos.z - car.pos.z;
      const ahead = dx * this.fwd.x + dz * this.fwd.z;
      const lat = dx * this.rgt.x + dz * this.rgt.z;
      if (ahead > 0 && ahead < 14 && Math.abs(lat) < 3.4) {
        const strength = (1 - ahead / 14) * (3.4 - Math.abs(lat));
        avoid += (lat > 0 ? -1 : 1) * strength * 1.1;
        if (ahead < 6 && o.speedF < speed + 1) throttleCap = Math.min(throttleCap, 0.55);
      }
    }
    const lateral = clamp(this.offset + avoid, -(TRACK_HALF_WIDTH - 1.8), TRACK_HALF_WIDTH - 1.8);

    // lookahead target
    const lookDist = offTrack ? 6 : 5 + Math.max(speed, 0) * this.params.lookahead;
    const laIdx = (idx + Math.round(lookDist / track.spacing)) % M;
    track.offsetPoint(laIdx, lateral, this.target);
    const desiredYaw = Math.atan2(this.target.x - car.pos.x, this.target.z - car.pos.z);
    const diff = wrapAngle(desiredYaw - car.yaw);
    let steer = clamp(-diff * 2.6, -1, 1);
    steer = damp(this.lastSteer, steer, 18, dt);
    this.lastSteer = steer;

    // speed planning
    const top = this.params.topSpeed * this.speedScale;
    let targetSpeed = top;
    const startI = Math.floor(4 / track.spacing);
    const endI = Math.floor(62 / track.spacing);
    for (let j = startI; j < endI; j += 4) {
      const k = Math.abs(track.curvature[(idx + j) % M]);
      const dist = j * track.spacing;
      let vmax = maxCornerSpeed(k) * this.params.cornerGrip;
      // allow braking distance: v^2 = vmax^2 + 2 a d
      const allowed = Math.sqrt(vmax * vmax + 2 * 22 * Math.max(dist - 6, 0));
      vmax = Math.max(vmax, Math.min(allowed, top));
      if (vmax < targetSpeed) targetSpeed = vmax;
    }
    if (offTrack) targetSpeed = Math.min(targetSpeed, 20);
    targetSpeed = Math.max(targetSpeed, 11);

    let throttle = 0;
    let brake = 0;
    if (speed < targetSpeed - 0.5) throttle = this.params.aggression * throttleCap;
    else if (speed > targetSpeed + 2.5) brake = clamp((speed - targetSpeed) / 10, 0.35, 1);
    else throttle = 0.3 * throttleCap;

    return { throttle, brake, steer, handbrake: false };
  }
}
