import * as THREE from "three";
import type { WeatherDef } from "./sky";

/**
 * Precipitation that follows the camera.
 *
 * Rain and blowing sand are the same system: a box of points that wraps around
 * the camera, falling (rain) or streaking sideways (sand). Everything lives in
 * one BufferGeometry so the whole storm is a single draw call, and the points
 * are recycled rather than spawned, so there is no allocation per frame.
 */
export class Precipitation {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private geo: THREE.BufferGeometry;
  private mat: THREE.PointsMaterial;
  private readonly count: number;
  /** Half-extent of the box that wraps around the camera. */
  private readonly range = 26;
  private active = 0;
  private wind = new THREE.Vector3(1, 0, 0.35).normalize();

  constructor(count = 2600) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.PointsMaterial({
      color: 0xbfd6e8,
      size: 0.17,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 4;
  }

  /** Switches the storm on/off and retunes it for a weather preset. */
  configure(w: WeatherDef, cameraPos: THREE.Vector3) {
    const wanted = w.precip > 0 ? Math.min(this.count, Math.round(w.precip)) : 0;
    this.mat.color.set(w.precipColor);
    this.mat.size = w.precipDrift > w.precipFall ? 0.26 : 0.15;
    this.mat.opacity = w.precipDrift > w.precipFall ? 0.5 : 0.75;
    if (wanted > this.active) {
      for (let i = this.active; i < wanted; i++) this.respawn(i, cameraPos, true);
    }
    this.active = wanted;
    this.geo.setDrawRange(0, wanted);
    this.points.visible = wanted > 0;
    for (let i = 0; i < wanted; i++) {
      const o = i * 3;
      this.vel[o] = this.wind.x * w.precipDrift;
      this.vel[o + 1] = -w.precipFall;
      this.vel[o + 2] = this.wind.z * w.precipDrift;
    }
  }

  private respawn(i: number, c: THREE.Vector3, anywhere: boolean) {
    const o = i * 3;
    const r = this.range;
    this.pos[o] = c.x + (Math.random() * 2 - 1) * r;
    this.pos[o + 1] = c.y + (anywhere ? (Math.random() * 2 - 1) * r : r * (0.5 + Math.random() * 0.5));
    this.pos[o + 2] = c.z + (Math.random() * 2 - 1) * r;
  }

  update(dt: number, camera: THREE.Vector3) {
    if (this.active === 0) return;
    const r = this.range;
    const p = this.pos;
    const v = this.vel;
    for (let i = 0; i < this.active; i++) {
      const o = i * 3;
      p[o] += v[o] * dt;
      p[o + 1] += v[o + 1] * dt;
      p[o + 2] += v[o + 2] * dt;
      // Wrap the box around the camera instead of culling and respawning.
      if (p[o + 1] < camera.y - r) p[o + 1] = camera.y + r;
      if (p[o + 1] > camera.y + r) p[o + 1] = camera.y - r;
      if (p[o] < camera.x - r) p[o] += r * 2;
      else if (p[o] > camera.x + r) p[o] -= r * 2;
      if (p[o + 2] < camera.z - r) p[o + 2] += r * 2;
      else if (p[o + 2] > camera.z + r) p[o + 2] -= r * 2;
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}
