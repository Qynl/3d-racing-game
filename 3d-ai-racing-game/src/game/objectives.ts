import { mulberry32 } from "./noise";

/**
 * Race objectives.
 *
 * Three goals are generated for every *configuration* (track, mode, laps,
 * difficulty, field size) rather than for every attempt, so a goal you just
 * missed is still there when you hit "Race again" — which is what makes them
 * worth chasing instead of worth ignoring.
 */
export type ObjectiveKind =
  | "win"
  | "podium"
  | "beat"
  | "overtakes"
  | "drift"
  | "air"
  | "topSpeed"
  | "clean"
  | "tyres"
  | "noDamage"
  | "survive";

export interface Objective {
  id: string;
  kind: ObjectiveKind;
  /** Threshold the outcome is compared against; meaning depends on `kind`. */
  target: number;
  label: string;
  reward: number;
}

/** Everything an objective is allowed to look at when the race is over. */
export interface RaceOutcome {
  position: number;
  carCount: number;
  lapsCompleted: number;
  /** Net places gained on track over the race. */
  overtakes: number;
  driftScore: number;
  airTime: number;
  topSpeedKmh: number;
  /** True when the player never invalidated a lap. */
  cleanRace: boolean;
  /** 0..1 tyre wear at the flag. */
  tyreWear: number;
  /** 0..1 body damage at the flag. */
  damage: number;
  /** Knockout: elimination rounds survived. */
  survived: number;
}

export interface ObjectiveResult {
  id: string;
  label: string;
  reward: number;
  met: boolean;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface ObjectiveContext {
  trackId: string;
  mode: string;
  laps: number;
  difficulty: string;
  rivals: number;
}

/** Deterministic seed for a race configuration. */
export function objectiveSeed(ctx: ObjectiveContext): number {
  return hash(`${ctx.trackId}|${ctx.mode}|${ctx.laps}|${ctx.difficulty}|${ctx.rivals}`);
}

const DIFFICULTY_PAY: Record<string, number> = { rookie: 0.8, pro: 1, legend: 1.3 };

/** Builds the three objectives for a race configuration. */
export function objectivesFor(ctx: ObjectiveContext): Objective[] {
  const rand = mulberry32(objectiveSeed(ctx));
  const pay = DIFFICULTY_PAY[ctx.difficulty] ?? 1;
  const money = (base: number) => Math.round((base * pay) / 10) * 10;
  const field = Math.max(1, ctx.rivals);
  const knockout = ctx.mode === "knockout";
  const timeTrial = ctx.mode === "timetrial";

  const pool: Objective[] = [];
  const push = (o: Omit<Objective, "id">) => pool.push({ ...o, id: `${o.kind}-${o.target}` });

  if (timeTrial) {
    push({ kind: "drift", target: 1200, label: "Bank a 1,200 drift score", reward: money(220) });
    push({ kind: "air", target: 2.5, label: "Spend 2.5s airborne", reward: money(200) });
    push({ kind: "topSpeed", target: 200, label: "Touch 200 km/h", reward: money(200) });
    push({ kind: "clean", target: 1, label: "Keep every lap clean", reward: money(260) });
    push({ kind: "tyres", target: 0.45, label: "Finish under 45% tyre wear", reward: money(240) });
  } else if (knockout) {
    push({ kind: "survive", target: Math.max(1, Math.ceil(field / 2)), label: `Survive ${Math.max(1, Math.ceil(field / 2))} eliminations`, reward: money(260) });
    push({ kind: "win", target: 1, label: "Be the last car running", reward: money(420) });
    push({ kind: "overtakes", target: 3, label: "Make 3 clean passes", reward: money(240) });
    push({ kind: "noDamage", target: 0.25, label: "Stay under 25% damage", reward: money(220) });
    push({ kind: "drift", target: 900, label: "Bank a 900 drift score", reward: money(200) });
  } else {
    push({ kind: "win", target: 1, label: "Win the race", reward: money(400) });
    push({
      kind: "podium",
      target: Math.min(3, Math.max(2, Math.ceil((field + 1) / 3))),
      label: "Finish on the podium",
      reward: money(260),
    });
    push({ kind: "overtakes", target: Math.min(4, Math.max(2, field - 1)), label: `Gain ${Math.min(4, Math.max(2, field - 1))} places on track`, reward: money(240) });
    push({ kind: "clean", target: 1, label: "Keep every lap clean", reward: money(230) });
    push({ kind: "drift", target: 1500, label: "Bank a 1,500 drift score", reward: money(210) });
    push({ kind: "air", target: 3, label: "Spend 3s airborne", reward: money(190) });
    push({ kind: "topSpeed", target: 210, label: "Touch 210 km/h", reward: money(200) });
    push({ kind: "tyres", target: 0.5, label: "Finish under 50% tyre wear", reward: money(230) });
    push({ kind: "noDamage", target: 0.15, label: "Bring it back under 15% damage", reward: money(240) });
    push({ kind: "beat", target: 2, label: "Beat at least 2 rivals", reward: money(180) });
  }

  // Shuffle deterministically, then take three with distinct kinds.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked: Objective[] = [];
  const kinds = new Set<ObjectiveKind>();
  for (const o of pool) {
    if (kinds.has(o.kind)) continue;
    kinds.add(o.kind);
    picked.push(o);
    if (picked.length === 3) break;
  }
  return picked;
}

/** True when the outcome satisfies the objective. */
export function checkObjective(o: Objective, r: RaceOutcome): boolean {
  switch (o.kind) {
    case "win":
      return r.position === 1;
    case "podium":
      return r.position <= o.target;
    case "beat":
      return r.carCount - r.position >= o.target;
    case "overtakes":
      return r.overtakes >= o.target;
    case "drift":
      return r.driftScore >= o.target;
    case "air":
      return r.airTime >= o.target;
    case "topSpeed":
      return r.topSpeedKmh >= o.target;
    case "clean":
      return r.cleanRace;
    case "tyres":
      return r.tyreWear <= o.target;
    case "noDamage":
      return r.damage <= o.target;
    case "survive":
      return r.survived >= o.target;
    default:
      return false;
  }
}

export function evaluateObjectives(list: Objective[], r: RaceOutcome): ObjectiveResult[] {
  return list.map((o) => ({ id: o.id, label: o.label, reward: o.reward, met: checkObjective(o, r) }));
}

/** Total credits earned from a set of evaluated objectives. */
export function objectiveReward(results: ObjectiveResult[]): number {
  return results.reduce((sum, r) => sum + (r.met ? r.reward : 0), 0);
}
