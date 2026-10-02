import * as THREE from "three";

function makeSoftTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.45, "rgba(255,255,255,0.4)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class ParticleSystem {
  points: THREE.Points;
  private max: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private grow: Float32Array;
  private alpha: Float32Array;
  private color: Float32Array;
  private baseAlpha: Float32Array;
  private gravity: Float32Array;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private tex: THREE.CanvasTexture;
  private cursor = 0;
  /** Highest slot index ever used — lets update() skip the untouched tail. */
  private highWater = 0;
  private tmpColor = new THREE.Color();

  constructor(max = 900) {
    this.max = Math.max(32, max);
    const m = this.max;
    this.pos = new Float32Array(m * 3);
    this.vel = new Float32Array(m * 3);
    this.life = new Float32Array(m);
    this.maxLife = new Float32Array(m);
    this.size = new Float32Array(m);
    this.grow = new Float32Array(m);
    this.alpha = new Float32Array(m);
    this.baseAlpha = new Float32Array(m);
    this.gravity = new Float32Array(m);
    this.color = new Float32Array(m * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute(
      "aAlpha",
      new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.geo.setAttribute(
      "aColor",
      new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.tex = makeSoftTexture();

    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { map: { value: this.tex } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = aAlpha;
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (280.0 / max(-mv.z, 0.1));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          if (vAlpha <= 0.001) discard;
          gl_FragColor = vec4(vColor, t.a * vAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.name = "particles";
  }

  get capacity(): number {
    return this.max;
  }

  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    grow: number,
    colorHex: number,
    alpha = 0.5,
    gravity = 0.6,
  ) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    if (i > this.highWater) this.highWater = i;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.grow[i] = grow;
    this.baseAlpha[i] = alpha;
    this.alpha[i] = alpha;
    this.gravity[i] = gravity;
    this.tmpColor.setHex(colorHex);
    this.color[i * 3] = this.tmpColor.r;
    this.color[i * 3 + 1] = this.tmpColor.g;
    this.color[i * 3 + 2] = this.tmpColor.b;
  }

  update(dt: number) {
    const n = this.highWater + 1;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = this.life[i] / this.maxLife[i];
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= Math.exp(-1.6 * dt);
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * Math.exp(-1.2 * dt) + this.gravity[i] * dt;
      this.vel[i * 3 + 2] *= Math.exp(-1.6 * dt);
      this.size[i] += this.grow[i] * dt;
      const fadeIn = Math.min(1, (1 - t) * 6);
      this.alpha[i] = this.baseAlpha[i] * t * fadeIn;
    }
    const upd = (name: string) => {
      const a = this.geo.attributes[name] as THREE.BufferAttribute;
      a.needsUpdate = true;
    };
    upd("position");
    upd("aSize");
    upd("aAlpha");
    upd("aColor");
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}
