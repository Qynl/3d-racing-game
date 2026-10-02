import * as THREE from "three";
import { CarInput, CarPhysics, STEER_RATE } from "./car";
import { clamp, damp, mulberry32, wrapAngle } from "./noise";
import type { RacingLine } from "./racingline";
import { Track } from "./track";

export interface AIParams {
  topSpeed: number;
  /** Margin multiplier on the theoretical corner speed. */
  cornerGrip: number;
  /** Seconds of lookahead, scaled by speed. */
  lookahead: number;
  /** Throttle commitment, set by the difficulty. */
  aggression: number;
  /** 0..1 — appetite for close racing: dive-bombs, defending, late boost. */
  boldness: number;
  /** 0..1 — how eagerly this driver spends boost. */
  boostUse: number;
  /** Small per-driver error that makes them feel human. */
  sloppiness: number;
  /** 0..1 — line choice, defending and awareness in traffic. */
  racecraft: number;
  /** 0..1 — how well they cope when the grip drops. */
  wetSkill: number;
}

/** What the driver is currently trying to do. Exposed for the HUD and tests. */
export type AIMode = "cruise" | "attack" | "defend" | "recover" | "mistake";

/** Maximum speed that still allows following curvature k with the arcade steering model. */
export function maxCornerSpeed(k: number): number {
  const kk = Math.max(Math.abs(k), 1e-4);
  const S = STEER_RATE * 0.92;
  // v (1 + v/55) = S / k  ->  v^2/55 + v - S/k = 0
  const c = S / kk;
  return (-1 + Math.sqrt(1 + (4 * c) / 55)) / (2 / 55);
}

interface Neighbour {
  car: CarPhysics;
  /** Metres ahead (negative = behind) along our own heading. */
  along: number;
  /** Metres to our side, positive = to the right of our nose. */
  lateral: number;
  /** Closing speed, positive when we are catching them. */
  closing: number;
}

/**
 * A rival driver.
 *
 * Driving is split into three jobs that are easy to reason about separately:
 *
 * 1. *Where to be* — a target lateral offset built from the precomputed racing
 *    line plus deliberate deviations (overtaking line, defensive line, keeping
 *    out of the dirty air of a car it cannot pass).
 * 2. *How fast* — the racing line's speed plan, scanned a braking distance
 *    ahead, scaled by grip conditions, damage and the driver's own bravery.
 * 3. *What's going on around it* — a neighbour scan that produces avoidance,
 *    slipstream usage, lift-and-follow behaviour and overtake commitment.
 *
 * Every driver also makes mistakes: with `consistency` below 1 they will
 * occasionally lock a brake or run wide, then recover, which is what makes a
 * race against them feel alive.
 */
export class AIController {
  params: AIParams;
  speedScale = 1;
  /** Current intent, useful for commentary and debugging. */
  mode: AIMode = "cruise";
  /** Set while the driver is mid-mistake. */
  mistakeTimer = 0;
  line: RacingLine | null = null;
  /** Personality-adjusted corner grip before weather scaling is applied. */
  readonly baseCornerGrip: number;
  /** Appetite for close racing before any last-lap push is applied. */
  readonly baseBoldness: number;

  private offset = 0;
  private lineBias: number;
  private phase: number;
  private stuckTimer = 0;
  private reverseTimer = 0;
  private reverseSteer = 0;
  private target = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private rgt = new THREE.Vector3();
  private lastSteer = 0;
  private boostHold = 0;
  private wobble: number;
  private rand: () => number;
  private mistakeCooldown: number;
  private mistakeSteer = 0;
  private mistakeBrake = 0;
  private attackSide = 0;
  /** Reaction delay off the line, in seconds. */
  private reaction: number;
  private launchTimer = 0;
  private attackTimer = 0;
  private defendSide = 0;

  constructor(
    private track: Track,
    params: AIParams,
    seed: number,
    line: RacingLine | null = null,
  ) {
    this.params = params;
    this.baseCornerGrip = params.cornerGrip;
    this.baseBoldness = params.boldness;
    this.line = line;
    this.rand = mulberry32(seed * 7919 + 17);
    this.lineBias = (this.rand() - 0.5) * 1.4;
    this.phase = seed * 1.7;
    this.wobble = 0.6 + this.rand() * 0.8;
    this.mistakeCooldown = 6 + this.rand() * 10;
    // Sharper drivers get away quicker; everyone is at least human-slow.
    this.reaction = 0.12 + (1 - params.racecraft) * 0.25 + this.rand() * 0.12;
    this.launchTimer = this.reaction;
  }

  /** Lateral offset of the racing line at a track index (0 without a line). */
  private lineOffset(index: number): number {
    if (!this.line) return 0;
    return this.line.offsets[index % this.track.count];
  }

  /** Target speed from the plan, or a curvature estimate when there is none. */
  private planSpeed(index: number): number {
    const M = this.track.count;
    const i = ((index % M) + M) % M;
    if (this.line) return this.line.plan[i];
    return maxCornerSpeed(this.track.curvature[i]);
  }

  private scan(car: CarPhysics, others: CarPhysics[], out: Neighbour[]) {
    out.length = 0;
    for (const o of others) {
      if (o === car) continue;
      const dx = o.pos.x - car.pos.x;
      const dz = o.pos.z - car.pos.z;
      const along = dx * this.fwd.x + dz * this.fwd.z;
      const lateral = dx * this.rgt.x + dz * this.rgt.z;
      if (Math.abs(along) > 34 || Math.abs(lateral) > 12) continue;
      out.push({ car: o, along, lateral, closing: car.speedF - o.speedF });
    }
  }

  private neighbours: Neighbour[] = [];

  update(car: CarPhysics, others: CarPhysics[], dt: number, time: number, raceStarted: boolean): CarInput {
    const track = this.track;
    const M = track.count;
    const hw = track.halfWidth;
    const speed = car.speedF;
    const idx = car.trackIndex;
    car.forward(this.fwd);
    car.right(this.rgt);

    // ---- the lights are still on: sit on the brakes rather than jumping the start
    if (!raceStarted) {
      this.launchTimer = this.reaction;
      this.mode = "cruise";
      return { throttle: 0, brake: 1, steer: 0, handbrake: false, boost: false };
    }

    // ---- recovery: reverse out of trouble
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      this.mode = "recover";
      return { throttle: 0, brake: 1, steer: this.reverseSteer, handbrake: false, boost: false };
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

    const offTrack = car.trackDist > hw + 1.5;
    this.scan(car, others, this.neighbours);

    // ---- mistakes
    // Grip, damage and being in a fight all make an error more likely; the
    // driver's consistency (folded into `sloppiness`) sets the base rate.
    if (this.mistakeTimer > 0) {
      this.mistakeTimer -= dt;
      if (this.mistakeTimer <= 0) this.mistakeCooldown = 7 + this.rand() * 12;
    } else if (raceStarted) {
      this.mistakeCooldown -= dt;
      if (this.mistakeCooldown <= 0 && Math.abs(speed) > 14) {
        const wetRisk = 1 + (1 - car.conditionGrip) * (2 - this.params.wetSkill);
        const chance = this.params.sloppiness * 0.45 * wetRisk * dt;
        if (this.rand() < chance) {
          this.mistakeTimer = 0.5 + this.rand() * 0.9;
          this.mistakeSteer = (this.rand() < 0.5 ? -1 : 1) * (0.25 + this.rand() * 0.4);
          this.mistakeBrake = this.rand() < 0.4 ? 0.5 + this.rand() * 0.4 : 0;
        } else {
          this.mistakeCooldown = 1.5;
        }
      }
    }

    // ---- traffic intent
    let ahead: Neighbour | null = null;
    let behind: Neighbour | null = null;
    for (const n of this.neighbours) {
      if (n.along > 1.5 && Math.abs(n.lateral) < 5.5) {
        if (!ahead || n.along < ahead.along) ahead = n;
      } else if (n.along < -1.5 && n.along > -16 && Math.abs(n.lateral) < 5) {
        if (!behind || n.along > behind.along) behind = n;
      }
    }

    const canAttack =
      !!ahead && ahead.along < 22 && ahead.closing > -1.5 && raceStarted && !offTrack && speed > 12;
    const mustDefend =
      !!behind &&
      behind.along > -11 &&
      behind.closing > 0.4 &&
      this.params.racecraft > 0.45 &&
      this.params.boldness > 0.3;

    if (this.attackTimer > 0) this.attackTimer -= dt;
    if (canAttack && this.attackTimer <= 0 && ahead) {
      // Pick the side with more room on the track, biased by aggression: a
      // brave driver will take the inside even when it is tight.
      const theirOffset = ahead.lateral + this.offset;
      const roomRight = hw - 1.6 - theirOffset;
      const roomLeft = hw - 1.6 + theirOffset;
      const pickRight = roomRight > roomLeft;
      this.attackSide = pickRight ? 1 : -1;
      this.attackTimer = 1.2 + (1 - this.params.boldness) * 1.6;
    }

    // ---- where to be: racing line + deliberate deviations
    const linePos = this.lineOffset((idx + Math.round(8 / track.spacing)) % M);
    let desired = offTrack ? 0 : linePos + this.lineBias * (1 - this.params.racecraft * 0.6);
    desired += Math.sin(time * 0.35 + this.phase) * 0.5 * this.wobble * (1 - this.params.racecraft * 0.5);

    if (canAttack && ahead) {
      const commit = 0.6 + this.params.boldness * 0.8;
      desired += this.attackSide * (2.6 * commit);
      this.mode = "attack";
    } else if (mustDefend && behind) {
      // Move to cover the side they are coming down.
      this.defendSide = behind.lateral > 0 ? 1 : -1;
      desired += this.defendSide * 1.9 * this.params.racecraft;
      this.mode = "defend";
    } else {
      this.mode = "cruise";
    }
    if (this.mistakeTimer > 0) this.mode = "mistake";

    // ---- avoidance (always on, strongest for the closest car)
    let avoid = 0;
    let throttleCap = 1;
    let blocked = false;
    let draftTarget = false;
    for (const n of this.neighbours) {
      if (n.along <= 0 || n.along > 16) continue;
      const gap = Math.abs(n.lateral);
      if (gap > 3.6) continue;
      const urgency = (1 - n.along / 16) * (3.6 - gap);
      avoid += (n.lateral > 0 ? -1 : 1) * urgency * 1.15;
      if (n.along < 7 && n.closing > -0.5) {
        throttleCap = Math.min(throttleCap, 0.5);
        blocked = true;
      } else if (n.along < 14) {
        draftTarget = true;
      }
    }

    const maxLateral = hw - 1.5;
    this.offset = damp(this.offset, clamp(desired, -maxLateral, maxLateral), 2.2, dt);
    const lateral = clamp(this.offset + avoid, -maxLateral, maxLateral);

    // ---- steering towards the lookahead point
    const lookDist = offTrack ? 6 : 5 + Math.max(speed, 0) * this.params.lookahead;
    const laIdx = (idx + Math.round(lookDist / track.spacing)) % M;
    track.offsetPoint(laIdx, lateral, this.target);
    const desiredYaw = Math.atan2(this.target.x - car.pos.x, this.target.z - car.pos.z);
    const diff = wrapAngle(desiredYaw - car.yaw);
    let steer = clamp(-diff * 2.6, -1, 1);
    steer += Math.sin(time * 1.7 + this.phase) * this.params.sloppiness * 0.05;
    if (this.mistakeTimer > 0) steer += this.mistakeSteer;
    steer = damp(this.lastSteer, clamp(steer, -1, 1), 18, dt);
    this.lastSteer = steer;

    // ---- how fast: walk the speed plan over a braking distance
    const top = this.params.topSpeed * this.speedScale;
    // Conditions bite: the plan was built for dry grip.
    const gripFactor = Math.sqrt(clamp(car.conditionGrip, 0.3, 1));
    const wetAllowance = 1 - (1 - gripFactor) * (1.3 - this.params.wetSkill * 0.6);
    const damageFactor = 1 - car.damage * 0.12;
    const bravery = this.params.cornerGrip * wetAllowance * damageFactor;

    let targetSpeed = top;
    let tightestAhead = 0;
    const scan = Math.max(30, Math.min(140, 8 + speed * speed * 0.055));
    const steps = 18;
    for (let j = 1; j <= steps; j++) {
      const dist = (j / steps) * scan;
      const i = (idx + Math.round(dist / track.spacing)) % M;
      const k = Math.abs(this.line ? this.line.curvature[i] : track.curvature[i]);
      if (k > tightestAhead) tightestAhead = k;
      const vmax = this.planSpeed(i) * bravery;
      // speed we may still be doing now and still make that corner
      const allowed = Math.sqrt(vmax * vmax + 2 * 19 * Math.max(dist - 4, 0));
      if (allowed < targetSpeed) targetSpeed = allowed;
    }
    targetSpeed = Math.min(targetSpeed, top);
    if (offTrack) targetSpeed = Math.min(targetSpeed, 20);
    if (blocked && ahead) targetSpeed = Math.min(targetSpeed, Math.max(10, ahead.car.speedF + 1.5));
    targetSpeed = Math.max(targetSpeed, 11);

    // Reaction time off the line.
    if (this.launchTimer > 0) {
      this.launchTimer -= dt;
      return { throttle: 0, brake: 0.2, steer: steer * 0.2, handbrake: false, boost: false };
    }

    let throttle = 0;
    let brake = 0;
    if (speed < targetSpeed - 0.5) throttle = this.params.aggression * throttleCap;
    else if (speed > targetSpeed + 2.2) brake = clamp((speed - targetSpeed) / 10, 0.35, 1);
    else throttle = 0.3 * throttleCap;
    if (this.mistakeTimer > 0 && this.mistakeBrake > 0) {
      brake = Math.max(brake, this.mistakeBrake);
      throttle = 0;
    }

    // ---- boost: out of corners, in the tow, or defending a late attack
    if (this.boostHold > 0) this.boostHold -= dt;
    const straightAhead = tightestAhead < 0.008;
    const towBonus = draftTarget && car.draft > 0.3 ? 1 : 0;
    if (
      raceStarted &&
      car.boost > 0.22 &&
      !offTrack &&
      this.boostHold <= 0 &&
      speed > targetSpeed * 0.7 &&
      (straightAhead || towBonus === 1 || (this.mode === "attack" && this.params.boldness > 0.7))
    ) {
      const want = this.params.boostUse + towBonus * 0.3 + (this.mode === "attack" ? 0.25 : 0);
      if (this.rand() < clamp(want, 0.05, 1)) this.boostHold = 1.2 + this.params.boostUse * 1.8;
      else this.boostHold = -0.6;
    }
    const boost = this.boostHold > 0 && car.boost > 0.02 && !offTrack && !blocked;

    return { throttle, brake, steer, handbrake: false, boost };
  }
}
