import * as THREE from "three";
import { mulberry32 } from "./noise";

export type TimeOfDayId = "sunset" | "noon" | "night";

export interface SkyPalette {
  id: TimeOfDayId;
  name: string;
  /** Sun elevation / azimuth in degrees. */
  elevation: number;
  azimuth: number;
  sunColor: number;
  sunIntensity: number;
  top: number;
  mid: number;
  horizon: number;
  bottom: number;
  sunDisc: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  ambient: number;
  ambientIntensity: number;
  exposure: number;
  envIntensity: number;
  /** Cars switch their headlights on. */
  headlights: boolean;
}

export const SKIES: Record<TimeOfDayId, SkyPalette> = {
  sunset: {
    id: "sunset",
    name: "Golden hour",
    elevation: 24,
    azimuth: -52,
    sunColor: 0xffd4a4,
    sunIntensity: 3.1,
    top: 0x40557a,
    mid: 0x9d8fa3,
    horizon: 0xf0b58a,
    bottom: 0xc48a62,
    sunDisc: 0xffd8a6,
    hemiSky: 0xb9c4dc,
    hemiGround: 0xa8673f,
    hemiIntensity: 0.95,
    ambient: 0xffe0c0,
    ambientIntensity: 0.12,
    exposure: 1.05,
    envIntensity: 0.4,
    headlights: false,
  },
  noon: {
    id: "noon",
    name: "High noon",
    elevation: 68,
    azimuth: -20,
    sunColor: 0xfff3dc,
    sunIntensity: 3.6,
    top: 0x2f6fc4,
    mid: 0x7fb2e6,
    horizon: 0xd9e6f0,
    bottom: 0xcdbb9c,
    sunDisc: 0xffffff,
    hemiSky: 0xcfe2ff,
    hemiGround: 0xbb8a5c,
    hemiIntensity: 1.15,
    ambient: 0xffffff,
    ambientIntensity: 0.2,
    exposure: 0.95,
    envIntensity: 0.65,
    headlights: false,
  },
  night: {
    id: "night",
    name: "Desert night",
    elevation: 16,
    azimuth: 128,
    sunColor: 0x9ab4ff,
    sunIntensity: 0.55,
    top: 0x060a1c,
    mid: 0x111b38,
    horizon: 0x2b2a4a,
    bottom: 0x14121f,
    sunDisc: 0xdfe6ff,
    hemiSky: 0x334066,
    hemiGround: 0x241c1c,
    hemiIntensity: 0.4,
    ambient: 0x8899cc,
    ambientIntensity: 0.07,
    exposure: 1.3,
    envIntensity: 0.12,
    headlights: true,
  },
};

export type WeatherId = "clear" | "overcast" | "rain" | "sandstorm";

export interface WeatherDef {
  id: WeatherId;
  name: string;
  blurb: string;
  /** Lateral grip multiplier applied to every car. */
  grip: number;
  /** Multiplies the fog distance — below 1 means you can see less. */
  fogScale: number;
  /** Multiplies sun/ambient intensity. */
  lightScale: number;
  /** Desaturates and tints the sky towards this colour by `skyMix`. */
  tint: number;
  skyMix: number;
  /** Precipitation particles per second, 0 for dry weather. */
  precip: number;
  precipColor: number;
  /** Downward (rain) vs sideways (sand) motion. */
  precipFall: number;
  precipDrift: number;
  /** Extra payout for racing in it. */
  payout: number;
}

export const WEATHERS: Record<WeatherId, WeatherDef> = {
  clear: {
    id: "clear",
    name: "Clear",
    blurb: "Dry, grippy, no excuses",
    grip: 1,
    fogScale: 1,
    lightScale: 1,
    tint: 0xffffff,
    skyMix: 0,
    precip: 0,
    precipColor: 0xffffff,
    precipFall: 0,
    precipDrift: 0,
    payout: 1,
  },
  overcast: {
    id: "overcast",
    name: "Overcast",
    blurb: "Flat light, slightly cooler tyres",
    grip: 0.96,
    fogScale: 0.82,
    lightScale: 0.72,
    tint: 0x9aa3ad,
    skyMix: 0.45,
    precip: 0,
    precipColor: 0xffffff,
    precipFall: 0,
    precipDrift: 0,
    payout: 1.05,
  },
  rain: {
    id: "rain",
    name: "Rain",
    blurb: "Low grip, long braking, big money",
    grip: 0.78,
    fogScale: 0.6,
    lightScale: 0.55,
    tint: 0x6f7c8a,
    skyMix: 0.65,
    precip: 2600,
    precipColor: 0xbfd6e8,
    precipFall: 34,
    precipDrift: 5,
    payout: 1.25,
  },
  sandstorm: {
    id: "sandstorm",
    name: "Sandstorm",
    blurb: "You can barely see the next corner",
    grip: 0.88,
    fogScale: 0.3,
    lightScale: 0.62,
    tint: 0xc98f52,
    skyMix: 0.78,
    precip: 2200,
    precipColor: 0xd8b184,
    precipFall: 5,
    precipDrift: 30,
    payout: 1.35,
  },
};

export const WEATHER_ORDER: WeatherId[] = ["clear", "overcast", "rain", "sandstorm"];

/**
 * Sky-box + fog colour for a palette under some weather: the sky is blended
 * towards the weather tint so a rainy sunset actually looks rained on.
 */
export function weatherColor(base: number, w: WeatherDef): THREE.Color {
  return new THREE.Color(base).lerp(new THREE.Color(w.tint), w.skyMix);
}

function dirFrom(elevation: number, azimuth: number): THREE.Vector3 {
  const e = THREE.MathUtils.degToRad(elevation);
  const a = THREE.MathUtils.degToRad(azimuth);
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)).normalize();
}

/** Live sun direction — mutated when the time of day changes. */
export const SUN_DIR = dirFrom(SKIES.sunset.elevation, SKIES.sunset.azimuth);

/** Live horizon colour, used for fog and scene background. */
export const HORIZON_COLOR = new THREE.Color(SKIES.sunset.horizon);

export function sunDirFor(p: SkyPalette): THREE.Vector3 {
  return dirFrom(p.elevation, p.azimuth);
}

export function createSkyDome(palette: SkyPalette = SKIES.sunset): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(palette.top) },
      midColor: { value: new THREE.Color(palette.mid) },
      horizonColor: { value: new THREE.Color(palette.horizon) },
      bottomColor: { value: new THREE.Color(palette.bottom) },
      sunDir: { value: sunDirFor(palette) },
      sunColor: { value: new THREE.Color(palette.sunDisc) },
      starAmount: { value: palette.id === "night" ? 1 : 0 },
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
      uniform float starAmount;
      varying vec3 vWorldPos;

      // cheap hash-based starfield
      float hash31(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
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
        if (starAmount > 0.0 && h > 0.0) {
          vec3 cell = floor(dir * 240.0);
          float r = hash31(cell);
          float star = smoothstep(0.9975, 1.0, r) * smoothstep(0.02, 0.35, h);
          col += vec3(0.9, 0.93, 1.0) * star * 2.4 * starAmount;
        }
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

const UP = new THREE.Vector3(0, 1, 0);

export interface CloudField {
  group: THREE.Group;
  update: (dt: number) => void;
}

/**
 * All cloud puffs live in a single InstancedMesh: 16 drifting cloud groups used
 * to cost ~80 draw calls, now they cost one.
 */
export function createClouds(seed: number, count = 16): CloudField {
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

  interface Puff {
    cloud: number;
    local: THREE.Matrix4;
  }
  const puffs: Puff[] = [];
  const origins: THREE.Vector3[] = [];
  const rotations: number[] = [];
  const speeds: number[] = [];
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const euler = new THREE.Euler();

  for (let i = 0; i < count; i++) {
    const parts = 3 + Math.floor(rand() * 4);
    const size = 14 + rand() * 24;
    for (let p = 0; p < parts; p++) {
      const s = size * (0.45 + rand() * 0.55);
      scl.set(s, s * (0.32 + rand() * 0.2), s * (0.7 + rand() * 0.5));
      pos.set((rand() - 0.5) * size * 1.6, (rand() - 0.5) * size * 0.25, (rand() - 0.5) * size * 0.8);
      euler.set(0, rand() * Math.PI, 0);
      quat.setFromEuler(euler);
      puffs.push({ cloud: i, local: new THREE.Matrix4().compose(pos, quat, scl) });
    }
    const ang = rand() * Math.PI * 2;
    const dist = 180 + rand() * 520;
    origins.push(new THREE.Vector3(Math.cos(ang) * dist, 150 + rand() * 90, Math.sin(ang) * dist));
    rotations.push(rand() * Math.PI * 2);
    speeds.push(1.2 + rand() * 1.5);
  }

  const inst = new THREE.InstancedMesh(base, mat, puffs.length);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // One big billboard field around the whole valley — culling it per-instance
  // would cost more than it saves.
  inst.frustumCulled = false;
  inst.matrixAutoUpdate = false;
  group.add(inst);

  const cloudMatrix = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const idQuat = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);

  // Preallocated so the per-frame update stays garbage-free.
  const cloudMats = origins.map(() => new THREE.Matrix4());

  const write = () => {
    for (let i = 0; i < origins.length; i++) {
      idQuat.setFromAxisAngle(UP, rotations[i]);
      cloudMats[i].compose(origins[i], idQuat, one);
    }
    for (let p = 0; p < puffs.length; p++) {
      cloudMatrix.copy(cloudMats[puffs[p].cloud]);
      out.multiplyMatrices(cloudMatrix, puffs[p].local);
      inst.setMatrixAt(p, out);
    }
    inst.instanceMatrix.needsUpdate = true;
  };
  write();

  const update = (dt: number) => {
    for (let i = 0; i < origins.length; i++) {
      origins[i].x += speeds[i] * dt;
      if (origins[i].x > 760) origins[i].x = -760;
    }
    write();
  };

  return { group, update };
}

export interface LightRig {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  /** Retunes every light for a new time of day / weather combination. */
  apply: (palette: SkyPalette, weather?: WeatherDef) => void;
}

/** Sun + fill lights, retunable for any time of day. */
export function createLighting(
  scene: THREE.Scene,
  opts: { shadows?: boolean; mapSize?: number; palette?: SkyPalette } = {},
): LightRig {
  const mapSize = opts.mapSize ?? 2048;
  const palette = opts.palette ?? SKIES.sunset;
  const sun = new THREE.DirectionalLight(palette.sunColor, palette.sunIntensity);
  sun.position.copy(SUN_DIR).multiplyScalar(140);
  sun.castShadow = opts.shadows !== false;
  sun.shadow.mapSize.set(mapSize, mapSize);
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

  const hemi = new THREE.HemisphereLight(palette.hemiSky, palette.hemiGround, palette.hemiIntensity);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(palette.ambient, palette.ambientIntensity);
  scene.add(ambient);

  const apply = (p: SkyPalette, w: WeatherDef = WEATHERS.clear) => {
    sun.color.copy(weatherColor(p.sunColor, w));
    sun.intensity = p.sunIntensity * w.lightScale;
    hemi.color.copy(weatherColor(p.hemiSky, w));
    hemi.groundColor.copy(weatherColor(p.hemiGround, w));
    hemi.intensity = p.hemiIntensity * (0.6 + w.lightScale * 0.4);
    ambient.color.copy(weatherColor(p.ambient, w));
    ambient.intensity = p.ambientIntensity * (1 + (1 - w.lightScale) * 1.6);
  };

  return { sun, hemi, ambient, apply };
}

/** Repaints an existing sky dome for a time of day and weather combination. */
export function applySkyPalette(sky: THREE.Mesh, palette: SkyPalette, weather: WeatherDef = WEATHERS.clear) {
  const mat = sky.material as THREE.ShaderMaterial;
  const u = mat.uniforms;
  (u.topColor.value as THREE.Color).copy(weatherColor(palette.top, weather));
  (u.midColor.value as THREE.Color).copy(weatherColor(palette.mid, weather));
  (u.horizonColor.value as THREE.Color).copy(weatherColor(palette.horizon, weather));
  (u.bottomColor.value as THREE.Color).copy(weatherColor(palette.bottom, weather));
  (u.sunColor.value as THREE.Color).copy(weatherColor(palette.sunDisc, weather));
  (u.sunDir.value as THREE.Vector3).copy(sunDirFor(palette));
  u.starAmount.value = palette.id === "night" ? 1 - weather.skyMix : 0;
  SUN_DIR.copy(sunDirFor(palette));
  HORIZON_COLOR.copy(weatherColor(palette.horizon, weather));
}
