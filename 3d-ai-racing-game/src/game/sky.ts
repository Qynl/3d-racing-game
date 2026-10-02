import * as THREE from "three";
import { mulberry32 } from "./noise";

export const SUN_DIR = new THREE.Vector3(
  Math.cos(THREE.MathUtils.degToRad(24)) * Math.sin(THREE.MathUtils.degToRad(-52)),
  Math.sin(THREE.MathUtils.degToRad(24)),
  Math.cos(THREE.MathUtils.degToRad(24)) * Math.cos(THREE.MathUtils.degToRad(-52))
).normalize();

export const HORIZON_COLOR = new THREE.Color(0xf0b58a);

export function createSkyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x40557a) },
      midColor: { value: new THREE.Color(0x9d8fa3) },
      horizonColor: { value: HORIZON_COLOR.clone() },
      bottomColor: { value: new THREE.Color(0xc48a62) },
      sunDir: { value: SUN_DIR.clone() },
      sunColor: { value: new THREE.Color(0xffd8a6) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      varying vec3 vWorldPos;
      void main() {
        vec3 dir = normalize(vWorldPos - cameraPosition);
        float h = dir.y;
        vec3 col;
        if (h >= 0.0) {
          float t1 = smoothstep(0.0, 0.18, h);
          float t2 = smoothstep(0.12, 0.7, h);
          col = mix(horizonColor, midColor, t1);
          col = mix(col, topColor, t2);
        } else {
          col = mix(horizonColor, bottomColor, smoothstep(0.0, -0.25, h));
        }
        float d = max(dot(dir, sunDir), 0.0);
        float glow = pow(d, 14.0) * 0.35 + pow(d, 90.0) * 0.6 + pow(d, 900.0) * 1.2;
        float disk = smoothstep(0.99955, 0.9997, d);
        col += sunColor * glow;
        col = mix(col, vec3(1.0, 0.93, 0.8) * 1.6, disk);
        // haze band near horizon
        col = mix(col, horizonColor, (1.0 - smoothstep(0.0, 0.06, abs(h))) * 0.5);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

export interface CloudField {
  group: THREE.Group;
  update: (dt: number) => void;
}

export function createClouds(seed: number): CloudField {
  const rand = mulberry32(seed);
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf6e4d6,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    emissive: 0x3a2a30,
    emissiveIntensity: 0.25,
  });
  const base = new THREE.IcosahedronGeometry(1, 1);
  const clouds: { mesh: THREE.Group; speed: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const parts = 3 + Math.floor(rand() * 4);
    const size = 14 + rand() * 24;
    for (let p = 0; p < parts; p++) {
      const m = new THREE.Mesh(base, mat);
      const s = size * (0.45 + rand() * 0.55);
      m.scale.set(s, s * (0.32 + rand() * 0.2), s * (0.7 + rand() * 0.5));
      m.position.set((rand() - 0.5) * size * 1.6, (rand() - 0.5) * size * 0.25, (rand() - 0.5) * size * 0.8);
      m.rotation.y = rand() * Math.PI;
      g.add(m);
    }
    const ang = rand() * Math.PI * 2;
    const dist = 180 + rand() * 520;
    g.position.set(Math.cos(ang) * dist, 150 + rand() * 90, Math.sin(ang) * dist);
    g.rotation.y = rand() * Math.PI * 2;
    group.add(g);
    clouds.push({ mesh: g, speed: 1.2 + rand() * 1.5 });
  }
  const update = (dt: number) => {
    for (const c of clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 760) c.mesh.position.x = -760;
    }
  };
  return { group, update };
}

export function createLighting(scene: THREE.Scene): { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight } {
  const sun = new THREE.DirectionalLight(0xffd4a4, 3.1);
  sun.position.copy(SUN_DIR).multiplyScalar(140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -75;
  cam.right = 75;
  cam.top = 75;
  cam.bottom = -75;
  cam.near = 10;
  cam.far = 320;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.6;
  sun.shadow.radius = 2;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xb9c4dc, 0xa8673f, 0.95);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffe0c0, 0.12);
  scene.add(ambient);
  return { sun, hemi };
}
