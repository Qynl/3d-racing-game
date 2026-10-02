import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { AIController, type AIMode, AIParams } from "./ai";
import { nextFrame } from "./async";
import { AudioEngine } from "./audio";
import {
  CarInput,
  CarPhysics,
  CarVisual,
  MAX_SPEED,
  NEUTRAL_INPUT,
  buildCarVisual,
  disposeCarVisual,
  tuningFromClass,
} from "./car";
import {
  CAR_COLORS,
  driversFor,
  type DifficultyDef,
  type DriverDef,
  DIFFICULTIES,
  QUALITY_PRESETS,
  type QualityId,
  type QualityPreset,
  SECTOR_COUNT,
  TRACKS,
  carClassById,
  trackById,
  wildcardTrack,
} from "./config";
import { GhostPlayer, GhostRecorder, loadGhost, saveGhost } from "./ghost";
import { InputManager, type InputAction } from "./input";
import { Noise, clamp, damp, lerp } from "./noise";
import { ParticleSystem } from "./particles";
import { buildProps, type Collider } from "./props";
import { SkidMarks } from "./skidmarks";
import {
  CloudField,
  HORIZON_COLOR,
  type LightRig,
  SKIES,
  SUN_DIR,
  type SkyPalette,
  type TimeOfDayId,
  WEATHERS,
  type WeatherDef,
  type WeatherId,
  applySkyPalette,
  createClouds,
  createLighting,
  createSkyDome,
} from "./sky";
import { Precipitation } from "./weather";
import { computePayout } from "./economy";
import {
  type RaceResults,
  type Screen,
  type Settings,
  type StandingRow,
  defaultHud,
  raceKey,
  useGameStore,
} from "./store";
import { Terrain, WORLD_RADIUS } from "./terrain";
import { ColliderGrid } from "./collision";
import { computeRacingLine, type RacingLine } from "./racingline";
import type { MinimapBounds, MinimapScene } from "./minimap";
import { computeMinimapBounds, drawMinimap } from "./minimap";
import {
  type StartGantry,
  Track,
  buildRacingLine,
  buildStartGantry,
  buildStartLine,
  buildTrackMesh,
} from "./track";

interface CarEntity {
  physics: CarPhysics;
  visual: CarVisual;
  ai: AIController | null;
  /** Last reported AI intent, used to spot new incidents. */
  aiMode: AIMode;
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
  // lap validation
  sectorsHit: boolean[];
  sectorStart: number;
  sectorTimes: (number | null)[];
  bestSectors: (number | null)[];
  lapValid: boolean;
  offCourseTimer: number;
  // skid marks
  skidPrev: { x: number; y: number; z: number }[] | null;
  stuckTimer: number;
  /** Floating name plate, null for the player. */
  tag: THREE.Sprite | null;
  /** Rumble-strip rattle cooldown. */
  rattle: number;
  /** Damage smoke emitter accumulator. */
  smokeAcc: number;
  /** Wet-weather spray accumulator. */
  sprayAcc: number;
  headlights: THREE.SpotLight | null;
}

/**
 * Module-level handle on the live Game instance, with a subscription so React
 * can react to it appearing/disappearing instead of polling for it.
 */
class GameHolder {
  private current: Game | null = null;
  private listeners = new Set<(g: Game | null) => void>();

  get game(): Game | null {
    return this.current;
  }

  set game(g: Game | null) {
    if (this.current === g) return;
    this.current = g;
    for (const fn of this.listeners) fn(g);
  }

  /** Calls `fn` immediately with the current value, then on every change. */
  subscribe(fn: (g: Game | null) => void): () => void {
    this.listeners.add(fn);
    fn(this.current);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

export const gameHolder = new GameHolder();

export class WebGLUnavailableError extends Error {}

export class Game {
  renderer!: THREE.WebGLRenderer;
  composer!: EffectComposer;
  bloomPass: UnrealBloomPass | null = null;
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  clock = new THREE.Clock();
  noise!: Noise;
  track!: Track;
  terrain!: Terrain;
  colliders!: ColliderGrid;
  clouds!: CloudField;
  sky!: THREE.Mesh;
  sun!: THREE.DirectionalLight;
  lights!: LightRig;
  palette: SkyPalette = SKIES.sunset;
  weather: WeatherDef = WEATHERS.clear;
  precip!: Precipitation;
  particles!: ParticleSystem;
  skid!: SkidMarks;
  racingLine: THREE.Mesh | null = null;
  /** Solved racing line + speed plan for the current circuit. */
  line: RacingLine | null = null;
  gantry: StartGantry | null = null;
  audio = new AudioEngine();
  input = new InputManager();
  quality!: QualityPreset;

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

  // ghost
  private ghostRec = new GhostRecorder();
  private ghostPlayer: GhostPlayer | null = null;
  private ghostVisual: CarVisual | null = null;
  private ghostBestTime: number | null = null;
  private pendingGhost: Float32Array | null = null;

  // pacing / records
  private sessionBestLap: number | null = null;
  private bestSplits: Float32Array | null = null;
  private curSplits = new Float32Array(SPLIT_BUCKETS);
  private lastSplitBucket = -1;
  private lastPosition = 0;

  private camPos = new THREE.Vector3(0, 60, 160);
  private camLook = new THREE.Vector3();
  private camFwd = new THREE.Vector3(0, 0, 1);
  private fov = 62;
  private fovKick = 0;
  private minimap: HTMLCanvasElement | null = null;
  // Reused every frame so drawing the map allocates nothing.
  private minimapScene: MinimapScene = {
    track: null as unknown as Track,
    cars: [],
    player: null,
    ghost: null,
  };
  private minimapBounds: MinimapBounds | null = null;
  private raf = 0;
  private disposed = false;
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpV3 = new THREE.Vector3();
  private tmpV4 = new THREE.Vector3();
  private colBuf: Collider[] = [];
  private playerInput: CarInput = { ...NEUTRAL_INPUT };
  private wasBoosting = false;
  /** Launch-control rev meter, charged while the lights are on. */
  private launchRevs = 0;
  private launchDone = false;

  // adaptive resolution
  private resScale = 1;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fpsTimer = 0;
  private downgrades = 0;

  private constructor(private canvas: HTMLCanvasElement) {
    this.settings = useGameStore.getState().settings;
    this.quality = QUALITY_PRESETS[this.settings.quality] ?? QUALITY_PRESETS.high;
  }

  // ---------------------------------------------------------------- bootstrap

  static async create(canvas: HTMLCanvasElement): Promise<Game> {
    const g = new Game(canvas);
    await g.init();
    return g;
  }

  private async init() {
    const store = useGameStore.getState();
    const q = this.quality;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false, // MSAA comes from the composer's multisampled target
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: false,
      });
    } catch (err) {
      throw new WebGLUnavailableError(err instanceof Error ? err.message : "WebGL unavailable");
    }
    if (!this.renderer.getContext()) throw new WebGLUnavailableError("No WebGL context");

    this.applyPixelRatio();
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.palette = SKIES[this.settings.timeOfDay] ?? SKIES.sunset;
    this.renderer.toneMappingExposure = this.palette.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.canvas.addEventListener("webglcontextlost", this.onContextLost as EventListener, false);
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestored as EventListener, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(this.palette.horizon);
    scene.fog = new THREE.Fog(new THREE.Color(this.palette.horizon), 100, q.viewDistance);
    this.scene = scene;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = this.palette.envIntensity;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 1800);

    store.setProgress(0.02, "Seeding the desert");
    await nextFrame();

    const def = this.defFor(this.settings.trackId);
    this.noise = new Noise(1337 + def.seed);
    this.track = new Track(def, this.settings.reverse);
    this.terrain = await Terrain.create(this.noise, this.track, (f, label) =>
      store.setProgress(0.02 + f * 0.8, label),
    );
    scene.add(this.terrain.mesh);

    const getH = (x: number, z: number) => this.terrain.getHeight(x, z);
    scene.add(buildTrackMesh(this.track, getH));
    scene.add(buildStartLine(this.track, getH));
    this.gantry = buildStartGantry(this.track, getH);
    scene.add(this.gantry.group);
    this.line = computeRacingLine(this.track);
    this.racingLine = buildRacingLine(this.track, getH, this.line);
    this.racingLine.visible = this.settings.showRacingLine;
    scene.add(this.racingLine);

    store.setProgress(0.86, "Planting cacti");
    await nextFrame();
    const props = buildProps(this.noise, this.track, this.terrain, 42 + def.seed, q.propDensity);
    props.group.name = "props";
    scene.add(props.group);
    this.colliders = new ColliderGrid(props.colliders);

    store.setProgress(0.93, "Hanging the sun");
    await nextFrame();
    this.sky = createSkyDome(this.palette);
    scene.add(this.sky);
    this.clouds = createClouds(3, q.cloudCount);
    scene.add(this.clouds.group);
    this.lights = createLighting(scene, {
      shadows: q.shadows,
      mapSize: q.shadowMapSize,
      palette: this.palette,
    });
    this.sun = this.lights.sun;
    this.weather = this.rollWeather();
    applySkyPalette(this.sky, this.palette, this.weather);
    this.lights.apply(this.palette, this.weather);

    this.precip = new Precipitation(2600);
    scene.add(this.precip.points);
    this.particles = new ParticleSystem(q.particles);
    scene.add(this.particles.points);
    this.skid = new SkidMarks(q.skidSegments);
    scene.add(this.skid.mesh);

    this.setupComposer();

    this.input.setBinds(this.settings.keyBinds);
    this.input.onAction = (a) => this.handleAction(a);
    this.input.onGamepadChange = (connected) => {
      if (connected) {
        useGameStore.getState().pushToast({ text: "Gamepad connected", kind: "info" });
      }
    };
    window.addEventListener("resize", this.onResize);
    window.addEventListener("blur", this.onWindowBlur);
    document.addEventListener("visibilitychange", this.onVisibility);

    store.setProgress(0.97, "Lining up the grid");
    await nextFrame();
    this.loadGhostForTrack();
    this.createCars();
    this.placeOnGrid();
    // Fog, precipitation, headlights and the audio bed for the saved settings.
    this.applyTimeOfDay(this.settings.timeOfDay, this.weather);
    this.updateMenuCamera(10);
    this.updateMenuCamera(10);

    gameHolder.game = this;
    store.setProgress(1, "Ready");
    store.setLoaded(true);
    this.clock.start();
    this.loop();
  }

  private setupComposer() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      samples: this.quality.antialias ? 4 : 0,
      type: THREE.HalfFloatType,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(size.x, size.y);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality.bloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.38, 0.75, 0.86);
      this.composer.addPass(this.bloomPass);
    }
    this.composer.addPass(new OutputPass());
  }

  private rebuildComposer() {
    this.composer?.dispose();
    this.bloomPass = null;
    this.setupComposer();
  }

  private applyPixelRatio() {
    const q = this.quality;
    const dpr = Math.min(window.devicePixelRatio || 1, q.maxPixelRatio);
    this.renderer.setPixelRatio(dpr * q.renderScale * this.resScale);
  }

  // ---------------------------------------------------------------- quality

  applyQuality(id: QualityId) {
    const q = QUALITY_PRESETS[id];
    if (!q) return;
    this.quality = q;
    this.resScale = 1;
    this.applyPixelRatio();
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.far = q.viewDistance;

    if (this.particles.capacity !== q.particles) {
      this.scene.remove(this.particles.points);
      this.particles.dispose();
      this.particles = new ParticleSystem(q.particles);
      this.scene.add(this.particles.points);
    }
    this.scene.remove(this.skid.mesh);
    this.skid.dispose();
    this.skid = new SkidMarks(q.skidSegments);
    this.scene.add(this.skid.mesh);

    this.rebuildComposer();
    this.onResize();
  }

  private updateAdaptive(dt: number) {
    this.fpsAcc += dt;
    this.fpsFrames++;
    this.fpsTimer += dt;
    if (this.fpsAcc < 1) return;
    const fps = this.fpsFrames / this.fpsAcc;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    useGameStore.getState().setFps(Math.round(fps));
    if (!this.settings.autoQuality || this.state === "menu") return;
    if (fps < 42 && this.resScale > 0.62) {
      this.resScale = Math.max(0.62, this.resScale - 0.1);
      this.applyPixelRatio();
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.onResize();
    } else if (fps > 58 && this.resScale < 1) {
      this.resScale = Math.min(1, this.resScale + 0.05);
      this.applyPixelRatio();
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.onResize();
    } else if (fps < 34 && this.resScale <= 0.63 && this.downgrades < 2) {
      const order: QualityId[] = ["low", "medium", "high", "ultra"];
      const i = order.indexOf(this.quality.id);
      if (i > 0) {
        this.downgrades++;
        const next = order[i - 1];
        useGameStore.getState().setSettings({ quality: next });
        this.settings = useGameStore.getState().settings;
        this.applyQuality(next);
        useGameStore
          .getState()
          .pushToast({ text: `Graphics lowered to ${QUALITY_PRESETS[next].name}`, kind: "info" });
      }
    }
  }

  // ---------------------------------------------------------------- setup

  /** Resolves a track id to its definition, rolling the wildcard if needed. */
  private defFor(trackId: string) {
    return trackId === "wildcard" ? wildcardTrack(this.settings.wildcardSeed) : trackById(trackId);
  }

  /** Resolves the weather setting, rolling the dice when it is "random". */
  private rollWeather(): WeatherDef {
    const want = this.settings.weather;
    if (want === "random") {
      // Clear weather stays the most likely outcome; storms are an event.
      const table: WeatherId[] = ["clear", "clear", "clear", "overcast", "overcast", "rain", "sandstorm"];
      return WEATHERS[table[Math.floor(Math.random() * table.length)]];
    }
    return WEATHERS[want] ?? WEATHERS.clear;
  }

  /** Repaints the world for a different time of day / weather. No rebuild. */
  applyTimeOfDay(id: TimeOfDayId, weather: WeatherDef = this.weather) {
    const p = SKIES[id] ?? SKIES.sunset;
    this.palette = p;
    this.weather = weather;
    applySkyPalette(this.sky, p, weather);
    this.lights.apply(p, weather);
    this.renderer.toneMappingExposure = p.exposure * (weather.id === "clear" ? 1 : 1.04);
    this.scene.environmentIntensity = p.envIntensity * weather.lightScale;
    (this.scene.background as THREE.Color).copy(HORIZON_COLOR);
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(HORIZON_COLOR);
      fog.near = (p.id === "night" ? 60 : 100) * weather.fogScale;
      fog.far = this.quality.viewDistance * weather.fogScale;
    }
    this.precip.configure(weather, this.camera.position);
    this.audio.setWeatherBed(
      weather.precip > 0 ? (weather.id === "rain" ? 0.18 : 0.22) : 0,
      weather.id === "rain",
    );
    this.clouds.group.visible = weather.id !== "sandstorm";
    for (const c of this.cars) this.applyCarLights(c);
    if (this.ghostVisual) {
      this.ghostVisual.headMat.emissiveIntensity = p.headlights || weather.lightScale < 0.7 ? 2 : 0.4;
    }
  }

  /** Headlight beam + lamp glow for one car, matching the current sky. */
  private applyCarLights(e: CarEntity) {
    const on = this.palette.headlights || this.weather.lightScale < 0.7;
    e.visual.headMat.emissive.set(0xfff0cc);
    e.visual.headMat.emissiveIntensity = on ? 3.4 : 0.35;
    const isPlayer = e === this.player;
    if (on && isPlayer && !e.headlights) {
      const spot = new THREE.SpotLight(0xfff0d0, 90, 120, 0.46, 0.55, 1.3);
      spot.position.set(0, 1.0, 2.1);
      spot.target.position.set(0, -0.3, 40);
      e.visual.root.add(spot);
      e.visual.root.add(spot.target);
      e.headlights = spot;
    }
    if (e.headlights) e.headlights.visible = on;
  }

  private destroyCars() {
    for (const c of this.cars) {
      if (c.tag) {
        c.tag.material.map?.dispose();
        c.tag.material.dispose();
        c.visual.root.remove(c.tag);
      }
      c.headlights = null;
      this.scene.remove(c.visual.root);
      disposeCarVisual(c.visual);
    }
    this.cars = [];
  }

  private createCars() {
    this.destroyCars();
    const s = this.settings;
    const timeTrial = s.mode === "timetrial";
    const diff = DIFFICULTIES[s.difficulty];
    const playerClass = carClassById(s.carClassId);
    const field = timeTrial ? [] : driversFor(s.rivals);
    field.forEach((d, i) => {
      // The difficulty sets the envelope; the driver's personality decides
      // where inside that envelope they sit, so every rival feels different
      // without any of them breaking the difficulty you chose.
      const params: AIParams = aiParamsFor(diff, d);
      this.cars.push(
        this.makeEntity(
          d.color,
          i + 2,
          new AIController(this.track, params, i + 1, this.line),
          d.name,
          playerClass.id,
        ),
      );
    });
    const player = this.makeEntity(CAR_COLORS[s.carColor].hex, 1, null, "YOU", playerClass.id);
    this.cars.push(player);
    this.player = player;

    for (const e of this.cars) {
      if (e !== player) {
        e.tag = this.makeNameTag(e.name, e.color);
        if (e.tag) e.visual.root.add(e.tag);
      }
      this.applyCarLights(e);
    }

    // Audio voices: index 0 is always the player.
    if (this.audio.ready) this.audio.configureEngines(this.cars.length);

    // ghost visual
    this.ensureGhostVisual();
  }

  private makeEntity(
    color: number,
    num: number,
    ai: AIController | null,
    name: string,
    classId: string,
  ): CarEntity {
    const visual = buildCarVisual(color, num, { classId });
    this.scene.add(visual.root);
    // Only the player's car carries garage upgrades; rivals use the reference
    // tuning below so difficulty stays the difficulty you picked.
    const tuning = tuningFromClass(
      carClassById(classId),
      ai ? undefined : useGameStore.getState().upgradesFor(classId),
    );
    if (ai) {
      // Rivals use the reference tuning so difficulty stays meaningful whatever
      // the player picked.
      tuning.topSpeed = MAX_SPEED;
      tuning.grip = 9;
      tuning.steer = 2.7;
      tuning.engine = 21;
      tuning.brake = 40;
    }
    return {
      physics: new CarPhysics(tuning),
      visual,
      ai,
      aiMode: "cruise",
      name,
      color,
      unwrapped: 0,
      lastIdx: 0,
      crossings: 0,
      lapStart: 0,
      lapTimes: [],
      finished: false,
      finishTime: null,
      input: { ...NEUTRAL_INPUT },
      dustAcc: 0,
      sectorsHit: new Array(SECTOR_COUNT).fill(false),
      sectorStart: 0,
      sectorTimes: new Array(SECTOR_COUNT).fill(null),
      bestSectors: new Array(SECTOR_COUNT).fill(null),
      lapValid: true,
      offCourseTimer: 0,
      skidPrev: null,
      stuckTimer: 0,
      tag: null,
      rattle: 0,
      smokeAcc: 0,
      sprayAcc: 0,
      headlights: null,
    };
  }

  /** Billboard name plate drawn into a small canvas texture. */
  private makeNameTag(name: string, color: number): THREE.Sprite | null {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const hex = `#${color.toString(16).padStart(6, "0")}`;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = "rgba(14,12,11,0.68)";
    ctx.beginPath();
    ctx.roundRect(8, 10, 240, 44, 12);
    ctx.fill();
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.roundRect(8, 10, 10, 44, 5);
    ctx.fill();
    ctx.font = "600 28px system-ui, sans-serif";
    ctx.fillStyle = "#f6ece0";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 134, 33);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }),
    );
    sprite.scale.set(4.2, 1.05, 1);
    sprite.position.set(0, 2.9, 0);
    sprite.renderOrder = 6;
    return sprite;
  }

  private ensureGhostVisual() {
    if (this.ghostVisual) return;
    this.ghostVisual = buildCarVisual(0x9fd6ff, 0, { ghost: true });
    this.ghostVisual.root.visible = false;
    this.scene.add(this.ghostVisual.root);
  }

  private loadGhostForTrack() {
    const g = loadGhost(this.settings.trackId);
    if (g && g.data.length > 12) {
      this.ghostPlayer = new GhostPlayer(g.data);
      this.ghostBestTime = g.lapTime;
    } else {
      this.ghostPlayer = null;
      this.ghostBestTime = null;
    }
  }

  private placeOnGrid() {
    const M = this.track.count;
    const tmp = this.tmpV;
    const single = this.cars.length === 1;
    this.cars.forEach((e, slot) => {
      // Two cars per row, staggered, so even an eight-car field fits neatly
      // behind the gantry.
      const row = slot >> 1;
      const back = single ? 14 : 16 + row * 9;
      const idx = ((M - back) % M + M) % M;
      const lateral = single ? 0 : slot % 2 === 0 ? -2.9 : 2.9;
      this.track.offsetPoint(idx, lateral, tmp);
      e.physics.place(tmp.x, tmp.z, this.track.yawAt(idx), this.terrain, this.track);
      e.physics.resetRaceState();
      e.unwrapped = M - back - M;
      e.lastIdx = e.physics.trackIndex;
      e.crossings = 0;
      e.lapStart = 0;
      e.lapTimes = [];
      e.finished = false;
      e.finishTime = null;
      e.dustAcc = 0;
      e.input = { ...NEUTRAL_INPUT };
      e.sectorsHit.fill(false);
      e.sectorStart = 0;
      e.sectorTimes.fill(null);
      e.bestSectors.fill(null);
      e.lapValid = true;
      e.offCourseTimer = 0;
      e.skidPrev = null;
      e.stuckTimer = 0;
      e.rattle = 0;
      e.smokeAcc = 0;
      e.sprayAcc = 0;
      e.physics.syncVisual(e.visual, this.time);
    });
  }

  setMinimap(canvas: HTMLCanvasElement | null) {
    this.minimap = canvas;
    this.minimapBounds = null;
  }

  // ---------------------------------------------------------------- state control

  /** True when the loaded world no longer matches the requested settings. */
  private worldStale(trackId: string): boolean {
    if (trackId !== this.track.def.id) return true;
    if (this.track.reversed !== this.settings.reverse) return true;
    if (trackId === "wildcard" && this.track.def.name !== `Wildcard #${this.settings.wildcardSeed}`) {
      return true;
    }
    return false;
  }

  /** Rebuild the world for a different track (async, shows the loader again). */
  async changeTrack(trackId: string) {
    if (!this.worldStale(trackId)) return;
    const store = useGameStore.getState();
    store.setLoaded(false);
    store.setProgress(0.02, "Grading a new circuit");
    this.state = "menu";
    store.setScreen("menu");
    await nextFrame();

    // tear down world objects (keep renderer/scene/camera)
    this.destroyCars();
    for (const name of ["terrain", "track", "racingLine", "props", "startLine", "gantry"]) {
      const obj = this.scene.getObjectByName(name);
      if (obj) {
        this.scene.remove(obj);
        disposeObject(obj);
      }
    }

    const def = this.defFor(trackId);
    this.settings = { ...this.settings, trackId };
    this.noise = new Noise(1337 + def.seed);
    this.track = new Track(def, this.settings.reverse);
    this.terrain = await Terrain.create(this.noise, this.track, (f, label) =>
      store.setProgress(0.02 + f * 0.8, label),
    );
    this.scene.add(this.terrain.mesh);
    const getH = (x: number, z: number) => this.terrain.getHeight(x, z);
    const tm = buildTrackMesh(this.track, getH);
    this.scene.add(tm);
    this.scene.add(buildStartLine(this.track, getH));
    this.gantry?.dispose();
    this.gantry = buildStartGantry(this.track, getH);
    this.scene.add(this.gantry.group);
    this.line = computeRacingLine(this.track);
    this.racingLine = buildRacingLine(this.track, getH, this.line);
    this.racingLine.visible = this.settings.showRacingLine;
    this.scene.add(this.racingLine);
    store.setProgress(0.9, "Planting cacti");
    await nextFrame();
    const props = buildProps(this.noise, this.track, this.terrain, 42 + def.seed, this.quality.propDensity);
    props.group.name = "props";
    this.scene.add(props.group);
    this.colliders = new ColliderGrid(props.colliders);

    this.minimapBounds = null;
    this.sessionBestLap = null;
    this.bestSplits = null;
    this.loadGhostForTrack();
    this.createCars();
    this.placeOnGrid();
    this.skid.clear();
    this.particles.clear();
    store.setProgress(1, "Ready");
    store.setLoaded(true);
  }

  /** The circuit list for a fresh championship season. */
  private seasonTracks(): string[] {
    return TRACKS.map((t) => t.id);
  }

  startRace(settings: Settings) {
    const store = useGameStore.getState();
    if (settings.mode === "championship") {
      let season = store.season;
      if (!season || season.done || season.laps !== settings.laps) {
        store.startSeason({
          trackIds: this.seasonTracks(),
          laps: settings.laps,
          difficulty: settings.difficulty,
          carClassId: settings.carClassId,
          colors: {},
        });
        season = useGameStore.getState().season;
      }
      if (season) {
        const target = season.trackIds[Math.min(season.raceIndex, season.trackIds.length - 1)];
        const next = { ...settings, trackId: target, reverse: season.raceIndex % 2 === 1 };
        if (this.worldStale(target) || this.track.reversed !== next.reverse) {
          this.settings = next;
          void this.changeTrack(target).then(() => {
            this.beginRace({ ...useGameStore.getState().settings, ...next });
          });
          return;
        }
        this.beginRace(next);
        return;
      }
    }
    this.beginRace(settings);
  }

  /** Advance a championship to the next round from the results screen. */
  nextSeasonRace() {
    const store = useGameStore.getState();
    const season = store.season;
    if (!season || season.done) {
      store.setScreen("menu");
      this.quitToMenu();
      return;
    }
    this.startRace({ ...store.settings, mode: "championship" });
  }

  private beginRace(settings: Settings) {
    this.settings = settings;
    const rolled = this.rollWeather();
    if (rolled.id !== this.weather.id || settings.timeOfDay !== this.palette.id) {
      this.applyTimeOfDay(settings.timeOfDay, rolled);
      if (settings.weather === "random") {
        useGameStore.getState().pushToast({ text: `${rolled.name} conditions`, kind: "info" });
      }
    }
    this.totalLaps = settings.laps;
    this.cameraMode = settings.cameraMode;
    this.quality = QUALITY_PRESETS[settings.quality] ?? this.quality;
    this.createCars();
    this.placeOnGrid();
    this.particles.clear();
    this.skid.clear();
    this.input.reset();
    this.input.captureKeys = true;
    this.raceTime = 0;
    this.countdownTimer = 3.9;
    this.lastCountdownNumber = 99;
    this.goTimer = 0;
    this.finishDelay = 0;
    this.wrongTimer = 0;
    this.shake = 0;
    this.fovKick = 0;
    this.sessionBestLap = null;
    this.bestSplits = null;
    this.curSplits.fill(0);
    this.lastSplitBucket = -1;
    this.lastPosition = this.cars.length;
    this.pendingGhost = null;
    this.launchRevs = 0;
    this.launchDone = false;
    this.ghostRec.reset();
    this.ghostPlayer?.reset();
    this.state = "countdown";

    const store = useGameStore.getState();
    store.setResults(null);
    const rec = store.recordFor(settings.trackId);
    store.setHud({
      ...defaultHud,
      totalLaps: this.totalLaps,
      carCount: this.cars.length,
      position: this.cars.length,
      bestLap: rec.bestLap,
    });
    store.setScreen("countdown");

    if (this.audio.init()) {
      this.audio.configureEngines(this.cars.length);
      this.audio.setVolumes(settings.masterVolume, settings.musicVolume, settings.muted);
      this.audio.startMusic();
      this.audio.setMusicIntensity(0.25);
    }
    this.updateChaseCamera(0, true);
  }

  pause() {
    if (this.state !== "racing" && this.state !== "countdown") return;
    this.pausedFrom = this.state;
    this.state = "paused";
    this.input.captureKeys = false;
    useGameStore.getState().setScreen("paused");
    this.audio.silenceEngines();
    this.audio.setMusicIntensity(0.1);
  }

  private pausedFrom: Screen = "racing";
  /** Throttles rival incident callouts. */
  private incidentCooldown = 0;

  resume() {
    if (this.state !== "paused") return;
    this.state = this.pausedFrom === "countdown" ? "countdown" : "racing";
    this.input.captureKeys = true;
    useGameStore.getState().setScreen(this.state);
    this.audio.resume();
    this.audio.setMusicIntensity(0.8);
    this.clock.getDelta();
  }

  restart() {
    this.startRace(useGameStore.getState().settings);
  }

  quitToMenu() {
    this.state = "menu";
    this.input.captureKeys = false;
    this.input.reset();
    this.placeOnGrid();
    this.particles.clear();
    this.skid.clear();
    const store = useGameStore.getState();
    store.setScreen("menu");
    store.setResults(null);
    store.setHud({ ...defaultHud });
    this.audio.silenceEngines();
    this.audio.setMusicIntensity(0.2);
    if (this.ghostVisual) this.ghostVisual.root.visible = false;
  }

  /** Rebuilds the cars so new garage upgrades take effect immediately. */
  refreshCars() {
    if (this.state !== "menu") return;
    this.createCars();
    this.placeOnGrid();
  }

  applySettings(settings: Settings) {
    const prevQuality = this.settings.quality;
    const prevLine = this.settings.showRacingLine;
    const prevTod = this.settings.timeOfDay;
    const prevWeather = this.settings.weather;
    const prevReverse = this.settings.reverse;
    const prevSeed = this.settings.wildcardSeed;
    this.settings = settings;
    this.input.setBinds(settings.keyBinds);
    if (prevTod !== settings.timeOfDay || prevWeather !== settings.weather) {
      this.applyTimeOfDay(settings.timeOfDay, this.rollWeather());
    }
    if (
      this.state === "menu" &&
      (prevReverse !== settings.reverse ||
        (settings.trackId === "wildcard" && prevSeed !== settings.wildcardSeed))
    ) {
      void this.changeTrack(settings.trackId);
    }
    for (const c of this.cars) {
      if (c.tag) c.tag.visible = settings.showNameTags && c !== this.player;
    }
    this.cameraMode = settings.cameraMode;
    this.audio.setVolumes(settings.masterVolume, settings.musicVolume, settings.muted);
    if (this.racingLine && prevLine !== settings.showRacingLine) {
      this.racingLine.visible = settings.showRacingLine;
    }
    if (prevQuality !== settings.quality) this.applyQuality(settings.quality);
  }

  /** Put the player back on the racing surface, facing the right way. */
  respawn() {
    const p = this.player;
    if (!p || this.state !== "racing") return;
    const M = this.track.count;
    const idx = (p.physics.trackIndex - 6 + M) % M;
    this.track.offsetPoint(idx, 0, this.tmpV);
    const keepBoost = p.physics.boost;
    p.physics.place(this.tmpV.x, this.tmpV.z, this.track.yawAt(idx), this.terrain, this.track);
    p.physics.boost = keepBoost;
    p.lastIdx = p.physics.trackIndex;
    p.stuckTimer = 0;
    p.skidPrev = null;
    this.shake = 0.4;
    this.audio.noiseBurst(0.3, 0.2, 0.6, "lowpass", 700);
    useGameStore.getState().pushToast({ text: "Back on track", kind: "info" });
  }

  private handleAction(a: InputAction) {
    const store = useGameStore.getState();
    switch (a) {
      case "pause":
        if (this.state === "racing" || this.state === "countdown") this.pause();
        else if (this.state === "paused") this.resume();
        break;
      case "back":
        if (this.state === "finished") this.quitToMenu();
        break;
      case "respawn":
        if (this.state === "racing") this.respawn();
        break;
      case "restart":
        if (this.state === "paused" || this.state === "finished") this.restart();
        break;
      case "confirm":
        if (this.state === "menu") this.startRace(store.settings);
        else if (this.state === "finished") this.restart();
        else if (this.state === "paused") this.resume();
        break;
      case "camera": {
        this.cameraMode = (this.cameraMode + 1) % 3;
        store.setSettings({ cameraMode: this.cameraMode });
        this.settings = useGameStore.getState().settings;
        break;
      }
      case "mute": {
        const m = !store.settings.muted;
        store.setSettings({ muted: m });
        this.settings = useGameStore.getState().settings;
        this.audio.setVolumes(this.settings.masterVolume, this.settings.musicVolume, m);
        break;
      }
    }
  }

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.bloomPass?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private onVisibility = () => {
    if (document.hidden) {
      if (this.state === "racing" || this.state === "countdown") this.pause();
      this.audio.suspend();
    } else if (this.state !== "paused") {
      this.audio.resume();
    }
  };

  private onWindowBlur = () => {
    if (this.state === "racing") this.pause();
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.raf);
    useGameStore
      .getState()
      .setFatal(
        "The graphics context was lost. This usually means the GPU driver reset — reload to continue.",
      );
  };

  private onContextRestored = () => {
    useGameStore.getState().setFatal(null);
    this.clock.getDelta();
    this.loop();
  };

  // ---------------------------------------------------------------- main loop

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = this.clock.getDelta();
    if (dt > 0.05) dt = 0.05;
    this.time += dt;
    this.update(dt);
    this.composer.render();
    this.updateAdaptive(dt);
  };

  private update(dt: number) {
    this.clouds.update(dt);
    this.sky.position.copy(this.camera.position);
    this.skid.update(dt);
    this.precip.update(dt, this.camera.position);
    const grip = this.weather.grip;
    for (const c of this.cars) c.physics.conditionGrip = grip;

    if (this.state === "menu") {
      for (const c of this.cars) if (c.tag) c.tag.visible = false;
      this.updateMenuCamera(dt);
      this.updateSun(this.camLook);
      this.updateListener();
      return;
    }
    if (this.state === "paused") return;

    if (this.state === "countdown") {
      this.countdownTimer -= dt;
      const num = Math.ceil(this.countdownTimer);
      if (num !== this.lastCountdownNumber) {
        this.lastCountdownNumber = num;
        if (num >= 1 && num <= 3) {
          this.audio.countdownTick();
          this.gantry?.setLights(num);
          useGameStore.getState().setHud({ countdown: num });
        }
      }
      const inp = this.input.read(dt, {
        sensitivity: this.settings.steerSensitivity,
        tilt: this.settings.touchSteer === "tilt",
      });
      // Launch control: feather the throttle into the green band before GO.
      const rev = inp.throttle > 0.05 ? inp.throttle : -0.7;
      this.launchRevs = clamp(this.launchRevs + rev * dt * 0.85, 0, 1);
      this.audio.updateEngine(
        0,
        this.launchRevs * 14,
        Math.max(inp.throttle, this.launchRevs * 0.8),
        dt,
        true,
      );
      this.audio.updateAmbience(0, 0, false, true);
      this.hudAcc += dt;
      if (this.hudAcc > 0.06) {
        this.hudAcc = 0;
        useGameStore.getState().setHud({ revs: this.launchRevs });
      }
      if (this.countdownTimer <= 0) {
        this.resolveLaunch();
        this.state = "racing";
        this.raceTime = 0;
        this.goTimer = 1.1;
        useGameStore.getState().setScreen("racing");
        useGameStore.getState().setHud({ countdown: 0 });
        this.gantry?.setLights(0);
        this.audio.countdownGo();
        this.audio.setMusicIntensity(0.85);
        this.input.rumble(0.5, 220);
      }
      this.updateChaseCamera(dt, false);
      this.updateSun(this.player!.physics.pos);
      this.updateListener();
      return;
    }

    // racing or finished
    if (this.state === "racing") this.raceTime += dt;
    if (this.goTimer > 0) {
      this.goTimer -= dt;
      if (this.goTimer <= 0) {
        useGameStore.getState().setHud({ countdown: -1 });
        this.gantry?.setLights(-1);
      }
    }
    this.stepSimulation(dt);
    this.updateProgress(dt);
    this.updateEffects(dt);
    this.updateGhost(dt);

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
    this.updateListener();

    // audio
    const p = this.player!.physics;
    const skid = p.onTrack ? Math.max(0, Math.abs(p.speedR) - 6) * 0.035 : 0;
    const eng = this.audio.updateEngine(0, p.speedF, this.playerInput.throttle, dt, true, p.boosting);
    this.audio.updateAmbience(p.speedF, skid, p.boosting, true);
    for (let i = 0, v = 1; i < this.cars.length; i++) {
      const e = this.cars[i];
      if (e === this.player) continue;
      this.audio.updateEngine(v, e.physics.speedF, e.input.throttle, dt, true, e.physics.boosting);
      this.audio.setEnginePosition(v, e.physics.pos.x, e.physics.pos.y + 0.6, e.physics.pos.z);
      v++;
    }
    const pace = clamp(Math.abs(p.speedF) / 45, 0, 1);
    this.audio.setMusicIntensity(0.45 + pace * 0.55);

    this.hudAcc += dt;
    if (this.hudAcc > 0.06) {
      this.hudAcc = 0;
      this.pushHud(eng.gear, eng.rpm);
      this.drawMinimap();
    }
  }

  /** Grades the player's start and gives everyone a launch off the line. */
  private resolveLaunch() {
    if (this.launchDone) return;
    this.launchDone = true;
    const p = this.player!;
    const r = this.launchRevs;
    const store = useGameStore.getState();
    let rating = "";
    if (r > 0.92) {
      // Lift before the lights go out — too many revs just lights up the tyres.
      p.physics.applyBog(0.7);
      rating = "Wheelspin";
      this.audio.badChime();
    } else if (r >= 0.5) {
      const quality = clamp(1 - Math.abs(r - 0.74) / 0.24, 0.3, 1);
      p.physics.applyLaunch(quality);
      rating = quality > 0.8 ? "Perfect launch" : "Good launch";
      if (quality > 0.8) this.audio.boostPickup();
      this.input.rumble(0.4 + quality * 0.4, 200);
    } else if (r > 0.18) {
      p.physics.applyLaunch(0.3);
      rating = "Slow away";
    } else {
      rating = "Asleep";
      this.audio.badChime();
    }
    store.setHud({ launchRating: rating, revs: 0 });
    store.pushToast({ text: rating, kind: r > 0.9 || r <= 0.18 ? "bad" : "good" });
    window.setTimeout(() => {
      const st = useGameStore.getState();
      if (st.hud.launchRating === rating) st.setHud({ launchRating: "" });
    }, 1800);

    // Rivals get their own, difficulty-scaled starts.
    const diff = DIFFICULTIES[this.settings.difficulty];
    for (const e of this.cars) {
      if (!e.ai) continue;
      const q = clamp(diff.aggression * 0.6 + Math.random() * 0.5, 0, 1);
      if (q < 0.18) e.physics.applyBog(0.6);
      else e.physics.applyLaunch(q);
    }
  }

  /**
   * Slipstream: a car tucked in behind another within ~24 m gets a top-speed
   * and drag break, which keeps the pack together and makes passes possible.
   */
  private updateDraft(dt: number) {
    for (const e of this.cars) {
      const fwd = e.physics.forward(this.tmpV);
      let best = 0;
      for (const o of this.cars) {
        if (o === e) continue;
        const dx = o.physics.pos.x - e.physics.pos.x;
        const dz = o.physics.pos.z - e.physics.pos.z;
        const along = dx * fwd.x + dz * fwd.z;
        if (along < 2.5 || along > 24) continue;
        const lat = Math.abs(-dx * fwd.z + dz * fwd.x);
        if (lat > 3.4) continue;
        const oFwd = o.physics.forward(this.tmpV4);
        if (fwd.x * oFwd.x + fwd.z * oFwd.z < 0.55) continue;
        best = Math.max(best, (1 - (along - 2.5) / 21.5) * (1 - lat / 3.4));
      }
      const target = e.physics.speedF > 16 ? best : 0;
      e.physics.draft = damp(e.physics.draft, target, 3.5, dt);
    }
  }

  // ---------------------------------------------------------------- simulation

  private stepSimulation(dt: number) {
    const player = this.player!;
    if (this.state === "racing") {
      this.playerInput = this.input.read(dt, {
        sensitivity: this.settings.steerSensitivity,
        tilt: this.settings.touchSteer === "tilt",
      });
    } else {
      this.playerInput = { throttle: 0, brake: 0.35, steer: 0, handbrake: false, boost: false };
    }
    if (this.settings.invertSteer) this.playerInput = { ...this.playerInput, steer: -this.playerInput.steer };
    player.input = this.playerInput;
    this.updateDraft(dt);

    if (this.playerInput.boost && player.physics.boost > 0.02 && !this.wasBoosting) {
      this.audio.boostStart();
      this.input.rumble(0.35, 180);
    }
    this.wasBoosting = this.playerInput.boost && player.physics.boost > 0.02;

    this.incidentCooldown = Math.max(0, this.incidentCooldown - dt);
    const allPhysics = this.cars.map((c) => c.physics);
    const diff = DIFFICULTIES[this.settings.difficulty];
    // Rivals respect the conditions too: corner speed scales with the square
    // root of grip, which is what the physics actually gives them.
    const gripScale = Math.sqrt(this.weather.grip);
    for (const e of this.cars) {
      if (!e.ai) continue;
      // Weather scales the driver's own corner commitment, not the raw
      // difficulty value, so personalities survive a rain shower.
      e.ai.params.cornerGrip = e.ai.baseCornerGrip * gripScale;
      // Last lap: rivals stop managing the race and start racing it.
      const lastLap = e.crossings >= this.totalLaps && !e.finished;
      e.ai.params.boldness = Math.min(1, e.ai.baseBoldness * (lastLap ? 1.25 : 1));
      const gapUnits = (player.unwrapped - e.unwrapped) * this.track.spacing;
      e.ai.speedScale = player.finished ? 1 : 1 + clamp(gapUnits / 650, -0.05, 0.06) * diff.rubber;
      const prevMode = e.aiMode;
      e.input = e.ai.update(e.physics, allPhysics, dt, this.time, this.raceTime > 0.1);
      e.aiMode = e.ai.mode;
      // Call out rival incidents the player can actually see.
      if (
        e.aiMode === "mistake" &&
        prevMode !== "mistake" &&
        this.incidentCooldown <= 0 &&
        this.state === "racing" &&
        e.physics.pos.distanceTo(player.physics.pos) < 70
      ) {
        this.incidentCooldown = 4;
        useGameStore
          .getState()
          .pushToast({ text: `${e.name} runs wide`, kind: "good" });
      }
      // keep rivals topped up so they can actually use boost
      if (this.raceTime > 0.1) {
        const rate = 0.04 + e.ai.params.boostUse * 0.035;
        e.physics.boost = Math.min(1, e.physics.boost + dt * rate);
      }
    }

    // Collision resolution must run *inside* the substep loop: at 200 km/h a
    // single frame covers ~3 m, which is enough to tunnel through a cactus.
    const sub = 2;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (const e of this.cars) e.physics.step(e.input, h, this.terrain, this.track);
      this.resolveCollisions();
    }
    for (const e of this.cars) {
      e.physics.syncVisual(e.visual, this.time);
      if (e.physics.landingImpact > 3) this.onLanding(e);
      if (e === player && e.physics.chargeBanked > 0) this.audio.boostPickup();
    }

    // stuck detection for the player
    if (this.state === "racing") {
      const p = player.physics;
      if (Math.abs(p.speedF) < 1.6 && this.raceTime > 1.5) player.stuckTimer += dt;
      else player.stuckTimer = Math.max(0, player.stuckTimer - dt * 2);
      if (player.stuckTimer > 6) {
        player.stuckTimer = 0;
        this.respawn();
      }
    }
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
      // Airborne cars fly over scenery instead of clipping it.
      if (!p.grounded && p.pos.y - this.terrain.getHeight(p.pos.x, p.pos.z) > 1.8) continue;
      const near = this.colliders.query(p.pos.x, p.pos.z, this.colBuf);
      for (const c of near) {
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
        if (Math.abs(a.pos.y - b.pos.y) > 2.2) continue;
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
        x + (Math.random() - 0.5),
        y + Math.random() * 0.6,
        z + (Math.random() - 0.5),
        (Math.random() - 0.5) * 6,
        1 + Math.random() * 4,
        (Math.random() - 0.5) * 6,
        0.5 + Math.random() * 0.6,
        0.5 + Math.random() * 0.6,
        2.2,
        0xc9a67a,
        0.5,
      );
    }
    const before = e.physics.damage;
    e.physics.addDamage(strength / 95);
    if (e === this.player) {
      if (before < 0.5 && e.physics.damage >= 0.5) {
        useGameStore.getState().pushToast({ text: "Bodywork damaged", kind: "bad" });
      }
      this.shake = Math.min(1, this.shake + clamp(strength / 18, 0.1, 0.7));
      this.audio.impact(strength);
      this.input.rumble(clamp(strength / 20, 0.15, 1), 160);
      // Losing a big chunk of speed eats your drift chain.
      if (strength > 8) {
        e.physics.driftTimer = 0;
        e.physics.driftMultiplier = 1;
      }
    }
  }

  private onLanding(e: CarEntity) {
    const p = e.physics;
    const s = p.landingImpact;
    for (let i = 0; i < Math.min(16, Math.floor(s)); i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit(
        p.pos.x + Math.cos(a) * 1.2,
        p.pos.y + 0.2,
        p.pos.z + Math.sin(a) * 1.2,
        Math.cos(a) * (1.5 + Math.random() * 2.5),
        0.5 + Math.random() * 1.2,
        Math.sin(a) * (1.5 + Math.random() * 2.5),
        0.7 + Math.random() * 0.7,
        0.9 + Math.random() * 0.8,
        2.4,
        0xd9bf92,
        0.4,
      );
    }
    if (e === this.player) {
      this.shake = Math.min(1, this.shake + clamp(s / 26, 0.08, 0.6));
      this.audio.landing(s);
      this.input.rumble(clamp(s / 26, 0.1, 0.8), 140);
    }
  }

  // ---------------------------------------------------------------- progress

  private updateProgress(dt: number) {
    const M = this.track.count;
    for (const e of this.cars) {
      let delta = e.physics.trackIndex - e.lastIdx;
      if (delta > M / 2) delta -= M;
      if (delta < -M / 2) delta += M;
      e.lastIdx = e.physics.trackIndex;
      e.unwrapped += delta;

      // --- sector gates (also act as anti-cut checkpoints)
      const inLap = ((e.unwrapped % M) + M) % M;
      const sector = this.track.sectorOf(inLap);
      if (!e.sectorsHit[sector] && e.physics.trackDist < this.track.halfWidth + 14) {
        // only credit a sector if the previous one was already collected
        const prev = (sector - 1 + SECTOR_COUNT) % SECTOR_COUNT;
        if (sector === 0 || e.sectorsHit[prev]) {
          e.sectorsHit[sector] = true;
          const now = this.raceTime;
          if (sector > 0) {
            e.sectorTimes[sector - 1] = now - e.sectorStart;
            if (e === this.player) this.onSectorComplete(sector - 1, e.sectorTimes[sector - 1]!);
          }
          e.sectorStart = now;
        }
      }
      if (e.physics.trackDist > 26) {
        e.offCourseTimer += dt;
        if (e.offCourseTimer > 2.2) e.lapValid = false;
      } else {
        e.offCourseTimer = Math.max(0, e.offCourseTimer - dt * 0.5);
      }

      // --- split recording for the live delta
      if (e === this.player && this.state === "racing") {
        const bucket = Math.floor((inLap / M) * SPLIT_BUCKETS);
        if (bucket !== this.lastSplitBucket && bucket >= 0 && bucket < SPLIT_BUCKETS) {
          this.lastSplitBucket = bucket;
          this.curSplits[bucket] = this.raceTime - e.lapStart;
        }
      }

      const crossings = Math.floor(e.unwrapped / M) + 1;
      if (crossings > e.crossings) {
        if (e.crossings >= 1) this.onLapComplete(e, crossings);
        e.lapStart = this.raceTime;
        e.crossings = crossings;
        e.sectorsHit.fill(false);
        e.sectorsHit[0] = true;
        e.sectorStart = this.raceTime;
        e.sectorTimes.fill(null);
        e.lapValid = true;
        e.offCourseTimer = 0;
        if (e === this.player) {
          this.curSplits.fill(0);
          this.lastSplitBucket = -1;
          this.ghostRec.reset();
          this.ghostPlayer?.reset();
        }
        if (e.crossings >= this.totalLaps + 1 && !e.finished) {
          e.finished = true;
          e.finishTime = this.raceTime;
          if (e === this.player) this.onPlayerFinish();
        }
      } else if (crossings < e.crossings) {
        // reversed back over the line
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

    // position-change callouts
    if (this.state === "racing" && this.cars.length > 1) {
      const order = this.ranking();
      const pos = order.indexOf(this.player!) + 1;
      if (this.lastPosition && pos !== this.lastPosition && this.raceTime > 1) {
        const store = useGameStore.getState();
        if (pos < this.lastPosition) {
          store.pushToast({
            text: `P${pos}`,
            sub: pos === 1 ? "You're leading" : "Overtake",
            kind: "good",
          });
        } else {
          store.pushToast({ text: `P${pos}`, sub: "Lost a place", kind: "bad" });
        }
      }
      this.lastPosition = pos;
    }
  }

  private onSectorComplete(sector: number, time: number) {
    const store = useGameStore.getState();
    const rec = store.recordFor(this.settings.trackId);
    const best = rec.bestSectors?.[sector] ?? null;
    const delta = best === null ? null : time - best;
    store.setHud({ sectorFlash: { index: sector, delta, at: performance.now() } });
  }

  private onLapComplete(e: CarEntity, newCrossings: number) {
    const lapTime = this.raceTime - e.lapStart;
    const lastSector = SECTOR_COUNT - 1;
    e.sectorTimes[lastSector] = this.raceTime - e.sectorStart;
    const allSectors = e.sectorsHit.every(Boolean);
    const valid = e.lapValid && allSectors;

    if (e !== this.player) {
      if (valid) e.lapTimes.push(lapTime);
      return;
    }

    const store = useGameStore.getState();
    if (!valid) {
      store.pushToast({ text: "Lap invalidated", sub: "You missed a checkpoint", kind: "bad" });
      this.audio.badChime();
      return;
    }
    e.lapTimes.push(lapTime);
    for (let i = 0; i < SECTOR_COUNT; i++) {
      const s = e.sectorTimes[i];
      if (s === null) continue;
      const cur = e.bestSectors[i];
      if (cur === null || s < cur) e.bestSectors[i] = s;
    }
    this.audio.lapChime();

    const isSessionBest = this.sessionBestLap === null || lapTime < this.sessionBestLap;
    if (isSessionBest) {
      this.sessionBestLap = lapTime;
      this.bestSplits = Float32Array.from(this.curSplits);
      this.pendingGhost = this.ghostRec.finish();
    }
    const rec = store.recordFor(this.settings.trackId);
    if (rec.bestLap === null || lapTime < rec.bestLap) {
      store.pushToast({ text: "New lap record", sub: formatClock(lapTime), kind: "good" });
      this.audio.recordChime();
    } else if (isSessionBest) {
      store.pushToast({ text: "Session best lap", sub: formatClock(lapTime), kind: "good" });
    }
    if (newCrossings === this.totalLaps) {
      store.pushToast({ text: "Final lap", kind: "info" });
    }
  }

  private onPlayerFinish() {
    this.state = "finished";
    this.input.captureKeys = false;
    this.finishDelay = 2.4;
    this.audio.finishFanfare();
    this.audio.setMusicIntensity(0.35);
    this.input.rumble(0.6, 400);
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

  /**
   * Rivals that haven't crossed the line yet get an honest projected time
   * instead of a bogus DNF.
   */
  private projectedTime(e: CarEntity): { time: number | null; provisional: boolean } {
    if (e.finishTime !== null) return { time: e.finishTime, provisional: false };
    const M = this.track.count;
    const target = this.totalLaps * M;
    const remaining = Math.max(0, target - e.unwrapped) * this.track.spacing;
    const covered = Math.max(1, e.unwrapped) * this.track.spacing;
    const avg = this.raceTime > 1 ? covered / this.raceTime : 30;
    if (!isFinite(avg) || avg <= 1) return { time: null, provisional: true };
    return { time: this.raceTime + remaining / avg, provisional: true };
  }

  private publishResults() {
    const player = this.player!;
    const order = this.ranking();
    const position = order.indexOf(player) + 1;
    const total = player.finishTime ?? this.raceTime;
    const bestLap = player.lapTimes.length ? Math.min(...player.lapTimes) : null;
    const store = useGameStore.getState();
    const key = raceKey(
      this.settings.difficulty,
      this.totalLaps,
      this.settings.mode,
      this.settings.carClassId,
    );
    const beaten = store.commitRecords(this.settings.trackId, key, total, bestLap, player.bestSectors);

    if (this.pendingGhost && bestLap !== null) {
      const prev = this.ghostBestTime;
      if (prev === null || bestLap < prev) {
        saveGhost({
          trackId: this.settings.trackId,
          carClassId: this.settings.carClassId,
          lapTime: bestLap,
          data: this.pendingGhost,
        });
        this.ghostBestTime = bestLap;
      }
    }

    let standings: StandingRow[] = [];
    let seasonRace: { index: number; total: number } | null = null;
    let seasonDone = false;
    if (this.settings.mode === "championship" && store.season) {
      seasonRace = { index: store.season.raceIndex + 1, total: store.season.trackIds.length };
      standings = store.scoreSeason(
        order.map((c) => ({ name: c.name, color: c.color, isPlayer: c === player })),
      );
      seasonDone = useGameStore.getState().season?.done ?? false;
    }

    const seasonWon = seasonDone && standings.length > 0 && standings[0].isPlayer;
    const credits = computePayout({
      mode: this.settings.mode,
      position,
      carCount: this.cars.length,
      laps: player.lapTimes.length,
      difficulty: this.settings.difficulty,
      weather: this.weather.id,
      cleanRace: player.lapTimes.length >= this.totalLaps,
      driftScore: player.physics.driftScore,
      airTime: player.physics.totalAirTime,
      newLapRecord: beaten.lap,
      newRaceRecord: beaten.race,
      seasonFinished: seasonDone,
      seasonWon,
    });

    const results: RaceResults = {
      position,
      standings,
      seasonRace,
      seasonDone,
      credits,
      weather: this.weather.id,
      totalTime: total,
      lapTimes: [...player.lapTimes],
      bestLap,
      isRecordLap: beaten.lap,
      isRecordRace: beaten.race,
      bestSectors: [...player.bestSectors],
      topSpeed: player.physics.topSpeedSeen * 3.6,
      driftScore: Math.round(player.physics.driftScore),
      airTime: player.physics.totalAirTime,
      cleanRace: player.lapTimes.length >= this.totalLaps,
      mode: this.settings.mode,
      trackId: this.settings.trackId,
      cars: order.map((c) => {
        const proj = this.projectedTime(c);
        return {
          name: c.name,
          color: c.color,
          time: proj.time,
          isPlayer: c === player,
          bestLap: c.lapTimes.length ? Math.min(...c.lapTimes) : null,
          provisional: proj.provisional,
        };
      }),
    };
    store.setResults(results);
    if (beaten.race || beaten.lap) this.audio.recordChime();
    if (results.credits && results.credits.total > 0) {
      store.awardCredits(results.credits.total, {
        won: position === 1 && this.settings.mode !== "timetrial",
      });
    }
  }

  // ---------------------------------------------------------------- ghost

  private updateGhost(dt: number) {
    const gv = this.ghostVisual;
    if (!gv) return;
    const player = this.player!;
    // Always record — the ghost of this lap may become the new best even when
    // playback is switched off.
    if (this.state === "racing") {
      this.ghostRec.sample(dt, player.physics.pos, player.physics.yaw, player.physics.roll);
    }
    const show = this.settings.showGhost && !!this.ghostPlayer?.valid && this.state === "racing";
    if (!show) {
      gv.root.visible = false;
      return;
    }
    const lapT = this.raceTime - player.lapStart;
    const pose = this.ghostPlayer!.poseAt(lapT, this.tmpV4);
    if (!pose) {
      gv.root.visible = false;
      return;
    }
    gv.root.visible = true;
    gv.root.position.copy(this.tmpV4);
    gv.root.position.y += 0.08;
    gv.root.quaternion.setFromEuler(GHOST_EULER.set(0, pose.yaw, 0));
    gv.body.rotation.set(0, 0, pose.roll);
  }

  // ---------------------------------------------------------------- effects

  private updateEffects(dt: number) {
    const fwd = this.tmpV;
    const rgt = this.tmpV2;
    for (const e of this.cars) {
      const p = e.physics;
      const sp = Math.abs(p.speedF);
      const slip = Math.abs(p.speedR);
      p.forward(fwd);
      p.right(rgt);

      // --- dust
      let rate = 0;
      if (p.grounded) {
        if (sp > 2.5) rate += (p.onTrack ? 9 : 48) * clamp(sp / 28, 0, 1);
        if (slip > 2.5) rate += slip * 12;
        if (e.input.throttle > 0.5 && sp < 18 && sp > 0.3) rate += 26;
        if (e.input.handbrake && sp > 6) rate += 20;
        if (p.boosting) rate += 24;
      }
      // Wet tarmac throws spray, not dust.
      const wetness = this.weather.id === "rain" ? 1 : 0;
      if (wetness > 0) rate *= p.onTrack ? 0.55 : 0.75;
      if (wetness > 0 && p.grounded && sp > 6) {
        e.sprayAcc += sp * 1.6 * dt;
        while (e.sprayAcc >= 1) {
          e.sprayAcc -= 1;
          const side = Math.random() < 0.5 ? -0.95 : 0.95;
          this.particles.emit(
            p.pos.x - fwd.x * 1.7 + rgt.x * side,
            p.pos.y + 0.22,
            p.pos.z - fwd.z * 1.7 + rgt.z * side,
            -fwd.x * (2 + sp * 0.12) + (Math.random() - 0.5) * 1.2,
            0.5 + Math.random() * 1.1,
            -fwd.z * (2 + sp * 0.12) + (Math.random() - 0.5) * 1.2,
            0.22 + Math.random() * 0.3,
            0.5 + Math.random() * 0.5,
            0.9,
            0xdfe9f2,
            0.33,
          );
        }
      }
      e.dustAcc += rate * dt;
      if (e.dustAcc >= 1) {
        const color = p.onTrack ? 0xb08c66 : 0xd9bf92;
        let budget = 24;
        while (e.dustAcc >= 1 && budget-- > 0) {
          e.dustAcc -= 1;
          const side = Math.random() < 0.5 ? -0.9 : 0.9;
          const x = p.pos.x - fwd.x * 1.5 + rgt.x * side;
          const z = p.pos.z - fwd.z * 1.5 + rgt.z * side;
          const y = p.pos.y + 0.25;
          this.particles.emit(
            x,
            y,
            z,
            -fwd.x * (1.5 + sp * 0.06) + (Math.random() - 0.5) * 1.6 - p.vel.x * 0.05,
            0.7 + Math.random() * 1.5,
            -fwd.z * (1.5 + sp * 0.06) + (Math.random() - 0.5) * 1.6 - p.vel.z * 0.05,
            0.7 + Math.random() * 0.9,
            0.8 + Math.random() * 0.8,
            2.0,
            color,
            p.onTrack ? 0.28 : 0.4,
          );
        }
        if (budget <= 0) e.dustAcc = 0;
      }

      // --- damage smoke
      if (p.damage > 0.45 && sp > 3) {
        e.smokeAcc += (p.damage - 0.45) * 26 * dt;
        while (e.smokeAcc >= 1) {
          e.smokeAcc -= 1;
          this.particles.emit(
            p.pos.x + fwd.x * 1.4 + (Math.random() - 0.5) * 0.6,
            p.pos.y + 1.1,
            p.pos.z + fwd.z * 1.4 + (Math.random() - 0.5) * 0.6,
            -fwd.x * 2 + (Math.random() - 0.5) * 1.2,
            1.6 + Math.random() * 1.4,
            -fwd.z * 2 + (Math.random() - 0.5) * 1.2,
            0.5 + Math.random() * 0.5,
            1.3 + Math.random() * 0.9,
            1.8,
            0x3a3330,
            0.45,
          );
        }
      }

      // --- rumble strips: rattle the car and the audio
      if (p.rumble > 0 && sp > 8) {
        e.rattle -= dt;
        if (e.rattle <= 0) {
          e.rattle = 0.09;
          if (e === this.player) {
            this.shake = Math.min(0.55, this.shake + 0.1 + sp * 0.002);
            this.audio.noiseBurst(0.07, clamp(sp / 300, 0.03, 0.12), 1.4, "highpass", 900);
            this.input.rumble(0.18, 70);
          }
        }
      } else {
        e.rattle = 0;
      }

      // --- name plates
      if (e.tag) {
        const show = this.settings.showNameTags && this.state !== "menu";
        const d = this.camera.position.distanceTo(p.pos);
        e.tag.visible = show && d < 110;
        if (e.tag.visible) {
          const k = clamp(d / 40, 0.75, 2.6);
          e.tag.scale.set(4.2 * k, 1.05 * k, 1);
          e.tag.position.y = 2.6 + k * 0.25;
          (e.tag.material as THREE.SpriteMaterial).opacity = clamp((110 - d) / 30, 0.1, 0.85);
        }
      }

      // --- boost sparks
      if (p.boosting && Math.random() < 0.8) {
        this.particles.emit(
          p.pos.x - fwd.x * 2.6,
          p.pos.y + 0.45,
          p.pos.z - fwd.z * 2.6,
          -fwd.x * 6 + (Math.random() - 0.5) * 2,
          0.6 + Math.random(),
          -fwd.z * 6 + (Math.random() - 0.5) * 2,
          0.32,
          0.35,
          1.4,
          0xffb257,
          0.7,
          -0.4,
        );
      }

      // --- skid marks
      if (this.skid.enabled && p.grounded) {
        const hard = slip > 5 || (p.braking && sp > 14) || (e.input.handbrake && sp > 6);
        if (hard) {
          const strength = clamp(Math.max(slip / 14, p.braking ? 0.5 : 0) + (p.onTrack ? 0 : -0.25), 0.15, 1);
          const marks: { x: number; y: number; z: number }[] = [];
          for (const side of [-0.88, 0.88]) {
            marks.push({
              x: p.pos.x - fwd.x * 1.38 + rgt.x * side,
              y: p.pos.y + 0.06,
              z: p.pos.z - fwd.z * 1.38 + rgt.z * side,
            });
          }
          if (e.skidPrev) {
            for (let i = 0; i < 2; i++) {
              const a = e.skidPrev[i];
              const b = marks[i];
              const dx = b.x - a.x;
              const dz = b.z - a.z;
              if (dx * dx + dz * dz > 0.02) {
                this.skid.addSegment(a.x, a.y, a.z, b.x, b.y, b.z, rgt.x, rgt.z, 0.19, strength);
              }
            }
          }
          e.skidPrev = marks;
        } else {
          e.skidPrev = null;
        }
      } else {
        e.skidPrev = null;
      }
    }
    this.particles.update(dt);
  }

  private updateSun(focus: THREE.Vector3) {
    this.sun.position.copy(focus).addScaledVector(SUN_DIR, 150);
    this.sun.target.position.copy(focus);
  }

  private updateListener() {
    if (!this.audio.ready) return;
    const c = this.camera;
    c.getWorldDirection(this.tmpV3);
    this.audio.setListener(
      c.position.x,
      c.position.y,
      c.position.z,
      this.tmpV3.x,
      this.tmpV3.y,
      this.tmpV3.z,
      c.up.x,
      c.up.y,
      c.up.z,
    );
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
    const back = this.input.lookBack;
    const kF = snap ? 1 : 1 - Math.exp(-3.5 * dt);
    this.camFwd.lerp(fwd, kF).normalize();
    const dir = back ? -1 : 1;
    const cf = CAM_FWD.copy(this.camFwd).multiplyScalar(dir);
    const speedFrac = clamp(Math.abs(p.speedF) / p.tuning.topSpeed, 0, 1);
    const mode = this.cameraMode;
    const desired = this.tmpV3;
    let lookAhead: number;
    let rate: number;
    if (mode === 2 && !back) {
      desired.set(p.pos.x + fwd.x * 0.6, p.pos.y + 1.62, p.pos.z + fwd.z * 0.6);
      lookAhead = 24;
      rate = 40;
    } else if (mode === 1) {
      const dist = 11.5 + speedFrac * 1.5;
      desired.set(p.pos.x - cf.x * dist, p.pos.y + 5.4, p.pos.z - cf.z * dist);
      lookAhead = 8;
      rate = 5;
    } else {
      const dist = 7.4 + speedFrac * 2.0;
      desired.set(p.pos.x - cf.x * dist, p.pos.y + 2.9 + speedFrac * 0.3, p.pos.z - cf.z * dist);
      lookAhead = 5.5;
      rate = 5.5;
    }
    if (mode !== 2 || back) {
      const ground = this.terrain.getHeight(desired.x, desired.z) + 1.0;
      if (desired.y < ground) desired.y = ground;
    }
    const k = snap || back !== this.wasLookingBack ? 1 : 1 - Math.exp(-rate * dt);
    this.wasLookingBack = back;
    this.camPos.lerp(desired, k);
    const steerLook = this.playerInput.steer * 1.4 * speedFrac * (back ? -1 : 1);
    const lookTarget = this.tmpV3.set(
      p.pos.x + cf.x * lookAhead + rgt.x * steerLook,
      p.pos.y + (mode === 2 ? 1.3 : 1.1),
      p.pos.z + cf.z * lookAhead + rgt.z * steerLook,
    );
    const kl = snap ? 1 : 1 - Math.exp(-9 * dt);
    this.camLook.lerp(lookTarget, kl);

    const reduced = this.settings.reducedMotion;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const sh = reduced ? 0 : this.shake * this.shake * 0.35;
    this.camera.position.set(
      this.camPos.x + (Math.random() - 0.5) * sh,
      this.camPos.y + (Math.random() - 0.5) * sh,
      this.camPos.z + (Math.random() - 0.5) * sh,
    );
    this.camera.lookAt(this.camLook);

    const boostKick = p.boosting ? 9 : 0;
    this.fovKick = damp(this.fovKick, boostKick, 6, dt);
    const airKick = p.grounded ? 0 : 3;
    const targetFov =
      (mode === 2 ? 70 : 62) + this.settings.fovOffset + speedFrac * 14 + this.fovKick + airKick;
    this.fov = snap ? targetFov : damp(this.fov, targetFov, 3, dt);
    this.camera.fov = reduced ? lerp(this.fov, mode === 2 ? 70 : 64, 0.6) : this.fov;
    this.camera.updateProjectionMatrix();
  }

  private wasLookingBack = false;

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

  private pushHud(gear: number, rpm: number) {
    const player = this.player!;
    const p = player.physics;
    const order = this.ranking();
    const idx = order.indexOf(player);
    const sp = Math.max(Math.abs(p.speedF), 8);
    let gapAhead: number | null = null;
    let gapBehind: number | null = null;
    if (idx > 0) gapAhead = ((order[idx - 1].unwrapped - player.unwrapped) * this.track.spacing) / sp;
    if (idx < order.length - 1) {
      gapBehind = ((player.unwrapped - order[idx + 1].unwrapped) * this.track.spacing) / sp;
    }

    const M = this.track.count;
    const inLap = ((player.unwrapped % M) + M) % M;
    let delta: number | null = null;
    if (this.bestSplits && this.state === "racing") {
      const f = (inLap / M) * SPLIT_BUCKETS;
      const i0 = Math.min(SPLIT_BUCKETS - 1, Math.max(0, Math.floor(f)));
      const ref = this.bestSplits[i0];
      if (ref > 0) delta = this.raceTime - player.lapStart - ref;
    }

    const rivalAhead = idx > 0 ? order[idx - 1].name : null;
    const rivalBehind = idx < order.length - 1 ? order[idx + 1].name : null;
    // "Battle" = someone is close enough that the next corner decides it.
    const battle =
      this.state === "racing" &&
      !player.finished &&
      ((gapAhead !== null && gapAhead < 1.1) || (gapBehind !== null && gapBehind < 1.1));

    // Live timing tower: gap to the leader for every car on track.
    const leader = order[0];
    const orderRows = order.map((e) => {
      const behind = (leader.unwrapped - e.unwrapped) * this.track.spacing;
      const ref = Math.max(Math.abs(e.physics.speedF), 12);
      return {
        name: e.name,
        color: e.color,
        isPlayer: e === player,
        gap: e === leader ? 0 : behind / ref,
        lap: clamp(e.crossings, 1, this.totalLaps),
        finished: e.finished,
      };
    });

    const lap = clamp(player.crossings, 1, this.totalLaps);
    const store = useGameStore.getState();
    store.setHud({
      speed: Math.abs(p.speedF) * 3.6,
      gear: p.speedF < -0.5 ? 0 : gear,
      rpm,
      lap,
      totalLaps: this.totalLaps,
      position: idx + 1,
      carCount: this.cars.length,
      time: player.finished ? (player.finishTime ?? this.raceTime) : this.raceTime,
      lapTimes: [...player.lapTimes],
      bestLap: store.recordFor(this.settings.trackId).bestLap,
      sessionBestLap: this.sessionBestLap,
      wrongWay: this.wrongTimer > 1.0 && this.state === "racing",
      finalLap: player.crossings === this.totalLaps && !player.finished,
      offTrack: !p.onTrack,
      drifting: Math.abs(p.speedR) > 6,
      airborne: !p.grounded && p.airTime > 0.25,
      currentLapTime: this.raceTime - player.lapStart,
      gapAhead,
      gapBehind,
      boost: p.boost,
      boosting: p.boosting,
      driftCombo: p.driftCharge,
      driftScore: Math.round(p.driftScore),
      lapInvalid: !player.lapValid,
      stuck: player.stuckTimer > 2.5,
      delta,
      sectorIndex: this.track.sectorOf(inLap),
      draft: p.draft,
      damage: p.damage,
      conditions: this.weather.id === "clear" ? "" : this.weather.name,
      lowGrip: this.weather.grip < 0.95,
      rivalAhead,
      rivalBehind,
      battle,
      order: orderRows,
      revs: 0,
      surface: p.surface,
    });
  }

  private drawMinimap() {
    const canvas = this.minimap;
    if (!canvas) return;
    if (!this.minimapBounds) {
      this.minimapBounds = computeMinimapBounds(this.track, canvas.width, canvas.height);
    }
    this.minimapScene.track = this.track;
    this.minimapScene.cars = this.cars;
    this.minimapScene.player = this.player;
    const gv = this.ghostVisual;
    this.minimapScene.ghost = gv?.root.visible ? { x: gv.root.position.x, z: gv.root.position.z } : null;
    drawMinimap(canvas, this.minimapScene, this.minimapBounds);
  }

  // ---------------------------------------------------------------- teardown

  dispose() {
    this.precip.dispose();
    this.gantry?.dispose();
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("blur", this.onWindowBlur);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost as EventListener);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored as EventListener);
    this.input.dispose();
    this.audio.dispose();
    this.scene?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints) {
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) mat?.dispose();
      }
    });
    this.composer?.dispose();
    this.renderer?.dispose();
    if (gameHolder.game === this) gameHolder.game = null;
  }
}

const SPLIT_BUCKETS = 64;
const GHOST_EULER = new THREE.Euler();
const CAM_FWD = new THREE.Vector3();

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const inst = o as THREE.InstancedMesh;
    if (inst.isInstancedMesh) inst.dispose();
    const m = o as THREE.Mesh;
    if (m.isMesh || (o as THREE.Points).isPoints) {
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) mat?.dispose();
    }
  });
}

function formatClock(t: number): string {
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

/**
 * Blends a difficulty envelope with a driver personality.
 *
 * The difficulty remains the dominant term — Rookie rivals are slow whoever is
 * driving — but each trait shifts the driver inside that envelope so the field
 * spreads out naturally over a race.
 */
export function aiParamsFor(diff: DifficultyDef, d: DriverDef): AIParams {
  const centred = (v: number) => v - 0.8; // traits cluster around 0.8
  return {
    topSpeed: MAX_SPEED * diff.topSpeedFactor * (1 + centred(d.pace) * 0.1),
    cornerGrip: diff.cornerGrip * (1 + centred(d.pace) * 0.06 + centred(d.racecraft) * 0.03),
    lookahead: diff.lookahead * (1 + centred(d.racecraft) * 0.25),
    aggression: Math.min(1, diff.aggression * (0.95 + d.pace * 0.1)),
    boldness: Math.min(1, 0.25 + d.aggression * 0.75),
    boostUse: Math.min(1, diff.boostUse * (0.6 + d.boost * 0.8)),
    sloppiness: diff.sloppiness * (1.6 - d.consistency),
    racecraft: d.racecraft,
    wetSkill: d.wet,
  };
}
