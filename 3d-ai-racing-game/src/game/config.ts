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

// ---------------------------------------------------------------- misc

export const SECTOR_COUNT = 3;
export const AI_NAMES = ["ATLAS", "VECTOR", "KESTREL", "MAGPIE", "OSPREY"];
