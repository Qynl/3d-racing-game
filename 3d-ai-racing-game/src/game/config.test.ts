import { describe, expect, it } from "vitest";
import {
  BINDABLE,
  CAR_CLASSES,
  CAR_COLORS,
  DEFAULT_KEYBINDS,
  DIFFICULTIES,
  NO_UPGRADES,
  QUALITY_ORDER,
  QUALITY_PRESETS,
  SECTOR_COUNT,
  TRACKS,
  UPGRADES,
  UPGRADE_MAX,
  carClassById,
  keyLabel,
  normaliseUpgrades,
  trackById,
  upgradeCost,
  upgradeProgress,
} from "./config";
import { WEATHERS, WEATHER_ORDER } from "./sky";

describe("tracks", () => {
  it("ships four circuits with unique ids and seeds", () => {
    expect(TRACKS).toHaveLength(4);
    expect(new Set(TRACKS.map((t) => t.id)).size).toBe(4);
    expect(new Set(TRACKS.map((t) => t.seed)).size).toBe(4);
  });

  it("has sane geometry for every circuit", () => {
    for (const t of TRACKS) {
      expect(t.radii.length).toBeGreaterThanOrEqual(8);
      expect(t.halfWidth).toBeGreaterThan(5);
      expect(t.halfWidth).toBeLessThan(12);
      // Must fit inside the world so the terrain always surrounds the ribbon.
      const maxR = Math.max(...t.radii) * Math.max(...t.stretch);
      expect(maxR).toBeLessThan(260);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.subtitle.length).toBeGreaterThan(0);
    }
  });

  it("falls back to the first track for unknown ids", () => {
    expect(trackById("nope").id).toBe(TRACKS[0].id);
    expect(trackById("canyon").id).toBe("canyon");
  });
});

describe("car classes", () => {
  it("has three distinct, balanced classes", () => {
    expect(CAR_CLASSES).toHaveLength(3);
    expect(new Set(CAR_CLASSES.map((c) => c.id)).size).toBe(3);
    for (const c of CAR_CLASSES) {
      expect(c.topSpeed).toBeGreaterThan(40);
      expect(c.topSpeed).toBeLessThan(80);
      expect(c.boostTank).toBeGreaterThan(0);
      for (const v of Object.values(c.bars)) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("trades speed against grip", () => {
    const fastest = [...CAR_CLASSES].sort((a, b) => b.topSpeed - a.topSpeed)[0];
    const grippiest = [...CAR_CLASSES].sort((a, b) => b.grip - a.grip)[0];
    expect(fastest.id).not.toBe(grippiest.id);
  });

  it("falls back to the first class for unknown ids", () => {
    expect(carClassById("nope").id).toBe(CAR_CLASSES[0].id);
  });
});

describe("liveries", () => {
  it("are valid 24-bit colours with names", () => {
    expect(CAR_COLORS.length).toBeGreaterThanOrEqual(4);
    for (const c of CAR_COLORS) {
      expect(c.hex).toBeGreaterThanOrEqual(0);
      expect(c.hex).toBeLessThanOrEqual(0xffffff);
      expect(c.name).toBeTruthy();
    }
  });
});

describe("quality presets", () => {
  it("covers every id in order", () => {
    expect(QUALITY_ORDER).toEqual(["low", "medium", "high", "ultra"]);
    for (const id of QUALITY_ORDER) expect(QUALITY_PRESETS[id].id).toBe(id);
  });

  it("increases cost monotonically", () => {
    const presets = QUALITY_ORDER.map((id) => QUALITY_PRESETS[id]);
    for (let i = 1; i < presets.length; i++) {
      expect(presets[i].maxPixelRatio).toBeGreaterThanOrEqual(presets[i - 1].maxPixelRatio);
      expect(presets[i].shadowMapSize).toBeGreaterThanOrEqual(presets[i - 1].shadowMapSize);
      expect(presets[i].particles).toBeGreaterThanOrEqual(presets[i - 1].particles);
    }
    expect(QUALITY_PRESETS.low.bloom).toBe(false);
    expect(QUALITY_PRESETS.ultra.bloom).toBe(true);
  });
});

describe("sectors", () => {
  it("uses three timing sectors", () => {
    expect(SECTOR_COUNT).toBe(3);
  });
});

describe("AI difficulties", () => {
  const order = ["rookie", "pro", "legend"] as const;

  it("gets harder in every dimension", () => {
    for (let i = 1; i < order.length; i++) {
      const prev = DIFFICULTIES[order[i - 1]];
      const cur = DIFFICULTIES[order[i]];
      expect(cur.topSpeedFactor).toBeGreaterThan(prev.topSpeedFactor);
      expect(cur.cornerGrip).toBeGreaterThan(prev.cornerGrip);
      expect(cur.sloppiness).toBeLessThan(prev.sloppiness);
      expect(cur.boostUse).toBeGreaterThan(prev.boostUse);
      // less rubber-banding help the harder it gets
      expect(cur.rubber).toBeLessThan(prev.rubber);
    }
  });

  it("keeps every value inside a sane range", () => {
    for (const id of order) {
      const d = DIFFICULTIES[id];
      expect(d.id).toBe(id);
      expect(d.topSpeedFactor).toBeGreaterThan(0.5);
      expect(d.topSpeedFactor).toBeLessThanOrEqual(1);
      expect(d.cornerGrip).toBeLessThan(1);
      expect(d.boostUse).toBeGreaterThanOrEqual(0);
      expect(d.boostUse).toBeLessThanOrEqual(1);
      expect(d.sloppiness).toBeGreaterThanOrEqual(0);
      expect(d.lookahead).toBeGreaterThan(0.2);
      expect(d.name.length).toBeGreaterThan(0);
    }
  });
});

describe("key bindings", () => {
  it("binds every listed action by default", () => {
    for (const b of BINDABLE) {
      expect(DEFAULT_KEYBINDS[b.id].length).toBeGreaterThan(0);
      expect(b.label.length).toBeGreaterThan(2);
    }
    expect(Object.keys(DEFAULT_KEYBINDS).sort()).toEqual(BINDABLE.map((b) => b.id).sort());
  });

  it("never binds one key to two driving actions", () => {
    const seen = new Set<string>();
    for (const b of BINDABLE) {
      for (const k of DEFAULT_KEYBINDS[b.id]) {
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
  });

  it("prints human-readable key names", () => {
    expect(keyLabel(" ")).toBe("Space");
    expect(keyLabel("arrowleft")).toBe("←");
    expect(keyLabel("w")).toBe("W");
    expect(keyLabel("escape")).toBe("Esc");
    expect(keyLabel("shift")).toBe("Shift");
  });
});

describe("garage upgrades", () => {
  it("prices every level and reports maxed parts", () => {
    for (const u of UPGRADES) {
      expect(u.costs.length).toBe(UPGRADE_MAX);
      for (let i = 1; i < u.costs.length; i++) expect(u.costs[i]).toBeGreaterThan(u.costs[i - 1]);
      expect(upgradeCost(u.id, 0)).toBe(u.costs[0]);
      expect(upgradeCost(u.id, UPGRADE_MAX)).toBeNull();
    }
  });

  it("clamps corrupt stored levels", () => {
    const out = normaliseUpgrades({ engine: 99, tyres: -4, brakes: 1.7, nitrous: NaN } as never);
    expect(out).toEqual({ engine: UPGRADE_MAX, tyres: 0, brakes: 1, nitrous: 0 });
    expect(normaliseUpgrades(undefined)).toEqual(NO_UPGRADES);
  });

  it("reports progress across the whole tree", () => {
    expect(upgradeProgress(NO_UPGRADES)).toBe(0);
    const maxed = Object.fromEntries(UPGRADES.map((u) => [u.id, UPGRADE_MAX]));
    expect(upgradeProgress(maxed as never)).toBe(1);
  });
});

describe("weather table", () => {
  it("covers every weather id with sane numbers", () => {
    for (const id of WEATHER_ORDER) {
      const w = WEATHERS[id];
      expect(w.id).toBe(id);
      expect(w.grip).toBeGreaterThan(0.6);
      expect(w.grip).toBeLessThanOrEqual(1);
      expect(w.fogScale).toBeGreaterThan(0.1);
      expect(w.payout).toBeGreaterThanOrEqual(1);
    }
  });

  it("pays more the worse the conditions get", () => {
    expect(WEATHERS.rain.payout).toBeGreaterThan(WEATHERS.clear.payout);
    expect(WEATHERS.sandstorm.grip).toBeLessThan(WEATHERS.clear.grip);
    expect(WEATHERS.rain.grip).toBeLessThan(WEATHERS.overcast.grip);
  });
});
