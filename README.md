# Sundown Rally

A 3D desert rally game that runs entirely in the browser. Procedural terrain, four seeded
circuits, three car classes, three AI rivals, drift-charged boost, ghost cars and a full
sector-timing system — built with React 19, Vite 7, Tailwind 4 and three.js. No game engine,
no downloaded assets: every mesh, texture and sound is generated at runtime.

The whole game ships as **one HTML file** (`dist/index.html`, ~1.2 MB / ~425 kB gzipped),
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

Stuck against a rock? Tap respawn — or just wait, the game rescues you automatically after a
few seconds of going nowhere. Gameplay keys are only swallowed while you are actually driving,
so menus stay fully keyboard-navigable.

### Modes

- **Race** — three AI rivals, 1 to 7 laps, three difficulty tiers (Rookie / Pro / Legend).
- **Time trial** — you, the clock, and your own ghost replaying your best lap.

---

## What's in the box

**Driving** · Semi-arcade handling with real suspension travel, airtime, launch and landing
impacts, surface-dependent grip, slope influence, reverse, and per-class tuning.

**Cars** · Three classes with genuinely different envelopes — Coyote 2.4 (balanced),
Jackrabbit GT (grippy, quick off the line), Vulture V8 (huge top end, slides like a barge) —
plus six liveries.

**Tracks** · Four hand-seeded circuits (Sundown Loop, Mesa Switchback, Dune Runner, Coyote
Canyon) generated from control-point radii through a centripetal Catmull-Rom spline, each with
its own width, terrain and prop scatter.

**AI** · Corner-speed-aware racing line with per-difficulty aggression, overtaking offsets,
mistakes, stuck recovery, and positional engine audio. When the player finishes, rivals still
on track get their finish time extrapolated instead of a bogus DNF.

**Timing** · Three sectors per lap, live delta, per-sector personal bests, lap records and race
records keyed by track + mode + difficulty + lap count + car class, all persisted.

**Presentation** · Golden-hour sky with ACES tonemapping, optional bloom, dust and smoke
particles, persistent skid-mark decals, a rotating minimap, position-change toasts, and an
SVG speedometer that doubles as a boost gauge.

**Audio** · Entirely procedural WebAudio: engine with gear steps, tyre roll, skid, wind,
impacts, countdown beeps and an adaptive music bed, on independent master and music buses.

**Accessibility** · Reduced-motion support (OS-level and in-game), `aria-live` callouts for
countdown, position and warnings, visible focus rings, pause on blur, adjustable steering
sensitivity, and safe-area insets for notched phones.

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
| `npm test`           | Vitest (102 tests)                                 |
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
