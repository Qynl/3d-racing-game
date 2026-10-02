import { create } from "zustand";

export type Screen = "menu" | "countdown" | "racing" | "paused" | "finished";
export type Difficulty = "rookie" | "pro" | "legend";

export interface Settings {
  difficulty: Difficulty;
  carColor: number;
  laps: number;
  muted: boolean;
  cameraMode: number;
}

export interface HudData {
  speed: number;
  lap: number;
  totalLaps: number;
  position: number;
  carCount: number;
  time: number;
  lapTimes: number[];
  bestLap: number | null;
  wrongWay: boolean;
  countdown: number; // 3,2,1 -> numbers, 0 -> GO, -1 -> hidden
  finalLap: boolean;
  offTrack: boolean;
  drifting: boolean;
  currentLapTime: number;
  gapAhead: number | null; // seconds (negative = behind)
}

export interface CarResult {
  name: string;
  color: number;
  time: number | null;
  isPlayer: boolean;
  bestLap: number | null;
}

export interface RaceResults {
  position: number;
  totalTime: number;
  lapTimes: number[];
  bestLap: number | null;
  isRecord: boolean;
  cars: CarResult[];
}

export const CAR_COLORS: { name: string; hex: number }[] = [
  { name: "Terracotta", hex: 0xc2553a },
  { name: "Bone", hex: 0xe9e2d2 },
  { name: "Slate", hex: 0x4d6378 },
  { name: "Juniper", hex: 0x4f6b4a },
  { name: "Ochre", hex: 0xd1a03c },
  { name: "Charcoal", hex: 0x2f2f33 },
];

const BEST_KEY = "sundown-rally-best-v1";

function loadBest(): Record<Difficulty, number | null> {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        rookie: parsed.rookie ?? null,
        pro: parsed.pro ?? null,
        legend: parsed.legend ?? null,
      };
    }
  } catch {
    /* ignore */
  }
  return { rookie: null, pro: null, legend: null };
}

function saveBest(best: Record<Difficulty, number | null>) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    /* ignore */
  }
}

export const defaultHud: HudData = {
  speed: 0,
  lap: 1,
  totalLaps: 3,
  position: 4,
  carCount: 4,
  time: 0,
  lapTimes: [],
  bestLap: null,
  wrongWay: false,
  countdown: -1,
  finalLap: false,
  offTrack: false,
  drifting: false,
  currentLapTime: 0,
  gapAhead: null,
};

interface GameStore {
  screen: Screen;
  settings: Settings;
  hud: HudData;
  results: RaceResults | null;
  bestTimes: Record<Difficulty, number | null>;
  loaded: boolean;
  setScreen: (s: Screen) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setHud: (patch: Partial<HudData>) => void;
  setResults: (r: RaceResults | null) => void;
  recordBest: (d: Difficulty, time: number) => boolean;
  setLoaded: (v: boolean) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  screen: "menu",
  settings: {
    difficulty: "pro",
    carColor: 0,
    laps: 3,
    muted: false,
    cameraMode: 0,
  },
  hud: { ...defaultHud },
  results: null,
  bestTimes: loadBest(),
  loaded: false,
  setScreen: (screen) => set({ screen }),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setHud: (patch) => set((s) => ({ hud: { ...s.hud, ...patch } })),
  setResults: (results) => set({ results }),
  recordBest: (d, time) => {
    const best = { ...get().bestTimes };
    const prev = best[d];
    if (prev === null || time < prev) {
      best[d] = time;
      saveBest(best);
      set({ bestTimes: best });
      return true;
    }
    return false;
  },
  setLoaded: (loaded) => set({ loaded }),
}));

export function formatTime(t: number | null | undefined): string {
  if (t === null || t === undefined || !isFinite(t)) return "--:--.---";
  const ms = Math.floor((t % 1) * 1000);
  const total = Math.floor(t);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms
    .toString()
    .padStart(3, "0")}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
