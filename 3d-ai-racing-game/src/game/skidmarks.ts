import * as THREE from "three";

/**
 * Persistent tyre marks. A ring buffer of quads written straight into a single
 * dynamic BufferGeometry; fading happens in the shader from a per-vertex birth
 * time, so the CPU only ever touches newly emitted segments.
 */
export class SkidMarks {
  mesh: THREE.Mesh;
  private max: number;
  private pos: Float32Array;
  private birth: Float32Array;
  private strength: Float32Array;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private cursor = 0;
  private count = 0;
  private time = 0;
  readonly life = 26;

  constructor(max = 900) {
    this.max = Math.max(1, max);
    this.pos = new Float32Array(this.max * 4 * 3);
    this.birth = new Float32Array(this.max * 4);
    this.strength = new Float32Array(this.max * 4);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geo.setAttribute(
      "aBirth",
      new THREE.BufferAttribute(this.birth, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.geo.setAttribute(
      "aStrength",
      new THREE.BufferAttribute(this.strength, 1).setUsage(THREE.DynamicDrawUsage),
    );
    const index = new Uint32Array(this.max * 6);
    for (let i = 0; i < this.max; i++) {
      const v = i * 4;
      index.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6);
    }
    this.geo.setIndex(new THREE.BufferAttribute(index, 1));
    this.geo.setDrawRange(0, 0);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      uniforms: {
        uTime: { value: 0 },
        uLife: { value: this.life },
        uColor: { value: new THREE.Color(0x2b1d14) },
      },
      vertexShader: /* glsl */ `
        attribute float aBirth;
        attribute float aStrength;
        varying float vFade;
        uniform float uTime;
        uniform float uLife;
        void main() {
          float age = uTime - aBirth;
          vFade = clamp(1.0 - age / uLife, 0.0, 1.0) * aStrength;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vFade;
        uniform vec3 uColor;
        void main() {
          if (vFade <= 0.004) discard;
          gl_FragColor = vec4(uColor, vFade * 0.5);
        }
      `,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = "skidmarks";
  }

  get enabled(): boolean {
    return this.max > 1;
  }

  /** Adds one quad spanning from (ax,az)->(bx,bz) with the given half width. */
  addSegment(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    nx: number,
    nz: number,
    halfWidth: number,
    strength: number,
  ) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    if (this.count < this.max) this.count++;
    const o = i * 12;
    const p = this.pos;
    p[o] = ax - nx * halfWidth;
    p[o + 1] = ay;
    p[o + 2] = az - nz * halfWidth;
    p[o + 3] = ax + nx * halfWidth;
    p[o + 4] = ay;
    p[o + 5] = az + nz * halfWidth;
    p[o + 6] = bx - nx * halfWidth;
    p[o + 7] = by;
    p[o + 8] = bz - nz * halfWidth;
    p[o + 9] = bx + nx * halfWidth;
    p[o + 10] = by;
    p[o + 11] = bz + nz * halfWidth;
    const b = i * 4;
    for (let k = 0; k < 4; k++) {
      this.birth[b + k] = this.time;
      this.strength[b + k] = strength;
    }
    const posAttr = this.geo.attributes.position as THREE.BufferAttribute;
    const birthAttr = this.geo.attributes.aBirth as THREE.BufferAttribute;
    const strAttr = this.geo.attributes.aStrength as THREE.BufferAttribute;
    posAttr.addUpdateRange(o, 12);
    birthAttr.addUpdateRange(b, 4);
    strAttr.addUpdateRange(b, 4);
    posAttr.needsUpdate = true;
    birthAttr.needsUpdate = true;
    strAttr.needsUpdate = true;
    this.geo.setDrawRange(0, this.count * 6);
  }

  update(dt: number) {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
  }

  clear() {
    this.cursor = 0;
    this.count = 0;
    this.strength.fill(0);
    this.geo.setDrawRange(0, 0);
    (this.geo.attributes.aStrength as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}
