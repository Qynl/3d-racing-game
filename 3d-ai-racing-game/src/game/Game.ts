import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Noise, clamp, damp } from "./noise";
import { Track, buildStartLine, buildTrackMesh } from "./track";
import { Terrain, WORLD_RADIUS } from "./terrain";
import { buildProps, Collider } from "./props";
import { CloudField, HORIZON_COLOR, SUN_DIR, createClouds, createLighting, createSkyDome } from "./sky";
import { CarInput, CarPhysics, CarVisual, MAX_SPEED, buildCarVisual } from "./car";
import { AIController, AIParams } from "./ai";
import { ParticleSystem } from "./particles";
import { AudioEngine } from "./audio";
import { InputManager } from "./input";
import { CAR_COLORS, Difficulty, RaceResults, Screen, Settings, defaultHud, useGameStore } from "./store";

interface CarEntity {
  physics: CarPhysics;
  visual: CarVisual;
  ai: AIController | null;
  name: string;
  color: number;
  unwrapped: number;
  lastIdx: number;
  crossings: number;
  lapStart: number;
  lapTimes: number[];
  finished: boolean;
  finishTime: number | null;
  input: CarInput;
  dustAcc: number;
}

const AI_NAMES = ["ATLAS", "VECTOR", "KESTREL"];

const DIFFICULTY: Record<Difficulty, { params: AIParams; rubber: number }> = {
  rookie: { params: { topSpeed: MAX_SPEED * 0.78, cornerGrip: 0.76, lookahead: 0.42, aggression: 0.92 }, rubber: 1.3 },
  pro: { params: { topSpeed: MAX_SPEED * 0.9, cornerGrip: 0.86, lookahead: 0.4, aggression: 1 }, rubber: 1.0 },
  legend: { params: { topSpeed: MAX_SPEED * 1.0, cornerGrip: 0.95, lookahead: 0.38, aggression: 1 }, rubber: 0.6 },
};

export const gameHolder: { game: Game | null } = { game: null };

export class Game {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  clock = new THREE.Clock();
  noise: Noise;
  track: Track;
  terrain: Terrain;
  colliders: Collider[];
  clouds: CloudField;
  sky: THREE.Mesh;
  sun: THREE.DirectionalLight;
  particles: ParticleSystem;
  audio = new AudioEngine();
  input = new InputManager();

  cars: CarEntity[] = [];
  player: CarEntity | null = null;
  state: Screen = "menu";
  settings: Settings;
  totalLaps = 3;
  raceTime = 0;
  time = 0;
  countdownTimer = 0;
  lastCountdownNumber = 99;
  goTimer = 0;
  finishDelay = 0;
  wrongTimer = 0;
  shake = 0;
  cameraMode = 0;
  hudAcc = 0;

  private camPos = new THREE.Vector3(0, 60, 160);
  private camLook = new THREE.Vector3();
  private camFwd = new THREE.Vector3(0, 0, 1);
  private fov = 62;
  private minimap: HTMLCanvasElement | null = null;
  private minimapBounds: { minX: number; minZ: number; scale: number; offX: number; offZ: number } | null = null;
  private raf = 0;
  private disposed = false;
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpV3 = new THREE.Vector3();
  private playerInput: CarInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

  constructor(canvas: HTMLCanvasElement) {
    gameHolder.game = this;
    this.settings = useGameStore.getState().settings;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = HORIZON_COLOR.clone();
    scene.fog = new THREE.Fog(HORIZON_COLOR.clone(), 100, 640);
    this.scene = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.4;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 1800);

    this.noise = new Noise(1337);
    this.track = new Track(7);
    this.terrain = new Terrain(this.noise, this.track);
    scene.add(this.terrain.mesh);
    const getH = (x: number, z: number) => this.terrain.getHeight(x, z);
    scene.add(buildTrackMesh(this.track, getH));
    scene.add(buildStartLine(this.track, getH));
    const props = buildProps(this.noise, this.track, this.terrain, 42);
    scene.add(props.group);
    this.colliders = props.colliders;

    this.sky = createSkyDome();
    scene.add(this.sky);
    this.clouds = createClouds(3);
    scene.add(this.clouds.group);
    this.sun = createLighting(scene).sun;

    this.particles = new ParticleSystem(900);
    scene.add(this.particles.points);

    this.input.onAction = (a) => this.handleAction(a);
    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);

    this.createCars();
    this.placeOnGrid();
    this.updateMenuCamera(10);
    this.updateMenuCamera(10);
    useGameStore.getState().setLoaded(true);
    this.clock.start();
    this.loop();
  }

  // ---------------------------------------------------------------- setup
  private createCars() {
    for (const c of this.cars) {
      this.scene.remove(c.visual.root);
      c.visual.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const m = o as THREE.Mesh;
          m.geometry.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) mat.dispose();
        }
      });
    }
    this.cars = [];
    const s = this.settings;
    const diff = DIFFICULTY[s.difficulty];
    const aiColors = CAR_COLORS.filter((_, i) => i !== s.carColor);
    for (let i = 0; i < 3; i++) {
      const color = aiColors[(i * 2 + s.difficulty.length) % aiColors.length].hex;
      const params: AIParams = {
        ...diff.params,
        topSpeed: diff.params.topSpeed * (1 + (i - 1) * 0.025),
        cornerGrip: diff.params.cornerGrip * (1 + (i - 1) * 0.02),
      };
      this.cars.push(this.makeEntity(color, i + 2, new AIController(this.track, params, i + 1), AI_NAMES[i]));
    }
    const player = this.makeEntity(CAR_COLORS[s.carColor].hex, 1, null, "YOU");
    this.cars.push(player);
    this.player = player;
  }

  private makeEntity(color: number, num: number, ai: AIController | null, name: string): CarEntity {
    const visual = buildCarVisual(color, num);
    this.scene.add(visual.root);
    return {
      physics: new CarPhysics(),
      visual,
      ai,
      name,
      color,
      unwrapped: 0,
      lastIdx: 0,
      crossings: 0,
      lapStart: 0,
      lapTimes: [],
      finished: false,
      finishTime: null,
      input: { throttle: 0, brake: 0, steer: 0, handbrake: false },
      dustAcc: 0,
    };
  }

  private placeOnGrid() {
    const M = this.track.count;
    const tmp = this.tmpV;
    this.cars.forEach((e, slot) => {
      const idx = (M - 16 - slot * 12 + M) % M;
      const lateral = slot % 2 === 0 ? -2.7 : 2.7;
      this.track.offsetPoint(idx, lateral, tmp);
      e.physics.place(tmp.x, tmp.z, this.track.yawAt(idx), this.terrain, this.track);
      e.unwrapped = idx - M;
      e.lastIdx = e.physics.trackIndex;
      e.crossings = 0;
      e.lapStart = 0;
      e.lapTimes = [];
      e.finished = false;
      e.finishTime = null;
      e.dustAcc = 0;
      e.physics.syncVisual(e.visual);
    });
  }

  setMinimap(canvas: HTMLCanvasElement | null) {
    this.minimap = canvas;
  }

  // ---------------------------------------------------------------- state control
  startRace(settings: Settings) {
    this.settings = settings;
    this.totalLaps = settings.laps;
    this.cameraMode = settings.cameraMode;
    this.createCars();
    this.placeOnGrid();
    this.particles.clear();
    this.input.reset();
    this.raceTime = 0;
    this.countdownTimer = 3.9;
    this.lastCountdownNumber = 99;
    this.goTimer = 0;
    this.finishDelay = 0;
    this.wrongTimer = 0;
    this.shake = 0;
    this.state = "countdown";
    const store = useGameStore.getState();
    store.setResults(null);
    store.setHud({ ...defaultHud, totalLaps: this.totalLaps, carCount: this.cars.length, position: this.cars.length });
    store.setScreen("countdown");
    this.audio.init();
    this.audio.setMuted(settings.muted);
    this.updateChaseCamera(0, true);
  }

  pause() {
    if (this.state !== "racing") return;
    this.state = "paused";
    useGameStore.getState().setScreen("paused");
    this.audio.updateEngine(0, 0, 0, 0.1, false);
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "racing";
    useGameStore.getState().setScreen("racing");
    this.clock.getDelta();
  }

  restart() {
    this.startRace(useGameStore.getState().settings);
  }

  quitToMenu() {
    this.state = "menu";
    this.placeOnGrid();
    this.particles.clear();
    useGameStore.getState().setScreen("menu");
    useGameStore.getState().setResults(null);
    this.audio.updateEngine(0, 0, 0, 0.1, false);
  }

  setMuted(m: boolean) {
    this.audio.setMuted(m);
  }

  private handleAction(a: "pause" | "restart" | "camera" | "mute") {
    const store = useGameStore.getState();
    if (a === "pause") {
      if (this.state === "racing") this.pause();
      else if (this.state === "paused") this.resume();
    } else if (a === "restart") {
      if (this.state === "racing" || this.state === "paused" || this.state === "finished") this.restart();
    } else if (a === "camera") {
      this.cameraMode = (this.cameraMode + 1) % 3;
      store.setSettings({ cameraMode: this.cameraMode });
    } else if (a === "mute") {
      const m = !store.settings.muted;
      store.setSettings({ muted: m });
      this.audio.setMuted(m);
    }
  }

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private onVisibility = () => {
    if (document.hidden && this.state === "racing") this.pause();
  };

  // ---------------------------------------------------------------- main loop
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = this.clock.getDelta();
    if (dt > 0.05) dt = 0.05;
    this.time += dt;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    this.clouds.update(dt);
    this.sky.position.copy(this.camera.position);

    if (this.state === "menu") {
      this.updateMenuCamera(dt);
      this.updateSun(this.camLook);
      return;
    }
    if (this.state === "paused") {
      return;
    }
    if (this.state === "countdown") {
      this.countdownTimer -= dt;
      const num = Math.ceil(this.countdownTimer);
      if (num !== this.lastCountdownNumber) {
        this.lastCountdownNumber = num;
        if (num >= 1 && num <= 3) {
          this.audio.countdownTick();
          useGameStore.getState().setHud({ countdown: num });
        }
      }
      const inp = this.input.read(dt);
      this.audio.updateEngine(0, inp.throttle, 0, dt, true);
      if (this.countdownTimer <= 0) {
        this.state = "racing";
        this.raceTime = 0;
        this.goTimer = 1.1;
        useGameStore.getState().setScreen("racing");
        useGameStore.getState().setHud({ countdown: 0 });
        this.audio.countdownGo();
      }
      this.updateChaseCamera(dt, false);
      this.updateSun(this.player!.physics.pos);
      return;
    }

    // racing or finished
    if (this.state === "racing") this.raceTime += dt;
    if (this.goTimer > 0) {
      this.goTimer -= dt;
      if (this.goTimer <= 0) useGameStore.getState().setHud({ countdown: -1 });
    }
    this.stepSimulation(dt);
    this.updateProgress(dt);
    this.updateEffects(dt);

    if (this.state === "finished") {
      this.updateFinishCamera(dt);
      if (this.finishDelay > 0) {
        this.finishDelay -= dt;
        if (this.finishDelay <= 0) this.publishResults();
      }
    } else {
      this.updateChaseCamera(dt, false);
    }
    this.updateSun(this.player!.physics.pos);

    // audio
    const p = this.player!.physics;
    const skid = p.onTrack ? Math.max(0, Math.abs(p.speedR) - 6) * 0.035 : 0;
    this.audio.updateEngine(p.speedF, this.playerInput.throttle, skid, dt, true);

    this.hudAcc += dt;
    if (this.hudAcc > 0.08) {
      this.hudAcc = 0;
      this.pushHud();
      this.drawMinimap();
    }
  }

  // ---------------------------------------------------------------- simulation
  private stepSimulation(dt: number) {
    const player = this.player!;
    if (this.state === "racing") {
      this.playerInput = this.input.read(dt);
    } else {
      this.playerInput = { throttle: 0, brake: 0.35, steer: 0, handbrake: false };
    }
    player.input = this.playerInput;
    const allPhysics = this.cars.map((c) => c.physics);
    const diff = DIFFICULTY[this.settings.difficulty];
    for (const e of this.cars) {
      if (!e.ai) continue;
      const gapUnits = (player.unwrapped - e.unwrapped) * this.track.spacing;
      e.ai.speedScale = player.finished ? 1 : 1 + clamp(gapUnits / 650, -0.05, 0.06) * diff.rubber;
      e.input = e.ai.update(e.physics, allPhysics, dt, this.time, this.raceTime > 0.1);
    }
    const sub = 2;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (const e of this.cars) e.physics.step(e.input, h, this.terrain, this.track);
    }
    this.resolveCollisions();
    for (const e of this.cars) e.physics.syncVisual(e.visual);
  }

  private resolveCollisions() {
    const fwd = this.tmpV;
    const rgt = this.tmpV2;
    const fix = (p: CarPhysics) => {
      p.forward(fwd);
      p.right(rgt);
      p.speedF = p.vel.dot(fwd);
      p.speedR = p.vel.dot(rgt);
    };
    for (const e of this.cars) {
      const p = e.physics;
      // world bounds
      const rr = Math.sqrt(p.pos.x * p.pos.x + p.pos.z * p.pos.z);
      if (rr > WORLD_RADIUS) {
        const nx = -p.pos.x / rr;
        const nz = -p.pos.z / rr;
        p.pos.x += nx * (rr - WORLD_RADIUS);
        p.pos.z += nz * (rr - WORLD_RADIUS);
        const vn = p.vel.x * nx + p.vel.z * nz;
        if (vn < 0) {
          p.vel.x -= nx * vn;
          p.vel.z -= nz * vn;
          fix(p);
        }
      }
      for (const c of this.colliders) {
        const dx = p.pos.x - c.x;
        const dz = p.pos.z - c.z;
        const min = c.r + p.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        p.pos.x += nx * (min - d);
        p.pos.z += nz * (min - d);
        const vn = p.vel.x * nx + p.vel.z * nz;
        if (vn < 0) {
          p.vel.x -= nx * vn * 1.5;
          p.vel.z -= nz * vn * 1.5;
          p.vel.multiplyScalar(0.8);
          fix(p);
          this.onImpact(e, -vn, p.pos.x - nx * p.radius, p.pos.z - nz * p.radius);
        }
      }
    }
    // car vs car
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i].physics;
        const b = this.cars[j].physics;
        const dx = a.pos.x - b.pos.x;
        const dz = a.pos.z - b.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const push = (min - d) * 0.5;
        a.pos.x += nx * push;
        a.pos.z += nz * push;
        b.pos.x -= nx * push;
        b.pos.z -= nz * push;
        const van = a.vel.x * nx + a.vel.z * nz;
        const vbn = b.vel.x * nx + b.vel.z * nz;
        const rel = van - vbn;
        if (rel < 0) {
          const jimp = -rel * 0.65;
          a.vel.x += nx * jimp;
          a.vel.z += nz * jimp;
          b.vel.x -= nx * jimp;
          b.vel.z -= nz * jimp;
          fix(a);
          fix(b);
          const cx = (a.pos.x + b.pos.x) * 0.5;
          const cz = (a.pos.z + b.pos.z) * 0.5;
          this.onImpact(this.cars[i], -rel, cx, cz);
          this.onImpact(this.cars[j], -rel, cx, cz);
        }
      }
    }
  }

  private onImpact(e: CarEntity, strength: number, x: number, z: number) {
    if (strength < 1.5) return;
    const y = this.terrain.getHeight(x, z) + 0.5;
    const n = Math.min(14, Math.floor(strength));
    for (let i = 0; i < n; i++) {
      this.particles.emit(
        x + (Math.random() - 0.5), y + Math.random() * 0.6, z + (Math.random() - 0.5),
        (Math.random() - 0.5) * 6, 1 + Math.random() * 4, (Math.random() - 0.5) * 6,
        0.5 + Math.random() * 0.6, 0.5 + Math.random() * 0.6, 2.2, 0xc9a67a, 0.5
      );
    }
    if (e === this.player) {
      this.shake = Math.min(1, this.shake + clamp(strength / 18, 0.1, 0.7));
      this.audio.impact(strength);
    }
  }

  private updateProgress(dt: number) {
    const M = this.track.count;
    for (const e of this.cars) {
      let delta = e.physics.trackIndex - e.lastIdx;
      if (delta > M / 2) delta -= M;
      if (delta < -M / 2) delta += M;
      e.lastIdx = e.physics.trackIndex;
      e.unwrapped += delta;
      const crossings = Math.floor(e.unwrapped / M) + 1;
      if (crossings > e.crossings) {
        if (e.crossings >= 1) {
          e.lapTimes.push(this.raceTime - e.lapStart);
          if (e === this.player) this.audio.lapChime();
        }
        e.lapStart = this.raceTime;
        e.crossings = crossings;
        if (e.crossings >= this.totalLaps + 1 && !e.finished) {
          e.finished = true;
          e.finishTime = this.raceTime;
          if (e === this.player) this.onPlayerFinish();
        }
      } else if (crossings < e.crossings) {
        e.crossings = crossings;
        if (e.lapTimes.length > 0) e.lapTimes.pop();
        e.lapStart = this.raceTime;
      }
    }
    // wrong-way detection
    const p = this.player!.physics;
    const t = this.track.tangents[p.trackIndex];
    const along = p.vel.x * t.x + p.vel.z * t.z;
    if (along < -3) this.wrongTimer += dt;
    else this.wrongTimer = Math.max(0, this.wrongTimer - dt * 2);
  }

  private onPlayerFinish() {
    this.state = "finished";
    this.finishDelay = 2.4;
    this.audio.finishFanfare();
    useGameStore.getState().setScreen("finished");
  }

  private ranking(): CarEntity[] {
    return [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.unwrapped - a.unwrapped;
    });
  }

  private publishResults() {
    const player = this.player!;
    const order = this.ranking();
    const position = order.indexOf(player) + 1;
    const total = player.finishTime ?? this.raceTime;
    const bestLap = player.lapTimes.length ? Math.min(...player.lapTimes) : null;
    const store = useGameStore.getState();
    const isRecord = store.recordBest(this.settings.difficulty, total);
    const results: RaceResults = {
      position,
      totalTime: total,
      lapTimes: [...player.lapTimes],
      bestLap,
      isRecord,
      cars: order.map((c) => ({
        name: c.name,
        color: c.color,
        time: c.finishTime,
        isPlayer: c === player,
        bestLap: c.lapTimes.length ? Math.min(...c.lapTimes) : null,
      })),
    };
    store.setResults(results);
  }

  // ---------------------------------------------------------------- effects
  private updateEffects(dt: number) {
    const fwd = this.tmpV;
    const rgt = this.tmpV2;
    for (const e of this.cars) {
      const p = e.physics;
      const sp = Math.abs(p.speedF);
      const slip = Math.abs(p.speedR);
      let rate = 0;
      if (sp > 2.5) rate += (p.onTrack ? 9 : 48) * clamp(sp / 28, 0, 1);
      if (slip > 2.5) rate += slip * 12;
      if (e.input.throttle > 0.5 && sp < 18 && sp > 0.3) rate += 26;
      if (e.input.handbrake && sp > 6) rate += 20;
      e.dustAcc += rate * dt;
      if (e.dustAcc < 1) continue;
      p.forward(fwd);
      p.right(rgt);
      const color = p.onTrack ? 0xb08c66 : 0xd9bf92;
      while (e.dustAcc >= 1) {
        e.dustAcc -= 1;
        const side = Math.random() < 0.5 ? -0.9 : 0.9;
        const x = p.pos.x - fwd.x * 1.5 + rgt.x * side;
        const z = p.pos.z - fwd.z * 1.5 + rgt.z * side;
        const y = p.pos.y + 0.25;
        this.particles.emit(
          x, y, z,
          -fwd.x * (1.5 + sp * 0.06) + (Math.random() - 0.5) * 1.6 - p.vel.x * 0.05,
          0.7 + Math.random() * 1.5,
          -fwd.z * (1.5 + sp * 0.06) + (Math.random() - 0.5) * 1.6 - p.vel.z * 0.05,
          0.7 + Math.random() * 0.9, 0.8 + Math.random() * 0.8, 2.0, color,
          p.onTrack ? 0.28 : 0.4
        );
      }
    }
    this.particles.update(dt);
  }

  private updateSun(focus: THREE.Vector3) {
    this.sun.position.copy(focus).addScaledVector(SUN_DIR, 150);
    this.sun.target.position.copy(focus);
  }

  // ---------------------------------------------------------------- cameras
  private updateMenuCamera(dt: number) {
    const M = this.track.count;
    const i = Math.floor((this.time * 0.028 * M) % M);
    const p = this.track.points[i];
    const r = this.track.rights[i];
    const t = this.track.tangents[i];
    const target = this.tmpV.set(p.x + r.x * 20 - t.x * 12, p.y + 11, p.z + r.z * 20 - t.z * 12);
    target.y = Math.max(target.y, this.terrain.getHeight(target.x, target.z) + 4);
    const look = this.track.points[(i + 70) % M];
    this.tmpV2.set(look.x, look.y + 2, look.z);
    const k1 = 1 - Math.exp(-1.6 * dt);
    const k2 = 1 - Math.exp(-2.2 * dt);
    this.camPos.lerp(target, k1);
    this.camLook.lerp(this.tmpV2, k2);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.fov = damp(this.fov, 58, 2, dt);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  private updateChaseCamera(dt: number, snap: boolean) {
    const p = this.player!.physics;
    const fwd = p.forward(this.tmpV);
    const rgt = p.right(this.tmpV2);
    const kF = snap ? 1 : 1 - Math.exp(-3.5 * dt);
    this.camFwd.lerp(fwd, kF).normalize();
    const speedFrac = clamp(Math.abs(p.speedF) / MAX_SPEED, 0, 1);
    const mode = this.cameraMode;
    const desired = this.tmpV3;
    let lookAhead: number;
    let rate: number;
    if (mode === 2) {
      desired.set(p.pos.x + fwd.x * 0.6, p.pos.y + 1.62, p.pos.z + fwd.z * 0.6);
      lookAhead = 24;
      rate = 40;
    } else if (mode === 1) {
      const dist = 11.5 + speedFrac * 1.5;
      desired.set(p.pos.x - this.camFwd.x * dist, p.pos.y + 5.4, p.pos.z - this.camFwd.z * dist);
      lookAhead = 8;
      rate = 5;
    } else {
      const dist = 7.4 + speedFrac * 2.0;
      desired.set(p.pos.x - this.camFwd.x * dist, p.pos.y + 2.9 + speedFrac * 0.3, p.pos.z - this.camFwd.z * dist);
      lookAhead = 5.5;
      rate = 5.5;
    }
    if (mode !== 2) {
      const ground = this.terrain.getHeight(desired.x, desired.z) + 1.0;
      if (desired.y < ground) desired.y = ground;
    }
    const k = snap ? 1 : 1 - Math.exp(-rate * dt);
    this.camPos.lerp(desired, k);
    const steerLook = this.playerInput.steer * 1.4 * speedFrac;
    const lookTarget = this.tmpV3.set(
      p.pos.x + this.camFwd.x * lookAhead + rgt.x * steerLook,
      p.pos.y + (mode === 2 ? 1.3 : 1.1),
      p.pos.z + this.camFwd.z * lookAhead + rgt.z * steerLook
    );
    const kl = snap ? 1 : 1 - Math.exp(-9 * dt);
    this.camLook.lerp(lookTarget, kl);

    this.shake = Math.max(0, this.shake - dt * 1.8);
    const sh = this.shake * this.shake * 0.35;
    this.camera.position.set(
      this.camPos.x + (Math.random() - 0.5) * sh,
      this.camPos.y + (Math.random() - 0.5) * sh,
      this.camPos.z + (Math.random() - 0.5) * sh
    );
    this.camera.lookAt(this.camLook);
    const targetFov = (mode === 2 ? 70 : 62) + speedFrac * 14;
    this.fov = snap ? targetFov : damp(this.fov, targetFov, 3, dt);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  private updateFinishCamera(dt: number) {
    const p = this.player!.physics;
    const a = this.time * 0.45;
    const desired = this.tmpV3.set(p.pos.x + Math.cos(a) * 8.5, p.pos.y + 3.4, p.pos.z + Math.sin(a) * 8.5);
    const ground = this.terrain.getHeight(desired.x, desired.z) + 1.0;
    if (desired.y < ground) desired.y = ground;
    const k = 1 - Math.exp(-2.5 * dt);
    this.camPos.lerp(desired, k);
    this.camLook.lerp(this.tmpV.set(p.pos.x, p.pos.y + 1, p.pos.z), 1 - Math.exp(-6 * dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.fov = damp(this.fov, 50, 2, dt);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- HUD
  private pushHud() {
    const player = this.player!;
    const p = player.physics;
    const order = this.ranking();
    const idx = order.indexOf(player);
    let gap: number | null = null;
    const sp = Math.max(Math.abs(p.speedF), 8);
    if (idx > 0) {
      gap = ((order[idx - 1].unwrapped - player.unwrapped) * this.track.spacing) / sp;
    } else if (order.length > 1) {
      gap = -((player.unwrapped - order[1].unwrapped) * this.track.spacing) / sp;
    }
    const lap = clamp(player.crossings, 1, this.totalLaps);
    useGameStore.getState().setHud({
      speed: Math.abs(p.speedF) * 3.6,
      lap,
      totalLaps: this.totalLaps,
      position: idx + 1,
      carCount: this.cars.length,
      time: player.finished ? player.finishTime ?? this.raceTime : this.raceTime,
      lapTimes: [...player.lapTimes],
      bestLap: player.lapTimes.length ? Math.min(...player.lapTimes) : null,
      wrongWay: this.wrongTimer > 1.0 && this.state === "racing",
      finalLap: player.crossings === this.totalLaps && !player.finished,
      offTrack: !p.onTrack,
      drifting: Math.abs(p.speedR) > 7,
      currentLapTime: this.raceTime - player.lapStart,
      gapAhead: gap,
    });
  }

  private drawMinimap() {
    const canvas = this.minimap;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    if (!this.minimapBounds) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of this.track.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
      const pad = 16;
      const scale = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
      const offX = (W - (maxX - minX) * scale) / 2;
      const offZ = (H - (maxZ - minZ) * scale) / 2;
      this.minimapBounds = { minX, minZ, scale, offX, offZ };
    }
    const b = this.minimapBounds;
    const sx = (x: number) => b.offX + (x - b.minX) * b.scale;
    const sz = (z: number) => b.offZ + (z - b.minZ) * b.scale;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const pts = this.track.points;
    for (let i = 0; i < pts.length; i += 4) {
      const x = sx(pts[i].x);
      const z = sz(pts[i].z);
      if (i === 0) ctx.moveTo(x, z);
      else ctx.lineTo(x, z);
    }
    ctx.closePath();
    ctx.strokeStyle = "rgba(30, 20, 14, 0.6)";
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = "rgba(236, 214, 178, 0.95)";
    ctx.lineWidth = 5;
    ctx.stroke();
    // start line
    const p0 = pts[0];
    const r0 = this.track.rights[0];
    ctx.beginPath();
    ctx.moveTo(sx(p0.x - r0.x * 10), sz(p0.z - r0.z * 10));
    ctx.lineTo(sx(p0.x + r0.x * 10), sz(p0.z + r0.z * 10));
    ctx.strokeStyle = "#2a2522";
    ctx.lineWidth = 3;
    ctx.stroke();
    // cars
    for (const e of this.cars) {
      if (e === this.player) continue;
      ctx.beginPath();
      ctx.arc(sx(e.physics.pos.x), sz(e.physics.pos.z), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#" + e.color.toString(16).padStart(6, "0");
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(20,14,10,0.8)";
      ctx.stroke();
    }
    const pl = this.player!;
    ctx.beginPath();
    ctx.arc(sx(pl.physics.pos.x), sz(pl.physics.pos.z), 6, 0, Math.PI * 2);
    ctx.fillStyle = "#" + pl.color.toString(16).padStart(6, "0");
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#fff6e8";
    ctx.stroke();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.input.dispose();
    this.audio.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints) {
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) mat?.dispose();
      }
    });
    this.renderer.dispose();
    if (gameHolder.game === this) gameHolder.game = null;
  }
}
