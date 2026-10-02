# Sundown Rally

A 3D desert rally game that runs entirely in the browser. Procedural terrain, four seeded
circuits plus an infinite Wildcard generator, three car classes with a credits-and-upgrades
garage, full race replays with broadcast cameras, per-race objectives, weather that can turn
mid-race, tyre compounds that heat up and wear out, grids of
up to eight cars driven by seven named AI rivals with their own personalities, a knockout
mode where last place is eliminated on a timer, a four-round championship, drift-charged boost,
slipstreaming, launch control, damage, ghost cars and a full sector-timing system — built with React 19, Vite 7, Tailwind 4 and three.js. No game
engine, no downloaded assets: every mesh, texture and sound is generated at runtime.

The whole game ships as **one HTML file** (`dist/index.html`, ~1.2 MB / ~440 kB gzipped),
fonts and all. Drop it anywhere, open it offline, it works.

```bash
cd 3d-ai-racing-game
npm ci
npm run dev        # http://localhost:5173
```

> Node 20+ (see `.nvmrc`). From the repository root, `npm run dev`, `npm run build`,
> `npm test` and `npm run check` all proxy into `3d-ai-racing-game/`.

---

## Playing

Pick a circuit, a chassis and a livery, then race. Boost is not a pickup — you earn it by
driving well.

**The boost economy**

- Hold a slide and the drift meter fills; the longer the chain, the bigger the multiplier
  (up to ×5).
- Airtime charges the tank too, so taking the crest line pays.
- Every full meter banks a third of a tank. Spend it on the straights, or hold it for the
  last lap.

**Off the line**

The lights are a mini-game. Feather the throttle during the countdown to park the rev needle
in the green band, and you launch with extra drive. Bury it and you light up the tyres; fall
asleep and you watch the field disappear. The rivals wait for the lights too — each one has
its own reaction time.

**Running in traffic**

Tuck in behind a rival and the slipstream chip lights up: less drag, more top speed, a real
run into the next braking zone. Clout a cactus and the damage bar climbs — you lose top speed
and steering bite until the bodywork shakes itself back together. The outer 60 cm of every
circuit is a rumble strip: quick, noisy, and short on grip.

**Weather**

Clear, overcast, rain or sandstorm — or let the game roll the dice before each race. Rain
takes away a fifth of your grip and most of your braking, a sandstorm takes away the view,
and both pay considerably better. Rivals read the conditions too and slow their corner
entries to match.

**Credits and the garage**

Every race pays out: finishing position, distance, a clean-race bonus, drift score, air time
and records, multiplied by difficulty and weather. Spend the credits in the garage on four
upgrade lines per chassis — engine, tyres, brakes, nitrous, three levels each. Upgrades are
per car class, ride with you into every event, and are persisted.

**Clean laps**

Each lap is split into three timed sectors with a gate at each boundary. Miss a gate — or sit
off the surface for more than a couple of seconds — and the lap is invalidated: it still
counts for race position, but it will not become your record. The HUD shows your live delta
against your best lap and flashes each sector split as you cross it.

### Controls

| Action           | Keyboard           | Gamepad                   | Touch                        |
| ---------------- | ------------------ | ------------------------- | ---------------------------- |
| Steer            | `A`/`D` or `←`/`→` | Left stick (12% deadzone) | Analog pad, buttons, or tilt |
| Throttle / brake | `W`/`S` or `↑`/`↓` | `RT` / `LT`, or `A`       | On-screen pedals             |
| Handbrake        | `Space`            | `B`                       | Handbrake button             |
| Boost            | `Shift`            | `X` / `RB`                | Boost button                 |
| Look back        | `B` (hold)         | `LB` (hold)               | —                            |
| Camera           | `C`                | `Y`                       | Pause menu                   |
| Respawn          | `R`                | `Back`                    | Pause menu                   |
| Pause            | `Esc` / `P`        | `Start`                   | Pause button                 |
| Mute             | `M`                | —                         | Pause menu                   |

Every keyboard binding in that table can be remapped under **Options → Keyboard** (click a
binding, press a key); the defaults are one click away.

Stuck against a rock? Tap respawn — or just wait, the game rescues you automatically after a
few seconds of going nowhere. Gameplay keys are only swallowed while you are actually driving,
so menus stay fully keyboard-navigable.

### Modes

- **Race** — 1 to 7 AI rivals, 1 to 7 laps, three difficulty tiers (Rookie / Pro / Legend).
- **Knockout** — no lap limit. Thirty seconds in, and every twenty-two seconds after that,
  whoever is last on the road is eliminated. Survive to be the last car running.
- **Time trial** — you, the clock, and your own ghost replaying your best lap.
- **Season** — a four-round championship over every circuit, alternating direction each round,
  scoring 10 / 8 / 6 / 5 / 4 / 3 / 2 / 1. Standings are persisted, so you can finish the season tomorrow, and
  the title is worth a 1,500 cr bonus.

Any circuit can also be driven **in reverse**, and the **Wildcard** tile rolls a brand-new
circuit from a seed — reroll until you find one you like.

---

## What's in the box

**Driving** · Semi-arcade handling with real suspension travel, airtime, launch and landing
impacts, surface-dependent grip, slope influence, reverse, and per-class tuning.

**Cars** · Three classes with genuinely different envelopes — Coyote 2.4 (balanced),
Jackrabbit GT (grippy, quick off the line), Vulture V8 (huge top end, slides like a barge) —
plus six liveries and twelve buyable upgrade levels per chassis.

**Tracks** · Four hand-seeded circuits (Sundown Loop, Mesa Switchback, Dune Runner, Coyote
Canyon) generated from control-point radii through a centripetal Catmull-Rom spline, each with
its own width, terrain and prop scatter — plus reverse layouts and an endless Wildcard
generator that rolls shape, width and character from a seed.

**AI** · Every circuit gets a **solved racing line** — curvature-capped geometry relaxation
followed by a braking/traction speed plan — and the rivals drive it: they look a braking
distance ahead, hit the brakes before the corner, and use the full width on exit.

Seven named drivers carry traits (pace, aggression, consistency, racecraft, wet skill, boost
appetite) that are blended into the difficulty you picked, so the field spreads out and each
car behaves like a person: ATLAS never errs, MAGPIE dive-bombs, KESTREL thrives in the rain.
They attack on the side with room, defend the inside, use the tow, make mistakes and recover
from them, push harder on the last lap, and get called out on the HUD when they run wide.
A live timing tower shows the running order and gaps. When the player finishes, rivals still
on track get their finish time extrapolated instead of a bogus DNF.

**Tyres** · Three compounds (soft / medium / hard) trading grip against durability. Rubber
starts cold and slithery, comes into a working window, overheats if you abuse it, and wears
out over a race — a destroyed set costs about a fifth of its grip and a couple of seconds a
lap. Softs are a second a lap quicker early and gone by the end; hards are the other way
round. Rivals pick their own compound according to temperament and race length.

**Weather** · Fixed, rolled per race, or **Changeable** — a front moves through every 45-75
seconds, the sky and precipitation switch immediately and grip ramps across ten seconds, so
a dry line turns greasy while you are driving on it.

**Replays** · Every race is recorded — all cars, 20 Hz, interpolated on playback — and can be
reviewed from the results screen with four broadcast cameras (trackside posts that cut as the
car goes past, chase, helicopter, cockpit), scrubbing, 0.25×–2× speed and car-by-car
following. Playback opens at the busiest moment of the race, which is usually the one worth
watching. Space plays, arrows scrub, C cuts the camera, Tab follows the next car.

**Objectives** · Three goals per race configuration — win, podium, places gained, drift score,
air time, top speed, a clean race, tyre or damage limits, eliminations survived — each worth
credits, shown in the menu before you start and ticked off on the results screen. They are
seeded from the setup, so the goal you just missed is still there when you hit "Race again".

**Timing** · Three sectors per lap, live delta, per-sector personal bests, lap records and race
records keyed by track + mode + difficulty + lap count + car class, all persisted.

**Presentation** · Three times of day (golden hour, high noon, desert night with headlights
and a procedural starfield) crossed with four weather states, a start/finish gantry whose
five bulbs actually run the countdown, single-draw-call rain and blowing sand, wet-weather
spray, ACES tonemapping, optional bloom, dust, damage smoke and speed
lines, persistent skid-mark decals, floating rival name plates, a rotating minimap,
position-change toasts, and an SVG speedometer that doubles as a boost gauge.

**Audio** · Entirely procedural WebAudio: engine with gear steps, tyre roll, skid, wind,
impacts, countdown beeps and an adaptive music bed, on independent master and music buses.

**Accessibility** · Reduced-motion support (OS-level and in-game), a colour-blind-safe
palette, full key rebinding, an adjustable field of view, optional inverted steering,
`aria-live` callouts for countdown, position and warnings, visible focus rings, pause on blur,
adjustable steering sensitivity, and safe-area insets for notched phones.

**Performance** · Four quality presets plus adaptive resolution that downgrades automatically
when the frame budget slips, a precomputed terrain distance field, a spatial-hash broad phase
for collisions, substepped collision resolution (no tunnelling at 200 km/h), and staged world
generation that keeps the loading bar honest instead of freezing the tab.

---

## Project layout

```
3d-ai-racing-game/
├─ index.html                 meta, OG tags, inline SVG favicon
├─ vite.config.ts             single-file build, preview host allowlist, vitest config
├─ public/                    manifest + icon
└─ src/
   ├─ main.tsx                entry, self-hosted fonts, error boundary
   ├─ App.tsx                 screen routing (loading / menu / race / pause / results / fatal)
   ├─ index.css               Tailwind theme tokens, panels, animations
   ├─ components/             Menu, HUD, PauseOverlay, Results, TouchControls, Toasts, ui
   ├─ utils/cn.ts             classname joiner
   └─ game/
      ├─ Game.ts              renderer, world build, race state machine, cameras, minimap
      ├─ config.ts            tracks, car classes, quality presets  (pure data)
      ├─ store.ts             zustand store, settings + records persistence, formatting
      ├─ track.ts             spline circuit, spatial hash, sectors, ribbon + racing line
      ├─ terrain.ts           staged heightmap, distance field, mesh
      ├─ car.ts               CarPhysics + procedural car mesh
      ├─ ai.ts                rival drivers
      ├─ ghost.ts             lap recorder / player / localStorage codec
      ├─ input.ts             keyboard, gamepad, touch, tilt
      ├─ collision.ts         uniform-grid broad phase
      ├─ minimap.ts           canvas minimap renderer
      ├─ audio.ts             procedural engine + music buses
      ├─ particles.ts, skidmarks.ts, props.ts, sky.ts, noise.ts, async.ts
      └─ *.test.ts            unit tests
```

The split is deliberate: everything under `src/game/` that is pure maths or data
(`config`, `store`, `noise`, `track`, `car`, `ghost`) has no DOM or WebGL dependency, which is
why it can be unit-tested in a plain Node environment.

## Scripts

| Command              | What it does                                       |
| -------------------- | -------------------------------------------------- |
| `npm run dev`        | Vite dev server on `0.0.0.0:5173`                  |
| `npm run build`      | `tsc --noEmit` then a single-file production build |
| `npm run build:fast` | Build without the typecheck gate                   |
| `npm run preview`    | Serve the built file                               |
| `npm run typecheck`  | `tsc --noEmit`                                     |
| `npm run lint`       | ESLint flat config (TS + react-hooks)              |
| `npm run format`     | Prettier write (`format:check` in CI)              |
| `npm test`           | Vitest (218 tests)                                 |
| `npm run check`      | typecheck + lint + test                            |

## Testing

```bash
cd 3d-ai-racing-game && npm test
```

Coverage focuses on the parts where a regression is silent rather than visible: circuit
geometry and both spatial indexes (brute-force cross-checked), the physics envelope (terminal
speed, braking, reverse cap, off-surface penalty, class differentiation, drift chaining, boost
drain, airtime), ghost record/replay round-trips, record keying, and time formatting. A
happy-dom smoke suite renders every screen — menu, HUD, countdown, results, pause, toasts,
loading and the WebGL-failure fallback — to catch render-time crashes the type checker can't.

## Deployment

`.github/workflows/ci.yml` runs typecheck, lint, format check, tests and a build on every push
and pull request. `.github/workflows/deploy.yml` publishes `dist/` to GitHub Pages on pushes to
`main` — enable Pages with the "GitHub Actions" source in repository settings first. The build
uses `base: "./"`, so the output also works from a subdirectory, a file:// URL or an itch.io zip.

## Credits

Built on [three.js](https://threejs.org), [React](https://react.dev), [Vite](https://vite.dev),
[Tailwind CSS](https://tailwindcss.com), [zustand](https://zustand-demo.pmnd.rs),
[simplex-noise](https://github.com/jwagner/simplex-noise.js) and
[Barlow](https://fonts.google.com/specimen/Barlow) (self-hosted via Fontsource).

See [`AUDIT.md`](AUDIT.md) for the original code audit this version was built against.

## License

[MIT](LICENSE)
