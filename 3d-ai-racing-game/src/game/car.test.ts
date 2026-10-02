import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { CarPhysics, NEUTRAL_INPUT, REVERSE_MAX, tuningFromClass } from "./car";
import type { CarInput } from "./car";
import { carClassById, trackById } from "./config";
import type { Terrain } from "./terrain";
import { Track } from "./track";

/** Flat ground: enough for physics assertions without generating a heightmap. */
function flatTerrain(height: (x: number, z: number) => number = () => 0): Terrain {
  return {
    getHeight: (x: number, z: number) => height(x, z),
    getNormal: (_x: number, _z: number, out: THREE.Vector3) => out.set(0, 1, 0),
  } as unknown as Terrain;
}

/**
 * A straight, infinitely long stand-in for a circuit. Real tracks curve away
 * under a car driving in a straight line, which makes "on surface" flip
 * mid-test; here the lateral distance is whatever we say it is.
 */
function straightTrack(lateral = 0, halfWidth = 7.2): Track {
  return {
    halfWidth,
    count: 1600,
    nearestInWindow: () => 0,
    distanceToTrack: () => lateral,
    nearest: () => ({ index: 0, dist: lateral }),
    points: [new THREE.Vector3()],
    rights: [new THREE.Vector3(1, 0, 0)],
    tangents: [new THREE.Vector3(0, 0, 1)],
  } as unknown as Track;
}

const realTrack = new Track(trackById("sundown"));
const input = (patch: Partial<CarInput> = {}): CarInput => ({ ...NEUTRAL_INPUT, ...patch });

function freshCar(classId = "coyote", track: Track = straightTrack()) {
  const car = new CarPhysics(tuningFromClass(carClassById(classId)));
  car.place(0, 0, 0, flatTerrain(), track);
  car.resetRaceState();
  return car;
}

function drive(
  car: CarPhysics,
  inp: CarInput,
  seconds: number,
  track: Track = straightTrack(),
  terrain = flatTerrain(),
) {
  const dt = 1 / 120;
  for (let i = 0; i < Math.round(seconds / dt); i++) car.step(inp, dt, terrain, track);
}

describe("CarPhysics placement", () => {
  it("snaps to the ground, stopped and on the surface", () => {
    const car = freshCar();
    expect(car.pos.y).toBeCloseTo(0, 6);
    expect(car.speed).toBe(0);
    expect(car.grounded).toBe(true);
    expect(car.trackDist).toBeLessThan(1);
  });

  it("locates itself on a real circuit", () => {
    const car = new CarPhysics(tuningFromClass(carClassById("coyote")));
    const p = realTrack.points[250];
    car.place(p.x, p.z, realTrack.yawAt(250), flatTerrain(), realTrack);
    expect(car.trackIndex).toBe(250);
    expect(car.trackDist).toBeLessThan(0.5);
    expect(car.onTrack).toBe(true);
  });
});

describe("CarPhysics longitudinal", () => {
  let car: CarPhysics;
  beforeEach(() => {
    car = freshCar();
  });

  it("accelerates under throttle and settles near the class top speed", () => {
    drive(car, input({ throttle: 1 }), 3);
    const after3s = car.speedF;
    expect(after3s).toBeGreaterThan(10);
    drive(car, input({ throttle: 1 }), 25);
    expect(car.speedF).toBeGreaterThan(after3s);
    expect(car.speedF).toBeGreaterThan(car.tuning.topSpeed * 0.85);
    expect(car.speedF).toBeLessThanOrEqual(car.tuning.topSpeed * 1.11);
  });

  it("brakes harder than it coasts", () => {
    drive(car, input({ throttle: 1 }), 6);
    const v0 = car.speedF;
    const coasting = freshCar();
    coasting.yaw = car.yaw;
    coasting.speedF = v0;
    coasting.vel.copy(coasting.forward(new THREE.Vector3()).multiplyScalar(v0));
    drive(coasting, input(), 1);
    drive(car, input({ brake: 1 }), 1);
    expect(car.speedF).toBeLessThan(coasting.speedF);
    expect(car.speedF).toBeLessThan(v0);
  });

  it("reverses, but slowly and with a cap", () => {
    drive(car, input({ brake: 1 }), 8);
    expect(car.speedF).toBeLessThan(-1);
    expect(car.speedF).toBeGreaterThanOrEqual(-REVERSE_MAX - 0.001);
  });

  it("settles to a dead stop when coasting", () => {
    drive(car, input({ throttle: 1 }), 2);
    drive(car, input({ brake: 1 }), 1.2);
    drive(car, input(), 10);
    expect(Math.abs(car.speedF)).toBeLessThan(0.1);
  });

  it("is slower off the racing surface", () => {
    const onSurface = freshCar();
    drive(onSurface, input({ throttle: 1 }), 12);
    const offSurface = freshCar("coyote", straightTrack(40));
    drive(offSurface, input({ throttle: 1 }), 12, straightTrack(40));
    expect(onSurface.onTrack).toBe(true);
    expect(offSurface.onTrack).toBe(false);
    expect(offSurface.speedF).toBeLessThan(onSurface.speedF * 0.8);
  });
});

describe("car classes", () => {
  const terminal = (id: string, seconds: number) => {
    const c = freshCar(id);
    drive(c, input({ throttle: 1 }), seconds);
    return c.speedF;
  };

  it("make the Vulture faster flat out than the Jackrabbit", () => {
    expect(terminal("vulture", 40)).toBeGreaterThan(terminal("jackrabbit", 40));
  });

  it("make the Jackrabbit quicker off the line", () => {
    expect(terminal("jackrabbit", 2)).toBeGreaterThan(terminal("vulture", 2));
  });

  it("give every class a distinct terminal speed", () => {
    const speeds = ["coyote", "jackrabbit", "vulture"].map((id) => terminal(id, 40));
    expect(new Set(speeds.map((s) => Math.round(s))).size).toBe(3);
  });
});

describe("drift, boost and airtime", () => {
  /** Keeps feeding lateral velocity so the slide survives the grip model. */
  function slide(car: CarPhysics, seconds: number, track = straightTrack()) {
    const dt = 1 / 120;
    const rgt = new THREE.Vector3();
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      car.right(rgt);
      car.vel.addScaledVector(rgt, 12 - car.speedR);
      car.step(input({ throttle: 1, steer: 1, handbrake: true }), dt, flatTerrain(), track);
    }
  }

  it("earns drift score and banks boost when sliding", () => {
    const car = freshCar();
    drive(car, input({ throttle: 1 }), 5);
    slide(car, 2);
    expect(car.driftScore).toBeGreaterThan(0);
    expect(car.driftMultiplier).toBeGreaterThan(1);
    expect(car.boost).toBeGreaterThan(0);
    expect(car.boost).toBeLessThanOrEqual(1);
  });

  it("builds a bigger multiplier the longer the chain holds", () => {
    const short = freshCar();
    drive(short, input({ throttle: 1 }), 5);
    slide(short, 1);
    const long = freshCar();
    drive(long, input({ throttle: 1 }), 5);
    slide(long, 3);
    expect(long.driftMultiplier).toBeGreaterThan(short.driftMultiplier);
    expect(long.driftScore).toBeGreaterThan(short.driftScore * 2);
    expect(long.driftMultiplier).toBeLessThanOrEqual(5);
  });

  it("drops the chain shortly after the slide ends", () => {
    const car = freshCar();
    drive(car, input({ throttle: 1 }), 5);
    slide(car, 2);
    expect(car.driftMultiplier).toBeGreaterThan(1);
    drive(car, input({ throttle: 1 }), 1.5);
    expect(car.driftMultiplier).toBe(1);
  });

  it("drains the tank while boosting and never goes negative", () => {
    const car = freshCar();
    drive(car, input({ throttle: 1 }), 4);
    car.boost = 0.5;
    drive(car, input({ throttle: 1, boost: true }), 0.5);
    expect(car.boosting).toBe(true);
    expect(car.boost).toBeLessThan(0.5);
    drive(car, input({ throttle: 1, boost: true }), 10);
    expect(car.boost).toBe(0);
    expect(car.boosting).toBe(false);
  });

  it("goes faster with boost than without", () => {
    const plain = freshCar();
    drive(plain, input({ throttle: 1 }), 4);
    const boosted = freshCar();
    boosted.boost = 1;
    drive(boosted, input({ throttle: 1, boost: true }), 4);
    expect(boosted.speedF).toBeGreaterThan(plain.speedF);
  });

  it("never banks more than a full tank", () => {
    const car = freshCar();
    drive(car, input({ throttle: 1 }), 5);
    for (let i = 0; i < 6; i++) slide(car, 3);
    expect(car.boost).toBeLessThanOrEqual(1);
    expect(car.driftCharge).toBeLessThan(1);
  });

  it("launches off a crest, counts airtime and lands again", () => {
    const car = freshCar();
    drive(car, input({ throttle: 1 }), 6);
    const start = car.pos.clone();
    // a ramp that rises then falls away sharply ahead of the car
    const ramp = flatTerrain((x, z) => {
      const d = Math.hypot(x - start.x, z - start.z);
      if (d < 12) return d * 0.5;
      return Math.max(0, 6 - (d - 12) * 2);
    });
    drive(car, input({ throttle: 1 }), 2.5, straightTrack(), ramp);
    expect(car.totalAirTime).toBeGreaterThan(0);
    expect(car.boost + car.driftCharge).toBeGreaterThan(0);
    expect(car.grounded).toBe(true);
  });

  it("tracks the top speed seen during a race and clears it on reset", () => {
    const car = freshCar();
    drive(car, input({ throttle: 1 }), 8);
    expect(car.topSpeedSeen).toBeGreaterThan(10);
    car.resetRaceState();
    expect(car.topSpeedSeen).toBe(0);
    expect(car.driftScore).toBe(0);
    expect(car.boost).toBe(0);
  });
});

describe("steering", () => {
  it("does not turn when stationary but does at speed", () => {
    const parked = freshCar();
    const yaw0 = parked.yaw;
    drive(parked, input({ steer: 1 }), 1);
    expect(parked.yaw).toBeCloseTo(yaw0, 4);

    const moving = freshCar();
    drive(moving, input({ throttle: 1 }), 4);
    const yaw1 = moving.yaw;
    drive(moving, input({ throttle: 1, steer: 1 }), 1);
    expect(Math.abs(moving.yaw - yaw1)).toBeGreaterThan(0.2);
  });

  it("steers symmetrically left and right", () => {
    const left = freshCar();
    drive(left, input({ throttle: 1 }), 4);
    const l0 = left.yaw;
    drive(left, input({ throttle: 1, steer: -1 }), 0.5);
    const right = freshCar();
    drive(right, input({ throttle: 1 }), 4);
    const r0 = right.yaw;
    drive(right, input({ throttle: 1, steer: 1 }), 0.5);
    expect(left.yaw - l0).toBeCloseTo(-(right.yaw - r0), 3);
  });

  it("has weaker steering authority in the air", () => {
    const ground = freshCar();
    drive(ground, input({ throttle: 1 }), 4);
    const g0 = ground.yaw;
    drive(ground, input({ throttle: 1, steer: 1 }), 0.5);
    const groundDelta = Math.abs(ground.yaw - g0);

    const air = freshCar();
    drive(air, input({ throttle: 1 }), 4);
    air.grounded = false;
    air.velY = 8;
    const a0 = air.yaw;
    drive(
      air,
      input({ throttle: 1, steer: 1 }),
      0.5,
      straightTrack(),
      flatTerrain(() => -50),
    );
    const airDelta = Math.abs(air.yaw - a0);

    expect(airDelta).toBeLessThan(groundDelta);
  });
});
