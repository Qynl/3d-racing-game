import { mulberry32 } from "./noise";

/**
 * Static game configuration: tracks, car classes, graphics presets.
 * Everything here is data — no three.js, no DOM — so it is cheap to import
 * from the UI layer and trivially unit-testable.
 */

// ---------------------------------------------------------------- tracks

export interface TrackDef {
  id: string;
  name: string;
  subtitle: string;
  /** Control-point radii (metres) walked around a circle — defines the shape. */
  radii: number[];
  /** Deterministic jitter seed. */
  seed: number;
  /** Width of the racing surface (half-width, metres). */
  halfWidth: number;
  /** Ellipse squash applied to x/z so circuits aren't perfect circles. */
  stretch: [number, number];
  /** Rough difficulty hint shown in the menu. */
  grade: "flowing" | "technical" | "brutal";
}

export const TRACKS: TrackDef[] = [
  {
    id: "sundown",
    name: "Sundown Loop",
    subtitle: "Long straights, two hairpins",
    radii: [152, 164, 150, 118, 96, 110, 152, 170, 162, 134, 104, 128, 158, 174, 164, 152],
    seed: 7,
    halfWidth: 7.2,
    stretch: [1.1, 0.94],
    grade: "flowing",
  },
  {
    id: "mesa",
    name: "Mesa Switchback",
    subtitle: "Tight, rhythmic, unforgiving",
    radii: [120, 164, 104, 150, 96, 142, 108, 158, 112, 150, 98, 136, 118, 160, 102, 146],
    seed: 2029,
    halfWidth: 6.6,
    stretch: [1.02, 1.06],
    grade: "technical",
  },
  {
    id: "dunes",
    name: "Dune Runner",
    subtitle: "Wide, fast, full of crests",
    radii: [186, 196, 178, 150, 164, 188, 200, 192, 170, 148, 162, 184, 198, 190, 172, 180],
    seed: 515,
    halfWidth: 8.4,
    stretch: [1.16, 0.88],
    grade: "flowing",
  },
  {
    id: "canyon",
    name: "Coyote Canyon",
    subtitle: "Three hairpins and no mercy",
    radii: [160, 92, 144, 86, 170, 150, 88, 132, 176, 96, 140, 84, 158, 148, 100, 168],
    seed: 8831,
    halfWidth: 6.9,
    stretch: [1.08, 0.98],
    grade: "brutal",
  },
];

export function trackById(id: string): TrackDef {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

// ---------------------------------------------------------------- car classes

export interface CarClassDef {
  id: string;
  name: string;
  blurb: string;
  /** Top speed in m/s. */
  topSpeed: number;
  /** Forward acceleration authority. */
  engine: number;
  /** Braking authority. */
  brake: number;
  /** Lateral grip recovery rate — higher sticks more, lower slides more. */
  grip: number;
  /** Steering rate (rad/s at reference speed). */
  steer: number;
  /** How much boost the tank holds, in seconds of full use. */
  boostTank: number;
  /** Extra push while boosting. */
  boostPower: number;
  /** 0..1 bars for the menu. */
  bars: { speed: number; accel: number; grip: number };
}

export const CAR_CLASSES: CarClassDef[] = [
  {
    id: "coyote",
    name: "Coyote 2.4",
    blurb: "Balanced rally weapon. Does everything well.",
    topSpeed: 56,
    engine: 21,
    brake: 40,
    grip: 9.0,
    steer: 2.7,
    boostTank: 2.6,
    boostPower: 15,
    bars: { speed: 0.7, accel: 0.7, grip: 0.7 },
  },
  {
    id: "jackrabbit",
    name: "Jackrabbit GT",
    blurb: "Light and darty. Huge grip, smaller top end.",
    topSpeed: 51,
    engine: 24.5,
    brake: 45,
    grip: 11.4,
    steer: 3.05,
    boostTank: 3.0,
    boostPower: 16.5,
    bars: { speed: 0.55, accel: 0.9, grip: 0.95 },
  },
  {
    id: "vulture",
    name: "Vulture V8",
    blurb: "Monster straight-line speed. Slides like a barge.",
    topSpeed: 63,
    engine: 19,
    brake: 36,
    grip: 7.2,
    steer: 2.45,
    boostTank: 2.2,
    boostPower: 19,
    bars: { speed: 1.0, accel: 0.55, grip: 0.4 },
  },
];

export function carClassById(id: string): CarClassDef {
  return CAR_CLASSES.find((c) => c.id === id) ?? CAR_CLASSES[0];
}

// ---------------------------------------------------------------- garage

export type UpgradeId = "engine" | "tyres" | "brakes" | "nitrous";

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  blurb: string;
  /** Cost of each level, index 0 = first upgrade. */
  costs: number[];
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: "engine",
    name: "Engine",
    blurb: "More power and a higher top end",
    costs: [600, 1400, 2800],
  },
  {
    id: "tyres",
    name: "Tyres",
    blurb: "Lateral grip and steering bite",
    costs: [500, 1200, 2400],
  },
  {
    id: "brakes",
    name: "Brakes",
    blurb: "Shorter stops, later braking",
    costs: [450, 1000, 2000],
  },
  {
    id: "nitrous",
    name: "Nitrous",
    blurb: "Bigger boost tank and shove",
    costs: [700, 1600, 3200],
  },
];

export const UPGRADE_MAX = 3;

export type UpgradeLevels = Record<UpgradeId, number>;

export const NO_UPGRADES: UpgradeLevels = { engine: 0, tyres: 0, brakes: 0, nitrous: 0 };

/** Cost of the next level, or null when the part is already maxed. */
export function upgradeCost(id: UpgradeId, level: number): number | null {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def || level >= def.costs.length) return null;
  return def.costs[level];
}

/** Clamps a (possibly corrupt) stored upgrade record into range. */
export function normaliseUpgrades(raw: Partial<UpgradeLevels> | undefined): UpgradeLevels {
  const out = { ...NO_UPGRADES };
  if (!raw || typeof raw !== "object") return out;
  for (const u of UPGRADES) {
    const v = raw[u.id];
    if (typeof v === "number" && isFinite(v)) out[u.id] = Math.min(UPGRADE_MAX, Math.max(0, Math.floor(v)));
  }
  return out;
}

/** 0..1 — how far through the whole upgrade tree a car is. */
export function upgradeProgress(levels: UpgradeLevels): number {
  const total = UPGRADES.length * UPGRADE_MAX;
  return UPGRADES.reduce((sum, u) => sum + levels[u.id], 0) / total;
}

// ---------------------------------------------------------------- AI difficulty

export type DifficultyId = "rookie" | "pro" | "legend";

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  /** Fraction of the reference top speed the AI is willing to reach. */
  topSpeedFactor: number;
  /** Margin applied to the theoretical corner speed — higher is braver. */
  cornerGrip: number;
  /** Seconds of lookahead along the racing line. */
  lookahead: number;
  aggression: number;
  /** 0..1 — how eagerly they spend boost. */
  boostUse: number;
  /** Per-driver error, 0 = perfect. */
  sloppiness: number;
  /** Catch-up strength when the player is far ahead or behind. */
  rubber: number;
  /** Credit multiplier for beating this field. */
  payout: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  rookie: {
    id: "rookie",
    name: "Rookie",
    topSpeedFactor: 0.78,
    cornerGrip: 0.76,
    lookahead: 0.42,
    aggression: 0.92,
    boostUse: 0.3,
    sloppiness: 0.8,
    rubber: 1.3,
    payout: 0.8,
  },
  pro: {
    id: "pro",
    name: "Pro",
    topSpeedFactor: 0.9,
    cornerGrip: 0.86,
    lookahead: 0.4,
    aggression: 1,
    boostUse: 0.6,
    sloppiness: 0.35,
    rubber: 1.0,
    payout: 1.1,
  },
  legend: {
    id: "legend",
    name: "Legend",
    topSpeedFactor: 1.0,
    cornerGrip: 0.95,
    lookahead: 0.38,
    aggression: 1,
    boostUse: 1,
    sloppiness: 0.1,
    rubber: 0.6,
    payout: 1.45,
  },
};

// ---------------------------------------------------------------- liveries

export const CAR_COLORS: { name: string; hex: number }[] = [
  { name: "Terracotta", hex: 0xc2553a },
  { name: "Bone", hex: 0xe9e2d2 },
  { name: "Slate", hex: 0x4d6378 },
  { name: "Juniper", hex: 0x4f6b4a },
  { name: "Ochre", hex: 0xd1a03c },
  { name: "Charcoal", hex: 0x2f2f33 },
];

// ---------------------------------------------------------------- quality

export type QualityId = "low" | "medium" | "high" | "ultra";

export interface QualityPreset {
  id: QualityId;
  name: string;
  /** Multiplier applied on top of devicePixelRatio. */
  renderScale: number;
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Max simultaneous dust particles. */
  particles: number;
  /** Max persistent skid-mark segments. */
  skidSegments: number;
  /** Scenery density multiplier. */
  propDensity: number;
  cloudCount: number;
  bloom: boolean;
  antialias: boolean;
  /** Camera far plane / fog end. */
  viewDistance: number;
}

export const QUALITY_PRESETS: Record<QualityId, QualityPreset> = {
  low: {
    id: "low",
    name: "Low",
    renderScale: 0.72,
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 1024,
    particles: 260,
    skidSegments: 0,
    propDensity: 0.45,
    cloudCount: 6,
    bloom: false,
    antialias: false,
    viewDistance: 420,
  },
  medium: {
    id: "medium",
    name: "Medium",
    renderScale: 0.9,
    maxPixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 1024,
    particles: 600,
    skidSegments: 420,
    propDensity: 0.75,
    cloudCount: 10,
    bloom: false,
    antialias: true,
    viewDistance: 560,
  },
  high: {
    id: "high",
    name: "High",
    renderScale: 1,
    maxPixelRatio: 1.75,
    shadows: true,
    shadowMapSize: 2048,
    particles: 1100,
    skidSegments: 900,
    propDensity: 1,
    cloudCount: 16,
    bloom: true,
    antialias: true,
    viewDistance: 700,
  },
  ultra: {
    id: "ultra",
    name: "Ultra",
    renderScale: 1,
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 3072,
    particles: 1800,
    skidSegments: 1500,
    propDensity: 1.25,
    cloudCount: 22,
    bloom: true,
    antialias: true,
    viewDistance: 820,
  },
};

export const QUALITY_ORDER: QualityId[] = ["low", "medium", "high", "ultra"];

/** Pick a sane starting preset from what we can sniff about the device. */
export function guessQuality(): QualityId {
  if (typeof navigator === "undefined" || typeof window === "undefined") return "high";
  const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  if (touch && (mem <= 4 || cores <= 4)) return "low";
  if (touch) return "medium";
  if (mem <= 4 || cores <= 4) return "medium";
  if (mem >= 8 && cores >= 8) return "high";
  return "medium";
}

// ---------------------------------------------------------------- controls

export type BindAction =
  | "throttle"
  | "brake"
  | "left"
  | "right"
  | "handbrake"
  | "boost"
  | "lookBack"
  | "respawn"
  | "camera"
  | "pause"
  | "mute";

export const BINDABLE: { id: BindAction; label: string }[] = [
  { id: "throttle", label: "Throttle" },
  { id: "brake", label: "Brake / reverse" },
  { id: "left", label: "Steer left" },
  { id: "right", label: "Steer right" },
  { id: "handbrake", label: "Handbrake" },
  { id: "boost", label: "Boost" },
  { id: "lookBack", label: "Look back" },
  { id: "respawn", label: "Respawn" },
  { id: "camera", label: "Camera" },
  { id: "pause", label: "Pause" },
  { id: "mute", label: "Mute" },
];

export const DEFAULT_KEYBINDS: Record<BindAction, string[]> = {
  throttle: ["w", "arrowup"],
  brake: ["s", "arrowdown"],
  left: ["a", "arrowleft"],
  right: ["d", "arrowright"],
  handbrake: [" "],
  boost: ["shift"],
  lookBack: ["b"],
  respawn: ["r"],
  camera: ["c"],
  pause: ["escape", "p"],
  mute: ["m"],
};

/** Pretty name for a raw `KeyboardEvent.key` value. */
export function keyLabel(k: string): string {
  if (k === " ") return "Space";
  if (k.startsWith("arrow")) return { arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→" }[k] ?? k;
  if (k === "escape") return "Esc";
  if (k === "shift") return "Shift";
  if (k === "control") return "Ctrl";
  if (k.length === 1) return k.toUpperCase();
  return k.charAt(0).toUpperCase() + k.slice(1);
}

// ---------------------------------------------------------------- wildcard circuits

/**
 * Builds a one-off circuit from a seed. Same generator as the hand-made
 * circuits, just with the shape parameters rolled instead of authored.
 */
export function wildcardTrack(seed: number): TrackDef {
  const rand = mulberry32(seed * 2654435761);
  const n = 14 + Math.floor(rand() * 4);
  const base = 118 + rand() * 54;
  const chaos = 0.2 + rand() * 0.55;
  const radii: number[] = [];
  for (let i = 0; i < n; i++) {
    const wobble = Math.sin((i / n) * Math.PI * 2 * (1 + Math.floor(rand() * 3))) * chaos;
    radii.push(Math.max(80, Math.min(210, base * (1 + wobble) * (0.88 + rand() * 0.26))));
  }
  const tight = radii.filter((r) => r < 110).length / n;
  return {
    id: "wildcard",
    name: `Wildcard #${seed}`,
    subtitle: tight > 0.35 ? "Rolled fresh — and nasty" : "Rolled fresh this session",
    radii,
    seed: seed * 7919 + 13,
    halfWidth: 6.4 + rand() * 2.2,
    stretch: [0.96 + rand() * 0.24, 0.88 + rand() * 0.22],
    grade: tight > 0.35 ? "brutal" : chaos > 0.45 ? "technical" : "flowing",
  };
}

// ---------------------------------------------------------------- misc

export const SECTOR_COUNT = 3;
// ---------------------------------------------------------------- rival drivers

/**
 * Rival personalities. Every trait is 0..1 and is folded into the difficulty
 * tuning at race start, so "Pro" still means Pro — but the four cars you face
 * behave like four different people rather than four copies.
 */
export interface DriverDef {
  id: string;
  name: string;
  /** Livery colour, kept distinct from the player's palette. */
  color: number;
  /** Outright pace: top speed and corner commitment. */
  pace: number;
  /** How close they will race and how hard they commit to a move. */
  aggression: number;
  /** Inverse mistake rate — low consistency means lock-ups and wide exits. */
  consistency: number;
  /** Line choice, defending and awareness in traffic. */
  racecraft: number;
  /** How well they cope with low grip. */
  wet: number;
  /** How cleverly they spend boost. */
  boost: number;
  blurb: string;
}

export const DRIVERS: DriverDef[] = [
  {
    id: "atlas",
    name: "ATLAS",
    color: 0x4f6b4a,
    pace: 0.86,
    aggression: 0.55,
    consistency: 0.95,
    racecraft: 0.8,
    wet: 0.9,
    boost: 0.6,
    blurb: "Metronome. Never puts a wheel wrong.",
  },
  {
    id: "vector",
    name: "VECTOR",
    color: 0xd1a03c,
    pace: 0.94,
    aggression: 0.9,
    consistency: 0.62,
    racecraft: 0.7,
    wet: 0.5,
    boost: 0.85,
    blurb: "Fastest on the grid when it sticks.",
  },
  {
    id: "kestrel",
    name: "KESTREL",
    color: 0x7f9ec2,
    pace: 0.8,
    aggression: 0.35,
    consistency: 0.88,
    racecraft: 0.92,
    wet: 0.95,
    boost: 0.55,
    blurb: "Lives off your mistakes. Brilliant in the wet.",
  },
  {
    id: "magpie",
    name: "MAGPIE",
    color: 0xb06a9c,
    pace: 0.82,
    aggression: 0.98,
    consistency: 0.55,
    racecraft: 0.6,
    wet: 0.6,
    boost: 0.95,
    blurb: "Dive-bombs everything. Sometimes it works.",
  },
  {
    id: "osprey",
    name: "OSPREY",
    color: 0x58a39a,
    pace: 0.88,
    aggression: 0.62,
    consistency: 0.8,
    racecraft: 0.85,
    wet: 0.75,
    boost: 0.7,
    blurb: "Quietly quick. Devastating last lap.",
  },
  {
    id: "nomad",
    name: "NOMAD",
    color: 0xc77b4a,
    pace: 0.74,
    aggression: 0.45,
    consistency: 0.9,
    racecraft: 0.7,
    wet: 0.85,
    boost: 0.4,
    blurb: "Old school. Saves the car, saves the tyres.",
  },
  {
    id: "harrier",
    name: "HARRIER",
    color: 0x8d6ec9,
    pace: 0.97,
    aggression: 0.75,
    consistency: 0.7,
    racecraft: 0.78,
    wet: 0.65,
    boost: 0.8,
    blurb: "Qualifying specialist. Hates being behind.",
  },
];

export const MAX_RIVALS = DRIVERS.length;

// ---------------------------------------------------------------- tyres

/** A tyre compound: the race-long trade between outright grip and durability. */
export interface TyreCompound {
  id: string;
  name: string;
  short: string;
  /** Multiplier on lateral grip. */
  grip: number;
  /** Multiplier on wear rate. */
  wear: number;
  /** Multiplier on how fast the rubber comes up to temperature. */
  warmth: number;
  blurb: string;
}

export const TYRE_COMPOUNDS: TyreCompound[] = [
  {
    id: "soft",
    name: "Soft",
    short: "S",
    grip: 1.07,
    wear: 1.5,
    warmth: 1.35,
    blurb: "Huge grip, warms instantly, gone by the end of a long race",
  },
  {
    id: "medium",
    name: "Medium",
    short: "M",
    grip: 1,
    wear: 1,
    warmth: 1,
    blurb: "The honest compromise",
  },
  {
    id: "hard",
    name: "Hard",
    short: "H",
    grip: 0.95,
    wear: 0.62,
    warmth: 0.75,
    blurb: "Slow to switch on, still there at the flag",
  },
];

export function compoundById(id: string): TyreCompound {
  return TYRE_COMPOUNDS.find((c) => c.id === id) ?? TYRE_COMPOUNDS[1];
}

/** Rival names in grid order. Derived so it can never drift from the roster. */
export const AI_NAMES = DRIVERS.map((d) => d.name);

export function driversFor(count: number): DriverDef[] {
  return DRIVERS.slice(0, Math.max(0, Math.min(MAX_RIVALS, Math.round(count))));
}
