import * as THREE from "three";
import { clamp, damp } from "./noise";
import { Terrain } from "./terrain";
import { Track, TRACK_HALF_WIDTH } from "./track";

export const MAX_SPEED = 56;
export const ENGINE = 21;
export const BRAKE = 40;
export const REVERSE_MAX = 12;
export const STEER_RATE = 2.7;
export const WHEEL_RADIUS = 0.42;

export interface CarInput {
  throttle: number;
  brake: number;
  steer: number; // -1 left .. 1 right
  handbrake: boolean;
}

export interface CarVisual {
  root: THREE.Group;
  body: THREE.Group;
  frontPivots: THREE.Group[];
  wheels: THREE.Group[];
  tailMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshPhysicalMaterial;
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

export function buildCarVisual(colorHex: number, number: number): CarVisual {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: colorHex,
    roughness: 0.38,
    metalness: 0.2,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 0.75, metalness: 0.2 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a2229,
    roughness: 0.12,
    metalness: 0.5,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.3, metalness: 0.8 });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff4dc,
    emissive: 0xffe6b8,
    emissiveIntensity: 1.6,
    roughness: 0.3,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x6a1414,
    emissive: 0xc01c1c,
    emissiveIntensity: 0.5,
    roughness: 0.4,
  });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // chassis
  add(new THREE.BoxGeometry(1.92, 0.52, 4.3), bodyMat, 0, 0.64, 0);
  // hood / upper body
  add(new THREE.BoxGeometry(1.76, 0.34, 3.5), bodyMat, 0, 1.06, 0.12);
  // front nose slope (thin box tilted)
  const nose = add(new THREE.BoxGeometry(1.7, 0.08, 1.0), bodyMat, 0, 1.2, 1.55);
  nose.rotation.x = 0.16;
  // cabin
  add(new THREE.BoxGeometry(1.52, 0.56, 1.95), glassMat, 0, 1.5, -0.3);
  // roof
  add(new THREE.BoxGeometry(1.6, 0.09, 2.0), bodyMat, 0, 1.8, -0.3);
  // pillars
  for (const sx of [-0.74, 0.74]) {
    add(new THREE.BoxGeometry(0.08, 0.56, 0.1), bodyMat, sx, 1.5, 0.66);
    add(new THREE.BoxGeometry(0.08, 0.56, 0.1), bodyMat, sx, 1.5, -1.26);
  }
  // bumpers
  add(new THREE.BoxGeometry(1.98, 0.3, 0.36), darkMat, 0, 0.5, 2.18);
  add(new THREE.BoxGeometry(1.98, 0.3, 0.36), darkMat, 0, 0.5, -2.18);
  // skid plates
  add(new THREE.BoxGeometry(2.0, 0.12, 4.0), darkMat, 0, 0.36, 0);
  // headlights
  add(new THREE.BoxGeometry(0.4, 0.17, 0.08), headMat, -0.6, 0.98, 2.17);
  add(new THREE.BoxGeometry(0.4, 0.17, 0.08), headMat, 0.6, 0.98, 2.17);
  // grille
  add(new THREE.BoxGeometry(0.7, 0.2, 0.06), darkMat, 0, 0.94, 2.17);
  // tail lights
  add(new THREE.BoxGeometry(0.46, 0.15, 0.08), tailMat, -0.62, 0.98, -2.17);
  add(new THREE.BoxGeometry(0.46, 0.15, 0.08), tailMat, 0.62, 0.98, -2.17);
  // spoiler
  add(new THREE.BoxGeometry(1.84, 0.07, 0.46), bodyMat, 0, 1.58, -2.05);
  add(new THREE.BoxGeometry(0.08, 0.36, 0.3), darkMat, -0.7, 1.38, -2.0);
  add(new THREE.BoxGeometry(0.08, 0.36, 0.3), darkMat, 0.7, 1.38, -2.0);
  // roof light bar
  add(new THREE.BoxGeometry(1.1, 0.14, 0.22), darkMat, 0, 1.92, 0.3);
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.2, 0.1, 0.05), headMat, -0.39 + i * 0.26, 1.92, 0.42);
  // mirrors
  add(new THREE.BoxGeometry(0.1, 0.1, 0.26), bodyMat, -1.0, 1.32, 0.55);
  add(new THREE.BoxGeometry(0.1, 0.1, 0.26), bodyMat, 1.0, 1.32, 0.55);
  // exhaust
  const ex = add(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), chromeMat, 0.55, 0.42, -2.3);
  ex.rotation.x = Math.PI / 2;
  // door numbers
  const numTex = numberTexture(number, "#2a2522");
  const numMat = new THREE.MeshStandardMaterial({ map: numTex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 });
  const nL = add(new THREE.PlaneGeometry(0.8, 0.8), numMat, -0.965, 1.02, -0.1);
  nL.rotation.y = -Math.PI / 2;
  const nR = add(new THREE.PlaneGeometry(0.8, 0.8), numMat, 0.965, 1.02, -0.1);
  nR.rotation.y = Math.PI / 2;
  // hood number
  const nH = add(new THREE.PlaneGeometry(0.7, 0.7), numMat, 0, 1.235, 1.0);
  nH.rotation.x = -Math.PI / 2;
  // racing stripe
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf3ede0, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -1 });
  add(new THREE.BoxGeometry(0.35, 0.02, 3.5), stripeMat, -0.35, 1.235, 0.12);
  add(new THREE.BoxGeometry(0.35, 0.02, 2.0), stripeMat, -0.35, 1.85, -0.3);

  // wheels
  const tireGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.34, 16);
  tireGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.36, 8);
  hubGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.95 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xa39c90, roughness: 0.35, metalness: 0.7 });
  const frontPivots: THREE.Group[] = [];
  const wheels: THREE.Group[] = [];
  const wheelPos = [
    [-0.88, 1.38],
    [0.88, 1.38],
    [-0.88, -1.38],
    [0.88, -1.38],
  ];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(wheelPos[i][0], WHEEL_RADIUS, wheelPos[i][1]);
    const wheel = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    wheel.add(tire, hub);
    pivot.add(wheel);
    root.add(pivot);
    wheels.push(wheel);
    if (i < 2) frontPivots.push(pivot);
  }

  return { root, body, frontPivots, wheels, tailMat, bodyMat };
}

export class CarPhysics {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  speedF = 0;
  speedR = 0;
  normal = new THREE.Vector3(0, 1, 0);
  trackIndex = 0;
  trackDist = 0;
  onTrack = true;
  radius = 1.3;
  // visual state
  steerVisual = 0;
  wheelSpin = 0;
  roll = 0;
  pitch = 0;
  lastYawRate = 0;
  lastAccel = 0;
  braking = false;
  // reusable
  private fwd = new THREE.Vector3();
  private rgt = new THREE.Vector3();

  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  right(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  place(x: number, z: number, yaw: number, terrain: Terrain, track: Track) {
    this.pos.set(x, terrain.getHeight(x, z), z);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.speedF = 0;
    this.speedR = 0;
    this.trackIndex = track.nearest(x, z, 60).index;
    if (this.trackIndex < 0) this.trackIndex = 0;
    this.trackDist = track.distanceToTrack(x, z, this.trackIndex);
    this.onTrack = true;
    terrain.getNormal(x, z, this.normal);
    this.roll = 0;
    this.pitch = 0;
    this.wheelSpin = 0;
    this.steerVisual = 0;
  }

  step(input: CarInput, dt: number, terrain: Terrain, track: Track) {
    const fwd = this.fwd;
    const rgt = this.rgt;

    // steering -> yaw
    const sp = Math.abs(this.speedF);
    const steerFactor = clamp(sp / 6, 0, 1) / (1 + sp / 55);
    let yawRate = input.steer * STEER_RATE * steerFactor;
    if (input.handbrake) yawRate *= 1.3;
    if (this.speedF < -0.5) yawRate = -yawRate;
    this.yaw -= yawRate * dt;
    this.lastYawRate = yawRate;

    this.forward(fwd);
    this.right(rgt);
    let vF = this.vel.dot(fwd);
    let vR = this.vel.dot(rgt);

    // surface
    const onTrack = this.trackDist < TRACK_HALF_WIDTH + 0.9;
    this.onTrack = onTrack;
    const maxSp = MAX_SPEED * (onTrack ? 1 : 0.62);

    let aF = 0;
    if (input.throttle > 0) {
      const ratio = clamp(vF / maxSp, 0, 1);
      aF += input.throttle * ENGINE * (1 - ratio * ratio * ratio) * (onTrack ? 1 : 0.8);
    }
    this.braking = false;
    if (input.brake > 0) {
      if (vF > 0.3) {
        aF -= input.brake * BRAKE;
        this.braking = true;
      } else {
        aF -= input.brake * ENGINE * 0.55 * (1 - clamp(-vF / REVERSE_MAX, 0, 1));
      }
    }
    // drag + rolling resistance
    aF -= vF * (onTrack ? 0.12 : 0.55);
    if (Math.abs(vF) > 0.05) aF -= Math.sign(vF) * (onTrack ? 0.8 : 2.5);
    if (input.handbrake) aF -= vF * 0.6;
    // slope
    const n = this.normal;
    aF += 9.81 * n.y * (n.x * fwd.x + n.z * fwd.z) * 0.9;

    // lateral grip
    const gripRate = input.handbrake ? 2.0 : onTrack ? 9.0 : 4.2;
    vR *= Math.exp(-gripRate * dt);

    vF += aF * dt;
    if (vF > maxSp * 1.1) vF = maxSp * 1.1;
    if (vF < -REVERSE_MAX) vF = -REVERSE_MAX;
    if (Math.abs(vF) < 0.05 && input.throttle === 0 && input.brake === 0) vF = 0;

    this.lastAccel = aF;
    this.speedF = vF;
    this.speedR = vR;
    this.vel.copy(fwd).multiplyScalar(vF).addScaledVector(rgt, vR);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y = terrain.getHeight(this.pos.x, this.pos.z);
    terrain.getNormal(this.pos.x, this.pos.z, this.normal);

    // track tracking
    this.trackIndex = track.nearestInWindow(this.pos.x, this.pos.z, this.trackIndex, 60);
    this.trackDist = track.distanceToTrack(this.pos.x, this.pos.z, this.trackIndex);

    // visual
    this.steerVisual = damp(this.steerVisual, input.steer * 0.5, 9, dt);
    this.wheelSpin += (vF * dt) / WHEEL_RADIUS;
    const targetRoll = clamp(-yawRate * vF * 0.011, -0.13, 0.13);
    const targetPitch = clamp(-aF * 0.0045, -0.07, 0.07);
    this.roll = damp(this.roll, targetRoll, 5, dt);
    this.pitch = damp(this.pitch, targetPitch, 5, dt);
  }

  syncVisual(v: CarVisual) {
    const fwd = this.forward(new THREE.Vector3());
    const n = this.normal;
    const xAxis = new THREE.Vector3().crossVectors(n, fwd).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, n).normalize();
    const m = new THREE.Matrix4().makeBasis(xAxis, n, zAxis);
    v.root.quaternion.setFromRotationMatrix(m);
    v.root.position.copy(this.pos);
    v.root.position.y += 0.08;
    v.body.rotation.set(this.pitch, 0, this.roll);
    for (const p of v.frontPivots) p.rotation.y = -this.steerVisual;
    for (const w of v.wheels) w.rotation.x = this.wheelSpin;
    v.tailMat.emissiveIntensity = this.braking ? 2.6 : 0.5;
  }
}
