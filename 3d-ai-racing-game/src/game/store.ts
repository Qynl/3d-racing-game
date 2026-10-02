import { create } from "zustand";
import {
  CAR_CLASSES,
  CAR_COLORS,
  QUALITY_PRESETS,
  type QualityId,
  SECTOR_COUNT,
  TRACKS,
  guessQuality,
} from "./config";

export type Screen = "menu" | "countdown" | "racing" | "paused" | "finished";
export type Difficulty = "rookie" | "pro" | "legend";
export type RaceMode = "race" | "timetrial";
export type TouchSteerMode = "buttons" | "slider" | "tilt";

export { CAR_COLORS };

export interface Settings {
  mode: RaceMode;
  difficulty: Difficulty;
  trackId: string;
  carClassId: string;
  carColor: number;
  laps: number;
  cameraMode: number;
  quality: QualityId;
  autoQuality: boolean;
  masterVolume: number;
  musicVolume: number;
  muted: boolean;
  showGhost: boolean;
  reducedMotion: boolean;
  touchSteer: TouchSteerMode;
  steerSensitivity: number;
  showRacingLine: boolean;
}

export interface HudData {
  speed: number;
  gear: number;
  rpm: number;
  lap: number;
  totalLaps: number;
  position: number;
  carCount: number;
  time: number;
  lapTimes: number[];
  bestLap: number | null;
  sessionBestLap: number | null;
  wrongWay: boolean;
  countdown: number; // 3,2,1 -> numbers, 0 -> GO, -1 -> hidden
  finalLap: boolean;
  offTrack: boolean;
  drifting: boolean;
  airborne: boolean;
  currentLapTime: number;
  gapAhead: number | null;
  gapBehind: number | null;
  boost: number; // 0..1 tank
  boosting: boolean;
  driftCombo: number; // 0..1 meter towards next boost chunk
  driftScore: number;
  lapInvalid: boolean;
  stuck: boolean;
  delta: number | null; // vs best lap, seconds
  sectorIndex: number;
  sectorDeltas: (number | null)[];
  sectorFlash: { index: number; delta: number | null; at: number } | null;
}

export interface CarResult {
  name: string;
  color: number;
  time: number | null;
  isPlayer: boolean;
  bestLap: number | null;
  provisional: boolean;
}

export interface RaceResults {
  position: number;
  totalTime: number;
  lapTimes: number[];
  bestLap: number | null;
  isRecordLap: boolean;
  isRecordRace: boolean;
  bestSectors: (number | null)[];
  cars: CarResult[];
  topSpeed: number;
  driftScore: number;
  airTime: number;
  cleanRace: boolean;
  mode: RaceMode;
  trackId: string;
}

export interface Toast {
  id: number;
  text: string;
  sub?: string;
  kind: "good" | "bad" | "info";
}

export interface TrackRecord {
  bestLap: number | null;
  bestSectors: (number | null)[];
  races: Record<string, number>;
}

// ---------------------------------------------------------------- persistence

const SETTINGS_KEY = "sundown-rally-settings-v2";
const RECORDS_KEY = "sundown-rally-records-v2";

export const defaultSettings: Settings = {
  mode: "race",
  difficulty: "pro",
  trackId: TRACKS[0].id,
  carClassId: CAR_CLASSES[0].id,
  carColor: 0,
  laps: 3,
  cameraMode: 0,
  quality: "high",
  autoQuality: true,
  masterVolume: 0.8,
  musicVolume: 0.45,
  muted: false,
  showGhost: true,
  reducedMotion: false,
  touchSteer: "slider",
  steerSensitivity: 1,
  showRacingLine: false,
};

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

function loadSettings(): Settings {
  const base: Settings = {
    ...defaultSettings,
    quality: guessQuality(),
    reducedMotion: prefersReducedMotion(),
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged: Settings = { ...base, ...parsed };
    // Validate everything that indexes into static data.
    if (!TRACKS.some((t) => t.id === merged.trackId)) merged.trackId = base.trackId;
    if (!CAR_CLASSES.some((c) => c.id === merged.carClassId)) merged.carClassId = base.carClassId;
    if (!QUALITY_PRESETS[merged.quality]) merged.quality = base.quality;
    merged.carColor = Math.min(Math.max(0, merged.carColor | 0), CAR_COLORS.length - 1);
    merged.laps = Math.min(Math.max(1, merged.laps | 0), 9);
    merged.cameraMode = Math.min(Math.max(0, merged.cameraMode | 0), 2);
    merged.masterVolume = clamp01(merged.masterVolume);
    merged.musicVolume = clamp01(merged.musicVolume);
    merged.steerSensitivity = Math.min(Math.max(0.5, merged.steerSensitivity), 1.8);
    return merged;
  } catch {
    return base;
  }
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage disabled — fine, settings just won't persist */
  }
}

function loadRecords(): Record<string, TrackRecord> {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TrackRecord>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* ignore */
  }
  return {};
}

function saveRecords(r: Record<string, TrackRecord>) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

export function raceKey(difficulty: Difficulty, laps: number, mode: RaceMode, carClassId: string): string {
  return `${mode}:${difficulty}:${laps}:${carClassId}`;
}

export function emptyRecord(): TrackRecord {
  return { bestLap: null, bestSectors: new Array(SECTOR_COUNT).fill(null), races: {} };
}

// ---------------------------------------------------------------- hud defaults

export const defaultHud: HudData = {
  speed: 0,
  gear: 1,
  rpm: 0,
  lap: 1,
  totalLaps: 3,
  position: 4,
  carCount: 4,
  time: 0,
  lapTimes: [],
  bestLap: null,
  sessionBestLap: null,
  wrongWay: false,
  countdown: -1,
  finalLap: false,
  offTrack: false,
  drifting: false,
  airborne: false,
  currentLapTime: 0,
  gapAhead: null,
  gapBehind: null,
  boost: 0,
  boosting: false,
  driftCombo: 0,
  driftScore: 0,
  lapInvalid: false,
  stuck: false,
  delta: null,
  sectorIndex: 0,
  sectorDeltas: new Array(SECTOR_COUNT).fill(null),
  sectorFlash: null,
};

// ---------------------------------------------------------------- store

interface GameStore {
  screen: Screen;
  settings: Settings;
  hud: HudData;
  results: RaceResults | null;
  records: Record<string, TrackRecord>;
  loaded: boolean;
  loadProgress: number;
  loadLabel: string;
  fatal: string | null;
  toasts: Toast[];
  fps: number;
  setScreen: (s: Screen) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setHud: (patch: Partial<HudData>) => void;
  setResults: (r: RaceResults | null) => void;
  setLoaded: (v: boolean) => void;
  setProgress: (p: number, label: string) => void;
  setFatal: (m: string | null) => void;
  setFps: (f: number) => void;
  pushToast: (t: Omit<Toast, "id">) => void;
  dropToast: (id: number) => void;
  recordFor: (trackId: string) => TrackRecord;
  /** Returns which records were beaten. */
  commitRecords: (
    trackId: string,
    key: string,
    raceTime: number | null,
    bestLap: number | null,
    sectors: (number | null)[],
  ) => { lap: boolean; race: boolean };
}

let toastId = 1;

export const useGameStore = create<GameStore>((set, get) => ({
  screen: "menu",
  settings: loadSettings(),
  hud: { ...defaultHud },
  results: null,
  records: loadRecords(),
  loaded: false,
  loadProgress: 0,
  loadLabel: "Warming up",
  fatal: null,
  toasts: [],
  fps: 60,
  setScreen: (screen) => set({ screen }),
  setSettings: (patch) =>
    set((s) => {
      const settings = { ...s.settings, ...patch };
      saveSettings(settings);
      return { settings };
    }),
  setHud: (patch) => set((s) => ({ hud: { ...s.hud, ...patch } })),
  setResults: (results) => set({ results }),
  setLoaded: (loaded) => set({ loaded }),
  setProgress: (loadProgress, loadLabel) => set({ loadProgress, loadLabel }),
  setFatal: (fatal) => set({ fatal }),
  setFps: (fps) => set({ fps }),
  pushToast: (t) => set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id: toastId++ }] })),
  dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  recordFor: (trackId) => get().records[trackId] ?? emptyRecord(),
  commitRecords: (trackId, key, raceTime, bestLap, sectors) => {
    const records = { ...get().records };
    const prev = records[trackId] ?? emptyRecord();
    const next: TrackRecord = {
      bestLap: prev.bestLap,
      bestSectors: [...(prev.bestSectors ?? [])],
      races: { ...prev.races },
    };
    let lapBeaten = false;
    let raceBeaten = false;
    if (bestLap !== null && (next.bestLap === null || bestLap < next.bestLap)) {
      next.bestLap = bestLap;
      lapBeaten = true;
    }
    for (let i = 0; i < sectors.length; i++) {
      const s = sectors[i];
      if (s === null || s === undefined) continue;
      const cur = next.bestSectors[i];
      if (cur === null || cur === undefined || s < cur) next.bestSectors[i] = s;
    }
    if (raceTime !== null) {
      const cur = next.races[key];
      if (cur === undefined || raceTime < cur) {
        next.races[key] = raceTime;
        raceBeaten = true;
      }
    }
    records[trackId] = next;
    saveRecords(records);
    set({ records });
    return { lap: lapBeaten, race: raceBeaten };
  },
}));

// ---------------------------------------------------------------- formatting

export function formatTime(t: number | null | undefined): string {
  if (t === null || t === undefined || !isFinite(t)) return "--:--.---";
  const neg = t < 0;
  const abs = Math.abs(t);
  const ms = Math.floor((abs % 1) * 1000);
  const total = Math.floor(abs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${neg ? "-" : ""}${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms
    .toString()
    .padStart(3, "0")}`;
}

/** Short form without the leading minutes when under a minute: 42.318 */
export function formatShort(t: number | null | undefined): string {
  if (t === null || t === undefined || !isFinite(t)) return "--.---";
  if (t >= 60) return formatTime(t);
  return t.toFixed(3);
}

export function formatDelta(d: number | null | undefined): string {
  if (d === null || d === undefined || !isFinite(d)) return "";
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  return `${sign}${Math.abs(d).toFixed(3)}`;
}

export function formatGap(d: number | null | undefined): string {
  if (d === null || d === undefined || !isFinite(d)) return "";
  return `${Math.abs(d).toFixed(1)}s`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
