import * as THREE from "three";
import type { CarClassDef } from "./config";
import { clamp, damp } from "./noise";
import { Terrain } from "./terrain";
import { Track } from "./track";

export const WHEEL_RADIUS = 0.42;
export const GRAVITY = 23;
/** Reference values used by the AI's corner-speed solver. */
export const MAX_SPEED = 56;
export const STEER_RATE = 2.7;

export interface CarInput {
  throttle: number;
  brake: number;
  steer: number; // -1 left .. 1 right
  handbrake: boolean;
  boost: boolean;
}

export const NEUTRAL_INPUT: CarInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  boost: false,
};

export interface CarVisual {
  root: THREE.Group;
  body: THREE.Group;
  frontPivots: THREE.Group[];
  wheels: THREE.Group[];
  tailMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshPhysicalMaterial;
  headMat: THREE.MeshStandardMaterial;
  flames: THREE.Group;
  flameMat: THREE.MeshBasicMaterial;
  materials: THREE.Material[];
}

function numberTexture(n: number, color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = "#f3ede0";
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = "bold 72px 'Barlow Condensed', 'Arial Narrow', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export interface CarVisualOptions {
  /** Translucent, shadowless, non-reflective — used for the ghost car. */
  ghost?: boolean;
  /** Visual silhouette tweak per car class. */
  classId?: string;
}

export function buildCarVisual(colorHex: number, number: number, opts: CarVisualOptions = {}): CarVisual {
  const ghost = !!opts.ghost;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const materials: THREE.Material[] = [];
  const track = <T extends THREE.Material>(m: T): T => {
    if (ghost) {
      m.transparent = true;
      m.opacity = 0.34;
      m.depthWrite = false;
    }
    materials.push(m);
    return m;
  };

  const bodyMat = track(
    new THREE.MeshPhysicalMaterial({
      color: ghost ? 0x9fd6ff : colorHex,
      roughness: 0.38,
      metalness: ghost ? 0 : 0.2,
      clearcoat: ghost ? 0 : 0.8,
      clearcoatRoughness: 0.15,
      emissive: ghost ? 0x2a4d66 : 0x000000,
      emissiveIntensity: ghost ? 0.7 : 0,
    }),
  );
  const darkMat = track(new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 0.75, metalness: 0.2 }));
  const glassMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x1a2229,
      roughness: 0.12,
      metalness: 0.5,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
  );
  const chromeMat = track(
    new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.3, metalness: 0.8 }),
  );
  const headMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfff4dc,
      emissive: 0xffe6b8,
      emissiveIntensity: 1.6,
      roughness: 0.3,
    }),
  );
  const tailMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x6a1414,
      emissive: 0xc01c1c,
      emissiveIntensity: 0.5,
      roughness: 0.4,
    }),
  );

  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = body,
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = !ghost;
    m.receiveShadow = !ghost;
    parent.add(m);
    return m;
  };

  // Subtle silhouette differences between the three classes.
  const cls = opts.classId ?? "coyote";
  const wide = cls === "vulture" ? 1.06 : cls === "jackrabbit" ? 0.94 : 1;
  const tall = cls === "jackrabbit" ? 0.94 : 1;

  // chassis
  add(new THREE.BoxGeometry(1.92 * wide, 0.52, 4.3), bodyMat, 0, 0.64, 0);
  // hood / upper body
  add(new THREE.BoxGeometry(1.76 * wide, 0.34, 3.5), bodyMat, 0, 1.06, 0.12);
  // front nose slope (thin box tilted)
  const nose = add(new THREE.BoxGeometry(1.7 * wide, 0.08, 1.0), bodyMat, 0, 1.2, 1.55);
  nose.rotation.x = 0.16;
  // cabin
  add(new THREE.BoxGeometry(1.52 * wide, 0.56 * tall, 1.95), glassMat, 0, 1.5 * tall, -0.3);
  // roof
  add(new THREE.BoxGeometry(1.6 * wide, 0.09, 2.0), bodyMat, 0, 1.8 * tall, -0.3);
  // pillars
  for (const sx of [-0.74 * wide, 0.74 * wide]) {
    add(new THREE.BoxGeometry(0.08, 0.56 * tall, 0.1), bodyMat, sx, 1.5 * tall, 0.66);
    add(new THREE.BoxGeometry(0.08, 0.56 * tall, 0.1), bodyMat, sx, 1.5 * tall, -1.26);
  }
  // bumpers
  add(new THREE.BoxGeometry(1.98 * wide, 0.3, 0.36), darkMat, 0, 0.5, 2.18);
  add(new THREE.BoxGeometry(1.98 * wide, 0.3, 0.36), darkMat, 0, 0.5, -2.18);
  // skid plates
  add(new THREE.BoxGeometry(2.0 * wide, 0.12, 4.0), darkMat, 0, 0.36, 0);
  // headlights
  add(new THREE.BoxGeometry(0.4, 0.17, 0.08), headMat, -0.6 * wide, 0.98, 2.17);
  add(new THREE.BoxGeometry(0.4, 0.17, 0.08), headMat, 0.6 * wide, 0.98, 2.17);
  // grille
  add(new THREE.BoxGeometry(0.7, 0.2, 0.06), darkMat, 0, 0.94, 2.17);
  // tail lights
  add(new THREE.BoxGeometry(0.46, 0.15, 0.08), tailMat, -0.62 * wide, 0.98, -2.17);
  add(new THREE.BoxGeometry(0.46, 0.15, 0.08), tailMat, 0.62 * wide, 0.98, -2.17);
  // spoiler
  const spoilerH = cls === "vulture" ? 1.72 : 1.58;
  add(new THREE.BoxGeometry(1.84 * wide, 0.07, 0.46), bodyMat, 0, spoilerH, -2.05);
  add(new THREE.BoxGeometry(0.08, 0.36, 0.3), darkMat, -0.7 * wide, spoilerH - 0.2, -2.0);
  add(new THREE.BoxGeometry(0.08, 0.36, 0.3), darkMat, 0.7 * wide, spoilerH - 0.2, -2.0);
  // roof light bar
  add(new THREE.BoxGeometry(1.1, 0.14, 0.22), darkMat, 0, 1.92 * tall, 0.3);
  for (let i = 0; i < 4; i++) {
    add(new THREE.BoxGeometry(0.2, 0.1, 0.05), headMat, -0.39 + i * 0.26, 1.92 * tall, 0.42);
  }
  // mirrors
  add(new THREE.BoxGeometry(0.1, 0.1, 0.26), bodyMat, -1.0 * wide, 1.32, 0.55);
  add(new THREE.BoxGeometry(0.1, 0.1, 0.26), bodyMat, 1.0 * wide, 1.32, 0.55);
  // exhausts
  for (const ex of [-0.55, 0.55]) {
    const pipe = add(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), chromeMat, ex, 0.42, -2.3);
    pipe.rotation.x = Math.PI / 2;
  }
  // door numbers
  const numTex = numberTexture(number, "#2a2522");
  const numMat = track(
    new THREE.MeshStandardMaterial({
      map: numTex,
      transparent: true,
      roughness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  if (ghost) numMat.opacity = 0.25;
  const nL = add(new THREE.PlaneGeometry(0.8, 0.8), numMat, -0.965 * wide, 1.02, -0.1);
  nL.rotation.y = -Math.PI / 2;
  const nR = add(new THREE.PlaneGeometry(0.8, 0.8), numMat, 0.965 * wide, 1.02, -0.1);
  nR.rotation.y = Math.PI / 2;
  const nH = add(new THREE.PlaneGeometry(0.7, 0.7), numMat, 0, 1.235, 1.0);
  nH.rotation.x = -Math.PI / 2;
  // racing stripe
  const stripeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf3ede0,
      roughness: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  add(new THREE.BoxGeometry(0.35, 0.02, 3.5), stripeMat, -0.35, 1.235, 0.12);
  add(new THREE.BoxGeometry(0.35, 0.02, 2.0), stripeMat, -0.35, 1.85 * tall, -0.3);

  // boost flames
  const flames = new THREE.Group();
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xffb060,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  materials.push(flameMat);
  const flameGeo = new THREE.ConeGeometry(0.17, 1.1, 10, 1, true);
  flameGeo.rotateX(Math.PI / 2);
  for (const ex of [-0.55, 0.55]) {
    const f = new THREE.Mesh(flameGeo, flameMat);
    f.position.set(ex, 0.42, -2.9);
    flames.add(f);
  }
  flames.visible = false;
  body.add(flames);

  // wheels
  const tireGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.34, 16);
  tireGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.36, 8);
  hubGeo.rotateZ(Math.PI / 2);
  const tireMat = track(new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.95 }));
  const hubMat = track(new THREE.MeshStandardMaterial({ color: 0xa39c90, roughness: 0.35, metalness: 0.7 }));
  const frontPivots: THREE.Group[] = [];
  const wheels: THREE.Group[] = [];
  const wheelPos = [
    [-0.88 * wide, 1.38],
    [0.88 * wide, 1.38],
    [-0.88 * wide, -1.38],
    [0.88 * wide, -1.38],
  ];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(wheelPos[i][0], WHEEL_RADIUS, wheelPos[i][1]);
    const wheel = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = !ghost;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    wheel.add(tire, hub);
    pivot.add(wheel);
    root.add(pivot);
    wheels.push(wheel);
    if (i < 2) frontPivots.push(pivot);
  }

  return { root, body, frontPivots, wheels, tailMat, bodyMat, headMat, flames, flameMat, materials };
}

export function disposeCarVisual(v: CarVisual) {
  v.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry?.dispose();
  });
  for (const m of v.materials) m.dispose();
}

// ---------------------------------------------------------------- physics

export interface CarTuning {
  topSpeed: number;
  engine: number;
  brake: number;
  grip: number;
  steer: number;
  boostTank: number;
  boostPower: number;
}

export function tuningFromClass(def: CarClassDef): CarTuning {
  return {
    topSpeed: def.topSpeed,
    engine: def.engine,
    brake: def.brake,
    grip: def.grip,
    steer: def.steer,
    boostTank: def.boostTank,
    boostPower: def.boostPower,
  };
}

export type Surface = "track" | "rumble" | "sand";

export const REVERSE_MAX = 12;

export class CarPhysics {
  tuning: CarTuning;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  velY = 0;
  yaw = 0;
  speedF = 0;
  speedR = 0;
  normal = new THREE.Vector3(0, 1, 0);
  smoothNormal = new THREE.Vector3(0, 1, 0);
  trackIndex = 0;
  trackDist = 0;
  onTrack = true;
  radius = 1.3;

  // airborne state
  grounded = true;
  airTime = 0;
  totalAirTime = 0;
  private groundPrev = 0;
  /** Set for one frame on touchdown; magnitude of the vertical impact. */
  landingImpact = 0;
  /** Set for one frame when the car leaves the ground. */
  justLaunched = false;

  /** Which surface the tyres are on right now. */
  surface: Surface = "track";
  /** 0..1 rumble-strip rattle, scaled by speed. */
  rumble = 0;
  /** 0..1 slipstream from the car ahead, written by the race loop. */
  draft = 0;
  /** 0..1 accumulated damage. Costs top speed and steering until it repairs. */
  damage = 0;
  /** Decaying launch assist granted by a well-timed start. */
  launchAssist = 0;
  /** Seconds of bogged-down engine after a botched launch. */
  bog = 0;

  // boost + drift
  boost = 0; // 0..1 of tank
  boosting = false;
  driftCharge = 0; // 0..1 towards the next boost chunk
  driftScore = 0;
  driftTimer = 0;
  driftMultiplier = 1;
  private driftGrace = 0;
  /** Set for one frame when a drift chain banks into the boost tank. */
  chargeBanked = 0;

  topSpeedSeen = 0;

  // visual state
  steerVisual = 0;
  wheelSpin = 0;
  roll = 0;
  pitch = 0;
  braking = false;
  suspension = 0;

  // reusable
  private fwd = new THREE.Vector3();
  private rgt = new THREE.Vector3();

  constructor(tuning: CarTuning) {
    this.tuning = tuning;
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  right(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  place(x: number, z: number, yaw: number, terrain: Terrain, track: Track) {
    const gy = terrain.getHeight(x, z);
    this.pos.set(x, gy, z);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.velY = 0;
    this.speedF = 0;
    this.speedR = 0;
    this.grounded = true;
    this.groundPrev = gy;
    this.airTime = 0;
    this.landingImpact = 0;
    this.justLaunched = false;
    this.trackIndex = track.nearest(x, z, 60).index;
    if (this.trackIndex < 0) this.trackIndex = 0;
    this.trackDist = track.distanceToTrack(x, z, this.trackIndex);
    this.onTrack = true;
    terrain.getNormal(x, z, this.normal);
    this.smoothNormal.copy(this.normal);
    this.roll = 0;
    this.pitch = 0;
    this.wheelSpin = 0;
    this.steerVisual = 0;
    this.driftTimer = 0;
    this.driftCharge = 0;
    this.driftMultiplier = 1;
    this.suspension = 0;
  }

  /** Reward for leaving the line in the sweet spot of the rev range. */
  applyLaunch(quality: number) {
    this.launchAssist = clamp(quality, 0, 1);
  }

  /** Flooded or bogged engine after a botched start. */
  applyBog(seconds: number) {
    this.bog = Math.max(this.bog, seconds);
  }

  /** Accumulate body damage from an impact. */
  addDamage(amount: number) {
    this.damage = clamp(this.damage + amount, 0, 1);
  }

  /** Full reset of per-race accumulators. */
  resetRaceState() {
    this.damage = 0;
    this.draft = 0;
    this.rumble = 0;
    this.launchAssist = 0;
    this.bog = 0;
    this.boost = 0;
    this.boosting = false;
    this.driftScore = 0;
    this.driftCharge = 0;
    this.driftTimer = 0;
    this.driftMultiplier = 1;
    this.totalAirTime = 0;
    this.topSpeedSeen = 0;
  }

  step(input: CarInput, dt: number, terrain: Terrain, track: Track) {
    const fwd = this.fwd;
    const rgt = this.rgt;
    const T = this.tuning;
    this.landingImpact = 0;
    this.justLaunched = false;
    this.chargeBanked = 0;

    const airborne = !this.grounded;

    // ---- steering -> yaw (much less authority in the air)
    const sp = Math.abs(this.speedF);
    const steerFactor = clamp(sp / 6, 0, 1) / (1 + sp / 55);
    let yawRate = input.steer * T.steer * steerFactor * (airborne ? 0.3 : 1) * (1 - this.damage * 0.14);
    if (input.handbrake && !airborne) yawRate *= 1.3;
    if (this.speedF < -0.5) yawRate = -yawRate;
    this.yaw -= yawRate * dt;

    this.forward(fwd);
    this.right(rgt);
    let vF = this.vel.dot(fwd);
    let vR = this.vel.dot(rgt);

    // ---- surface
    const hw = track.halfWidth;
    const onTrack = this.trackDist < hw + 0.9;
    this.onTrack = onTrack;
    // The outer 0.6 m of the ribbon is a rumble strip: still grippy, but it
    // rattles the car and unsettles the rear.
    const onRumble = onTrack && this.trackDist > hw - 0.6;
    this.surface = onTrack ? (onRumble ? "rumble" : "track") : "sand";
    this.rumble = onRumble && !airborne ? clamp(Math.abs(this.speedF) / 26, 0, 1) : 0;
    // Damage repairs itself slowly — a rally car gets patched between corners.
    if (this.damage > 0) this.damage = Math.max(0, this.damage - dt * 0.013);
    if (this.bog > 0) this.bog = Math.max(0, this.bog - dt);
    if (this.launchAssist > 0) this.launchAssist = Math.max(0, this.launchAssist - dt * 1.1);
    const boostActive = input.boost && this.boost > 0.001 && !airborne;
    this.boosting = boostActive;
    const maxSp =
      T.topSpeed *
      (onTrack ? 1 : 0.62) *
      (boostActive ? 1.22 : 1) *
      (1 + this.draft * 0.08) *
      (1 - this.damage * 0.16);

    let aF = 0;
    if (!airborne) {
      if (input.throttle > 0) {
        const ratio = clamp(vF / maxSp, 0, 1);
        aF +=
          input.throttle *
          T.engine *
          (1 - ratio * ratio * ratio) *
          (onTrack ? 1 : 0.8) *
          (this.bog > 0 ? 0.42 : 1);
        // A clean launch keeps pulling for the first second or so.
        if (this.launchAssist > 0) aF += T.engine * 0.55 * this.launchAssist * input.throttle;
      }
      this.braking = false;
      if (input.brake > 0) {
        if (vF > 0.3) {
          aF -= input.brake * T.brake;
          this.braking = true;
        } else {
          aF -= input.brake * T.engine * 0.55 * (1 - clamp(-vF / REVERSE_MAX, 0, 1));
        }
      }
      if (boostActive) {
        aF += T.boostPower * (1 - clamp(vF / (maxSp * 1.05), 0, 1) * 0.6);
        this.boost = Math.max(0, this.boost - dt / T.boostTank);
        // Snap the dregs away so the tank reads empty instead of 0.0000001.
        if (this.boost < 1e-4) this.boost = 0;
      }
      // drag + rolling resistance
      aF -= vF * (onTrack ? 0.12 * (1 - this.draft * 0.5) : 0.55);
      if (Math.abs(vF) > 0.05) aF -= Math.sign(vF) * (onTrack ? 0.8 : 2.5);
      if (input.handbrake) aF -= vF * 0.6;
      // slope
      const n = this.normal;
      aF += 9.81 * n.y * (n.x * fwd.x + n.z * fwd.z) * 0.9;
    } else {
      this.braking = false;
      // thin air drag only
      aF -= vF * 0.05;
    }

    // ---- lateral grip
    const surfaceGrip = onTrack ? (onRumble ? T.grip * 0.86 : T.grip) : T.grip * 0.47;
    const gripRate = airborne ? 0.25 : input.handbrake ? T.grip * 0.22 : surfaceGrip;
    vR *= Math.exp(-gripRate * dt);

    vF += aF * dt;
    const cap = maxSp * 1.1;
    if (vF > cap) vF = cap;
    if (vF < -REVERSE_MAX) vF = -REVERSE_MAX;
    if (!airborne && Math.abs(vF) < 0.05 && input.throttle === 0 && input.brake === 0) vF = 0;

    this.speedF = vF;
    this.speedR = vR;
    this.vel.copy(fwd).multiplyScalar(vF).addScaledVector(rgt, vR);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // ---- vertical: ramps, airtime, landings
    const gy = terrain.getHeight(this.pos.x, this.pos.z);
    if (this.grounded) {
      const rampV = (gy - this.groundPrev) / dt;
      // The ground can only ever push the car up, never suck it down.
      if (rampV > this.velY) this.velY = clamp(rampV, -40, 26);
    }
    this.groundPrev = gy;
    this.velY -= GRAVITY * dt;
    this.pos.y += this.velY * dt;

    if (this.pos.y <= gy) {
      if (!this.grounded) {
        this.landingImpact = Math.max(0, -this.velY);
        this.airTime = 0;
      }
      this.pos.y = gy;
      this.velY = 0;
      this.grounded = true;
    } else {
      if (this.grounded && this.pos.y - gy > 0.12) this.justLaunched = true;
      this.grounded = this.pos.y - gy <= 0.12;
      if (!this.grounded) {
        this.airTime += dt;
        this.totalAirTime += dt;
      }
    }

    terrain.getNormal(this.pos.x, this.pos.z, this.normal);
    // Mid-air the chassis should level out instead of snapping to the ground below.
    const nTarget = this.grounded ? this.normal : UP;
    this.smoothNormal.lerp(nTarget, 1 - Math.exp(-(this.grounded ? 14 : 3.5) * dt));
    this.smoothNormal.normalize();

    // ---- track tracking
    this.trackIndex = track.nearestInWindow(this.pos.x, this.pos.z, this.trackIndex, 60);
    this.trackDist = track.distanceToTrack(this.pos.x, this.pos.z, this.trackIndex);

    // ---- drift scoring + boost charging
    this.updateDrift(dt, onTrack);
    if (!this.grounded) this.addCharge(dt * 0.34);
    const spd = Math.abs(vF);
    if (spd > this.topSpeedSeen) this.topSpeedSeen = spd;

    // ---- visual
    this.steerVisual = damp(this.steerVisual, input.steer * 0.5, 9, dt);
    this.wheelSpin += ((this.grounded ? vF : vF * 0.6) * dt) / WHEEL_RADIUS;
    const targetRoll = clamp(-yawRate * vF * 0.011 - vR * 0.006, -0.16, 0.16);
    const airPitch = clamp(this.velY * 0.012, -0.18, 0.2);
    const targetPitch = this.grounded ? clamp(-aF * 0.0045, -0.07, 0.07) : airPitch;
    this.roll = damp(this.roll, targetRoll, 5, dt);
    this.pitch = damp(this.pitch, targetPitch, this.grounded ? 5 : 2.5, dt);
    this.suspension = damp(this.suspension, 0, 7, dt);
    if (this.landingImpact > 2) this.suspension = -clamp(this.landingImpact * 0.012, 0.03, 0.26);
  }

  private updateDrift(dt: number, onTrack: boolean) {
    const slide = Math.abs(this.speedR);
    const fast = Math.abs(this.speedF) > 9;
    if (slide > 5.5 && fast) {
      this.driftTimer += dt;
      this.driftGrace = 0.55;
      this.driftMultiplier = Math.min(5, 1 + this.driftTimer * 0.55);
      const gain = slide * dt * (onTrack ? 1 : 0.55);
      this.driftScore += gain * this.driftMultiplier * 7;
      this.addCharge(gain * 0.055);
    } else if (this.driftGrace > 0) {
      this.driftGrace -= dt;
      if (this.driftGrace <= 0) {
        this.driftTimer = 0;
        this.driftMultiplier = 1;
      }
    }
  }

  private addCharge(amount: number) {
    this.driftCharge += amount;
    while (this.driftCharge >= 1) {
      this.driftCharge -= 1;
      const before = this.boost;
      this.boost = Math.min(1, this.boost + 0.34);
      if (this.boost > before) this.chargeBanked += 1;
    }
    if (this.boost >= 1) this.driftCharge = Math.min(this.driftCharge, 0.999);
  }

  syncVisual(v: CarVisual, time: number) {
    const fwd = this.forward(TMP_FWD);
    const n = this.smoothNormal;
    const xAxis = TMP_X.crossVectors(n, fwd).normalize();
    const zAxis = TMP_Z.crossVectors(xAxis, n).normalize();
    const m = TMP_M.makeBasis(xAxis, n, zAxis);
    v.root.quaternion.setFromRotationMatrix(m);
    v.root.position.copy(this.pos);
    v.root.position.y += 0.08 + this.suspension;
    v.body.rotation.set(this.pitch, 0, this.roll);
    for (const p of v.frontPivots) p.rotation.y = -this.steerVisual;
    for (const w of v.wheels) w.rotation.x = this.wheelSpin;
    v.tailMat.emissiveIntensity = this.braking ? 2.6 : 0.5;
    if (this.boosting) {
      v.flames.visible = true;
      const flick = 0.75 + Math.sin(time * 48) * 0.2 + Math.random() * 0.14;
      v.flameMat.opacity = 0.75 * flick;
      v.flames.scale.set(1, 1, flick * 1.25);
    } else if (v.flames.visible) {
      v.flameMat.opacity *= 0.82;
      v.flames.scale.z *= 0.86;
      if (v.flameMat.opacity < 0.02) v.flames.visible = false;
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const TMP_FWD = new THREE.Vector3();
const TMP_X = new THREE.Vector3();
const TMP_Z = new THREE.Vector3();
const TMP_M = new THREE.Matrix4();
