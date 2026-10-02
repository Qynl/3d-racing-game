import { DIFFICULTIES, type DifficultyId } from "./config";
import { WEATHERS, type WeatherId } from "./sky";

/** One line of the post-race payout. */
export interface CreditLine {
  label: string;
  amount: number;
}

export interface CreditSummary {
  lines: CreditLine[];
  total: number;
}

export interface PayoutInput {
  mode: "race" | "timetrial" | "championship";
  /** 1-based finishing position. */
  position: number;
  carCount: number;
  laps: number;
  difficulty: DifficultyId;
  weather: WeatherId;
  /** Every lap completed was valid. */
  cleanRace: boolean;
  driftScore: number;
  /** Seconds of air time across the race. */
  airTime: number;
  newLapRecord: boolean;
  newRaceRecord: boolean;
  /** Finished the final round of a championship. */
  seasonFinished?: boolean;
  /** Won the championship outright. */
  seasonWon?: boolean;
}

const POSITION_PAY = [900, 560, 340, 200];

/**
 * Race payout. Deliberately readable rather than clever: the results screen
 * shows every line, so the player can see exactly which bits of driving paid.
 */
export function computePayout(input: PayoutInput): CreditSummary {
  const lines: CreditLine[] = [];
  const add = (label: string, amount: number) => {
    const v = Math.round(amount);
    if (v > 0) lines.push({ label, amount: v });
  };

  if (input.mode === "timetrial") {
    add("Time trial session", 220);
  } else {
    const base = POSITION_PAY[Math.min(POSITION_PAY.length, Math.max(1, input.position)) - 1] ?? 160;
    add(`Finished P${input.position}`, base);
  }

  add("Race distance", Math.max(0, input.laps) * 60);
  if (input.cleanRace) add("Clean race", 180);
  add("Drift score", Math.min(600, input.driftScore / 35));
  add("Air time", Math.min(240, input.airTime * 40));
  if (input.newLapRecord) add("New lap record", 250);
  if (input.newRaceRecord) add("New race record", 300);
  if (input.seasonFinished) add("Season completed", 600);
  if (input.seasonWon) add("Championship won", 1500);

  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);

  // Multipliers are shown as their own lines so the total always adds up.
  const diff = DIFFICULTIES[input.difficulty];
  const diffMul = diff?.payout ?? 1;
  const weatherMul = WEATHERS[input.weather]?.payout ?? 1;
  const mul = diffMul * weatherMul;
  if (mul > 1.001) {
    const label = `${diff?.name ?? "Difficulty"} · ${WEATHERS[input.weather]?.name ?? "Clear"} bonus`;
    add(label, subtotal * (mul - 1));
  }
  const total = Math.round(subtotal * Math.max(1, mul));

  return { lines, total };
}
