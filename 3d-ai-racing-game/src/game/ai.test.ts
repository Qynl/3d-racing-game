import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AIController, maxCornerSpeed, type AIParams } from "./ai";
import { CarPhysics, tuningFromClass } from "./car";
import { DRIVERS, DIFFICULTIES, MAX_RIVALS, carClassById, driversFor, trackById } from "./config";
import { computeRacingLine } from "./racingline";
import type { Terrain } from "./terrain";
import { Track } from "./track";
import { aiParamsFor } from "./Game";

function flatTerrain(): Terrain {
  return {
    getHeight: () => 0,
    getNormal: (_x: number, _z: number, out: THREE.Vector3) => out.set(0, 1, 0),
  } as unknown as Terrain;
}

const baseParams = (patch: Partial<AIParams> = {}): AIParams => ({
  topSpeed: 52,
  cornerGrip: 0.95,
  lookahead: 0.26,
  aggression: 1,
  boldness: 0.7,
  boostUse: 0.5,
  sloppiness: 0,
  racecraft: 0.8,
  wetSkill: 0.8,
  ...patch,
});

/** Puts a car on the grid at a track index with a lateral offset. */
function spawn(track: Track, index: number, lateral = 0) {
  const car = new CarPhysics(tuningFromClass(carClassById("coyote")));
  const p = new THREE.Vector3();
  track.offsetPoint(index, lateral, p);
  car.place(p.x, p.z, track.yawAt(index), flatTerrain(), track);
  car.resetRaceState();
  return car;
}

interface SimResult {
  laps: number;
  maxOff: number;
  offTime: number;
  avgSpeed: number;
  minSpeed: number;
}

/** Runs a field of AI cars around a circuit and reports how well they coped. */
function simulate(
  track: Track,
  controllers: AIController[],
  cars: CarPhysics[],
  seconds: number,
  dt = 1 / 60,
): SimResult[] {
  const terrain = flatTerrain();
  const steps = Math.round(seconds / dt);
  const stats = controllers.map(() => ({
    laps: 0,
    maxOff: 0,
    offTime: 0,
    speedSum: 0,
    minSpeed: Infinity,
    unwrapped: 0,
    last: 0,
  }));
  cars.forEach((c, i) => (stats[i].last = c.trackIndex));
  let t = 0;
  for (let s = 0; s < steps; s++) {
    t += dt;
    for (let i = 0; i < cars.length; i++) {
      const input = controllers[i].update(cars[i], cars, dt, t, true);
      cars[i].step(input, dt, terrain, track);
      // Rivals get a trickle of boost in the real game; mirror that here.
      cars[i].boost = Math.min(1, cars[i].boost + dt * 0.055);
      const st = stats[i];
      const off = Math.max(0, cars[i].trackDist - track.halfWidth);
      if (off > st.maxOff) st.maxOff = off;
      if (off > 0.5) st.offTime += dt;
      st.speedSum += cars[i].speedF;
      if (t > 1.5 && cars[i].speedF < st.minSpeed) st.minSpeed = cars[i].speedF;
      let d = cars[i].trackIndex - st.last;
      if (d > track.count / 2) d -= track.count;
      if (d < -track.count / 2) d += track.count;
      st.unwrapped += d;
      st.last = cars[i].trackIndex;
    }
  }
  return stats.map((st) => ({
    laps: st.unwrapped / track.count,
    maxOff: st.maxOff,
    offTime: st.offTime,
    avgSpeed: st.speedSum / steps,
    minSpeed: st.minSpeed,
  }));
}

describe("maxCornerSpeed", () => {
  it("falls as the corner tightens", () => {
    const open = maxCornerSpeed(0.005);
    const tight = maxCornerSpeed(0.08);
    expect(open).toBeGreaterThan(tight);
    expect(tight).toBeGreaterThan(0);
  });

  it("is symmetric in the sign of the curvature", () => {
    expect(maxCornerSpeed(0.03)).toBeCloseTo(maxCornerSpeed(-0.03), 6);
  });
});

describe("driver roster", () => {
  it("exposes MAX_RIVALS distinct drivers with unique names and colours", () => {
    expect(DRIVERS.length).toBe(MAX_RIVALS);
    expect(new Set(DRIVERS.map((d) => d.name)).size).toBe(DRIVERS.length);
    expect(new Set(DRIVERS.map((d) => d.id)).size).toBe(DRIVERS.length);
    expect(new Set(DRIVERS.map((d) => d.color)).size).toBe(DRIVERS.length);
  });

  it("keeps every trait inside 0..1 and ships a blurb", () => {
    for (const d of DRIVERS) {
      for (const v of [d.pace, d.aggression, d.consistency, d.racecraft, d.wet, d.boost]) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(d.blurb.length).toBeGreaterThan(8);
    }
  });

  it("driversFor clamps the requested field size", () => {
    expect(driversFor(3)).toHaveLength(3);
    expect(driversFor(0)).toHaveLength(0);
    expect(driversFor(99)).toHaveLength(MAX_RIVALS);
  });

  it("gives faster drivers more pace within the same difficulty", () => {
    const diff = DIFFICULTIES.pro;
    const fast = aiParamsFor(diff, DRIVERS.find((d) => d.id === "harrier")!);
    const slow = aiParamsFor(diff, DRIVERS.find((d) => d.id === "nomad")!);
    expect(fast.topSpeed).toBeGreaterThan(slow.topSpeed);
    // ...but the difficulty still dominates: the spread stays modest.
    expect(fast.topSpeed / slow.topSpeed).toBeLessThan(1.2);
  });

  it("maps consistency onto mistakes and boost appetite onto boost use", () => {
    const diff = DIFFICULTIES.pro;
    const steady = aiParamsFor(diff, DRIVERS.find((d) => d.id === "atlas")!);
    const wild = aiParamsFor(diff, DRIVERS.find((d) => d.id === "magpie")!);
    expect(wild.sloppiness).toBeGreaterThan(steady.sloppiness);
    expect(wild.boostUse).toBeGreaterThan(steady.boostUse);
    expect(wild.boldness).toBeGreaterThan(steady.boldness);
  });

  it("scales with difficulty, not just personality", () => {
    const d = DRIVERS[0];
    expect(aiParamsFor(DIFFICULTIES.rookie, d).topSpeed).toBeLessThan(
      aiParamsFor(DIFFICULTIES.legend, d).topSpeed,
    );
  });
});

describe("AI driving", () => {
  for (const id of ["sundown", "mesa", "canyon"]) {
    it(`keeps a solo car on ${id} and completes meaningful distance`, () => {
      const track = new Track(trackById(id));
      const line = computeRacingLine(track);
      const car = spawn(track, 0);
      const ai = new AIController(track, baseParams(), 1, line);
      const [r] = simulate(track, [ai], [car], 50);
      expect(r.laps).toBeGreaterThan(0.25);
      expect(r.maxOff).toBeLessThan(4);
      expect(r.offTime).toBeLessThan(6);
      expect(r.minSpeed).toBeGreaterThan(3);
    });
  }

  it("tracks the solved racing line more closely than a car without one", () => {
    const track = new Track(trackById("mesa"));
    const line = computeRacingLine(track);
    const terrain = flatTerrain();
    const dt = 1 / 60;

    /** Mean distance from the car to the racing line it should be on. */
    const run = (ai: AIController, car: CarPhysics) => {
      let sum = 0;
      let n = 0;
      let t = 0;
      const want = new THREE.Vector3();
      for (let i = 0; i < 40 * 60; i++) {
        t += dt;
        car.step(ai.update(car, [car], dt, t, true), dt, terrain, track);
        if (t < 2) continue;
        track.offsetPoint(car.trackIndex, line.offsets[car.trackIndex], want);
        sum += Math.hypot(car.pos.x - want.x, car.pos.z - want.z);
        n++;
      }
      return sum / n;
    };

    const onLine = run(new AIController(track, baseParams(), 1, line), spawn(track, 0));
    const offLine = run(new AIController(track, baseParams(), 1, null), spawn(track, 0));
    expect(onLine).toBeLessThan(offLine);
  });

  it("runs a full grid without cars ending up off the circuit", () => {
    const track = new Track(trackById("sundown"));
    const line = computeRacingLine(track);
    const field = driversFor(MAX_RIVALS);
    const cars = field.map((_, i) => spawn(track, (i >> 1) * 6, i % 2 === 0 ? -2.9 : 2.9));
    const ais = field.map(
      (d, i) => new AIController(track, aiParamsFor(DIFFICULTIES.pro, d), i + 1, line),
    );
    const res = simulate(track, ais, cars, 40);
    for (const r of res) {
      expect(r.laps).toBeGreaterThan(0.2);
      expect(r.maxOff).toBeLessThan(6);
    }
    // The field should spread out rather than drive as one block.
    const laps = res.map((r) => r.laps);
    expect(Math.max(...laps) - Math.min(...laps)).toBeGreaterThan(0.004);
  });

  it("slows down for low grip", () => {
    const track = new Track(trackById("sundown"));
    const line = computeRacingLine(track);
    const dry = spawn(track, 0);
    const wet = spawn(track, 0);
    wet.conditionGrip = 0.72;
    const a = new AIController(track, baseParams(), 2, line);
    const b = new AIController(track, baseParams({ wetSkill: 0.5 }), 2, line);
    const [rd] = simulate(track, [a], [dry], 25);
    // conditionGrip is reset by the physics step only through the Game, so pin it.
    const terrain = flatTerrain();
    let t = 0;
    let sum = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 25 * 60; i++) {
      t += dt;
      wet.conditionGrip = 0.72;
      wet.step(b.update(wet, [wet], dt, t, true), dt, terrain, track);
      sum += wet.speedF;
    }
    expect(sum / (25 * 60)).toBeLessThan(rd.avgSpeed);
  });

  it("reports what it is trying to do", () => {
    const track = new Track(trackById("sundown"));
    const line = computeRacingLine(track);
    const car = spawn(track, 0);
    const ai = new AIController(track, baseParams(), 3, line);
    simulate(track, [ai], [car], 5);
    expect(["cruise", "attack", "defend", "recover", "mistake"]).toContain(ai.mode);
  });

  it("switches to attack when it catches a slower car", () => {
    const track = new Track(trackById("sundown"));
    const line = computeRacingLine(track);
    const chaser = spawn(track, 0);
    const leader = spawn(track, 6);
    const ai = new AIController(track, baseParams({ aggression: 1 }), 4, line);
    const terrain = flatTerrain();
    const dt = 1 / 60;
    let sawAttack = false;
    let t = 0;
    for (let i = 0; i < 360; i++) {
      t += dt;
      chaser.speedF = Math.max(chaser.speedF, 30);
      leader.speedF = 18;
      const input = ai.update(chaser, [chaser, leader], dt, t, true);
      chaser.step(input, dt, terrain, track);
      leader.step({ throttle: 0.4, brake: 0, steer: 0, handbrake: false, boost: false }, dt, terrain, track);
      if (ai.mode === "attack") sawAttack = true;
    }
    expect(sawAttack).toBe(true);
  });

  it("makes occasional mistakes when consistency is low, and none when perfect", () => {
    const track = new Track(trackById("sundown"));
    const line = computeRacingLine(track);
    const sloppy = spawn(track, 0);
    const clean = spawn(track, 0);
    const a = new AIController(track, baseParams({ sloppiness: 1 }), 5, line);
    const b = new AIController(track, baseParams({ sloppiness: 0 }), 5, line);
    let mistakes = 0;
    const terrain = flatTerrain();
    const dt = 1 / 60;
    let t = 0;
    for (let i = 0; i < 90 * 60; i++) {
      t += dt;
      sloppy.step(a.update(sloppy, [sloppy], dt, t, true), dt, terrain, track);
      if (a.mode === "mistake") mistakes++;
      clean.step(b.update(clean, [clean], dt, t, true), dt, terrain, track);
      expect(b.mistakeTimer).toBe(0);
    }
    expect(mistakes).toBeGreaterThan(0);
  });

  it("holds still before the lights go out", () => {
    const track = new Track(trackById("sundown"));
    const car = spawn(track, 0);
    const ai = new AIController(track, baseParams(), 6, computeRacingLine(track));
    const terrain = flatTerrain();
    for (let i = 0; i < 180; i++) {
      const input = ai.update(car, [car], 1 / 60, i / 60, false);
      car.step(input, 1 / 60, terrain, track);
    }
    // Not racing yet: it may creep, but it must not be flying.
    expect(car.speedF).toBeLessThan(26);
  });
});
