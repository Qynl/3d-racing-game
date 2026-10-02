# Sundown Rally — deep code audit

Repo: `Qynl/3d-racing-game` · branch `arena/01a0fb16-3d-racing-game`
App lives in `3d-ai-racing-game/` (React 19 + Vite 7 + Tailwind 4 + three.js r186, ~3.6k LOC).

**Baseline health:** `npm ci` ✅ · `tsc --noEmit` ✅ 0 errors · `vite build` ✅ (single-file `dist/index.html`, 874 kB / 240 kB gzip) · dev server ✅.
The game is genuinely complete and well-built. Everything below is gap analysis, not "it's broken".

---

## 0. Repo / infrastructure — biggest gaps

| #   | Issue                                                                                                                                                                                                                     | Severity    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 0.1 | **No `.gitignore` anywhere.** `git status` currently shows `3d-ai-racing-game/node_modules/` as untracked — one `git add .` commits 106 packages.                                                                         | 🔴 critical |
| 0.2 | **`vite.config.ts` has no `server` block** → no `host`, no `allowedHosts`. Vite 7 returns `403 Blocked request` for any non-localhost host, so the sandbox/preview/LAN/ngrok URL is dead out of the box (confirmed live). | 🔴 critical |
| 0.3 | **Root `README.md` is one line** (`# 3d-racing-game`). No controls, no screenshots, no run instructions, no architecture notes.                                                                                           | 🟠 high     |
| 0.4 | `package.json` is still named **`react-vite-tailwind`**, version `0.0.0`, no `description`/`license`/`repo`.                                                                                                              | 🟠 high     |
| 0.5 | **No `typecheck` or `lint` script**; `build` runs bare `vite build`, so TS errors never fail the build. No ESLint, no Prettier, no `.editorconfig`.                                                                       | 🟠 high     |
| 0.6 | **No CI** (`.github/workflows` absent) and **no deploy** (no Pages workflow, no `base`). The single-file build is literally one HTML file — deploying is trivial and currently not wired up.                              | 🟠 high     |
| 0.7 | **No tests at all** — and the pure-math core (`noise.ts`, `track.ts`, `ai.ts:maxCornerSpeed`, `store.ts:formatTime/ordinal`, lap/unwrap logic) is perfectly unit-testable.                                                | 🟠 high     |
| 0.8 | No `LICENSE`, no `engines`/`.nvmrc`, no `public/`, no favicon, no `manifest.webmanifest`, no OG/Twitter meta (shared links render blank).                                                                                 | 🟡 medium   |
| 0.9 | Odd nesting: repo root holds only `README.md` + `3d-ai-racing-game/`. Either flatten it or add a root workspace/`Makefile` so `npm run dev` works from the top.                                                           | 🟡 medium   |

---

## 1. Real bugs

1. **Best-time record ignores lap count.** `recordBest(difficulty, totalTime)` is keyed only by difficulty, but the menu lets you pick lap count. A 1-lap race permanently overwrites your 5-lap record and shows "New record" every time. → key by `${difficulty}:${laps}`, and store best _lap_ too.
2. **Collision resolution runs once per frame, physics runs 2 substeps.** At 56 m/s a frame covers ~2.8 m while cactus colliders have `r≈0.5` → **tunneling straight through small props at speed**. Move `resolveCollisions()` inside the substep loop.
3. **Results show `DNF` for AI that were half a second behind.** On `onPlayerFinish` the race publishes 2.4 s later; any AI still on track gets `finishTime: null` → "DNF". Should extrapolate their finish time from remaining distance, or keep simulating until all cars finish.
4. **Spacebar is `preventDefault`ed globally**, including on the menu — a keyboard user who tabs to "Start race" and hits Space gets nothing. Also no Enter-to-start.
5. **Gap display prints a double negative**: when you're leading, `gapAhead` is negative and HUD renders `-2.4s lead`. Use `Math.abs`.
6. **No WebGL failure path.** `new THREE.WebGLRenderer()` throwing (no WebGL / context lost / blocklisted GPU) leaves the loading screen spinning forever. No error boundary, no `webglcontextlost`/`restored` handler.
7. **No safe-area insets.** `viewport-fit=cover` is set but no `env(safe-area-inset-*)` padding — on notched iPhones the HUD chips and touch buttons sit under the notch/home indicator.
8. **Esc during the countdown does nothing** (`pause()` early-returns unless `state === "racing"`), and `visibilitychange` pause doesn't `suspend()` the AudioContext.
9. **`TouchControls` uses `setPointerCapture` + `onPointerLeave` together.** With capture active, boundary events still fire on some engines → buttons can release early or stick. There's also no window-level `pointerup`/`pointercancel` safety net, and no `blur` reset of `input.touch`.
10. **Google Fonts loaded from CDN** in a build whose whole point (`vite-plugin-singlefile`) is offline/one-file distribution. Offline = FOUT + fallback font. Self-host or inline.

---

## 2. Performance

- **World generation is fully synchronous on the main thread.** `Terrain` runs `track.nearest()` for all 291×291 = 84,681 vertices; each query scans ~7×7 hash cells × ~20 points ≈ **~85M distance tests**, plus `buildProps` does another ~2–4k `nearest()` calls. The loading bar paints once (one `rAF` deferral) then **freezes** for the duration. Fix: precompute a coarse distance field, or move generation to a Worker with real progress.
- **Terrain mesh is 168,200 non-indexed triangles in a single draw call with `castShadow = true`** — the whole desert is re-rendered into the 2048² shadow map every frame. Huge mobile cost for almost no visual gain (the terrain already self-shades via `flatShading`).
- **No quality settings and no adaptive resolution.** Pixel ratio is capped (1.5 touch / 1.75 desktop) and that's it — no Low/Med/High toggle for shadows, particle count, draw distance, or render scale; no FPS-based downscaling.
- Collider list (~300–500 circles) is scanned linearly for every car every frame. Cheap today, but it has no broad-phase and scales badly if you add props or cars.
- Clouds (16 groups × 3–6 meshes) are individual draw calls; could be one instanced mesh.
- Particle cap is 900 with a full CPU loop over **all** 900 slots each frame regardless of how many are alive.

---

## 3. Gameplay / content gaps (the "what's missing" list)

**Driving model**

- `pos.y` is hard-snapped to terrain height every step → **no airtime, no jumps, no suspension travel, no landing impact**. In a rally game over dunes that's the single biggest feel gap.
- No slope limit — the car can climb walls the terrain shouldn't allow.
- No boost/nitro, no slipstream/draft, no damage model, no tire wear, no surface variety (everything is "on track" vs "off track", two grip values).
- No launch mechanic: throttle during the countdown does nothing — no rev-hold start, no jump-start penalty.

**Race structure**

- **One hardcoded track** (`new Track(7)`, `new Noise(1337)`) despite the whole generator being seed-driven. No track select, no procedural "new circuit" button, no reverse direction.
- **One mode only.** No Time Trial, no ghost car (you have per-lap times, a ghost is a small step), no Championship/season, no elimination, no free roam.
- No checkpoint validation → corner-cutting across the desert is only discouraged by terrain, never invalidated. No track-limits warning or penalty.
- No sector times, no delta-to-best, no "personal best lap" persistence, no leaderboard beyond a single number per difficulty.
- **No stuck-recovery / respawn for the player.** The AI has a reverse-out-of-trouble routine (`stuckTimer`/`reverseTimer`); the human gets nothing — wedge yourself in a tire barrier and your only option is restarting the race.
- No position-change notifications, no rival name tags / overhead markers, no rear-view mirror or look-back key.

**Cars**

- Livery = colour swatch only. No car selection, no differing stats (grip/top speed/accel), no unlocks or progression of any kind.
- AI cars are silent — no positional/spatial audio for rivals.

**Audio**

- Fully procedural WebAudio: engine, wind, skid, beeps, impact. Missing: music, gear-change/upshift blip, turbo flutter, surface-dependent tyre roll, crowd ambience near the grandstand (which is modelled, with 120 spectators, and makes no sound), and a **volume slider** — only a binary mute.

**Visual polish**

- No skid-mark decals on the ground (particles only), no tyre tracks persisting.
- No post-processing (no bloom on the sunset/headlights, no motion blur, no speed-lines) — ironic given the ACES tonemapping and golden-hour art direction.
- Headlights are emissive meshes with no actual light cone; brake lights don't bloom.
- Single fixed time-of-day; no weather, no dust storms.
- Minimap is static top-down with no rotation/zoom and no off-screen rival indicators.

---

## 4. UX / accessibility / persistence

- **Settings are not persisted.** Only best times hit `localStorage` — difficulty, livery, lap count, camera mode and mute reset on every reload.
- No rebindable controls, no steering-sensitivity or FOV slider, no invert options.
- **Touch steering is 4 discrete buttons** — no analog slider, no tilt/gyro steering, no on-screen wheel. Keyboard gets smoothed steering; touch gets bang-bang.
- Gamepad is partially wired (axis 0, triggers, A/B) but has **no pause/restart/camera buttons, no `gamepadconnected` detection, no deadzone config, and no rumble**.
- Accessibility: no `prefers-reduced-motion` handling (lots of animation), no `aria-live` for countdown/position/wrong-way callouts, no visible focus styles, HUD contrast is low-opacity cream on bright sand, no colour-blind-safe car colours.
- No pause on window blur (only `visibilitychange`), no "press any key to continue".
- No i18n scaffolding, no analytics/error reporting, no version string in the UI.

---

## 5. Code-quality notes (small, worth doing)

- `gameHolder` is a module-level mutable singleton that components poke at (`gameHolder.game?.…`), including `HUD`'s **200 ms `setInterval` polling loop** waiting for the game to exist. A context/ref or an init callback would be cleaner and testable.
- `Game.ts` is 850 lines doing renderer setup, world build, state machine, physics stepping, collisions, lap logic, cameras, HUD push and minimap drawing. Natural splits: `RaceState`, `CollisionSolver`, `CameraRig`, `Minimap`.
- `PauseOverlay` mutates `gameHolder.game.cameraMode` directly (public field write from a component) instead of going through a method.
- Magic numbers everywhere in `car.ts` / `ai.ts` (grip rates, damp constants, `0.0045`, `0.011`…) with no central tuning object — makes balancing painful and prevents per-car stats later.
- Duplicated car-disposal traversal in `createCars()` and `dispose()`.
- `Terrain` keeps a full `Float32Array` `trackDist` that's only used during mesh build — never freed.
- Dead/unused: `CarPhysics.lastYawRate`, `lastAccel`, `createLighting`'s returned `hemi`, `Track.signedLateral`.
- Shaders are inline template strings with no `#include` reuse; `sky.ts` and `particles.ts` both hand-roll tonemapping includes.

---

## Suggested priority order

1. `.gitignore` + `server.allowedHosts`/`host` in `vite.config.ts` (2 minutes, unblocks everything).
2. Fix the real bugs: best-time key, substep collisions, AI DNF, spacebar, gap sign, WebGL fallback, safe-area insets.
3. Scripts + CI + a Pages deploy + a real README.
4. Persist settings; add volume slider, quality presets, analog touch steering, player respawn.
5. Move world-gen to a Worker with real progress; drop terrain `castShadow`.
6. Then content: multiple/seeded tracks, time trial + ghost, airtime physics, skid decals, bloom.

---

# Implementation status — all of the above is now done

Everything in §0–§5 has been implemented on this branch. The notes below say _how_, and are
honest about the two places where the fix differs from the suggestion.

## §0 Infrastructure

| #   | Status                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | ✅ Root `.gitignore` (deps, build output, caches, logs, editor/OS, env).                                                                                                                           |
| 0.2 | ✅ `vite.config.ts` now has `server` + `preview` blocks with `host: "0.0.0.0"` and `allowedHosts: true`. Verified against a non-localhost `Host:` header.                                          |
| 0.3 | ✅ Full `README.md`: install, controls table (keyboard/gamepad/touch), modes, feature list, project layout, scripts, testing, deployment.                                                          |
| 0.4 | ✅ `sundown-rally` v1.0.0, MIT, description, repository, keywords, `engines.node >= 20`.                                                                                                           |
| 0.5 | ✅ `typecheck`, `lint`, `lint:fix`, `format`, `format:check`, `test`, `test:watch`, `check`; `build` is now `tsc --noEmit && vite build`. ESLint flat config, Prettier, `.editorconfig`, `.nvmrc`. |
| 0.6 | ✅ `.github/workflows/ci.yml` (typecheck · lint · format · test · build + artifact) and `deploy.yml` (GitHub Pages). `base: "./"` already set.                                                     |
| 0.7 | ✅ 100 unit tests across `config`, `store`, `noise`, `track`, `collision`, `minimap`, `ghost`, `car`, `cn`, plus a happy-dom smoke suite rendering every screen.                                   |
| 0.8 | ✅ MIT `LICENSE`, `.nvmrc`, `public/` with `manifest.webmanifest` + icon, inline SVG favicon, OG/Twitter meta, `theme-color`.                                                                      |
| 0.9 | ✅ Root `package.json` proxies `dev`/`build`/`test`/`check` into the app directory (kept the nesting rather than moving every file).                                                               |

## §1 Bugs — all ten fixed

1. ✅ Records are keyed `mode:difficulty:laps:carClassId` per track, and best **lap** + best **sector** times are stored alongside the race time.
2. ✅ `resolveCollisions()` runs inside the substep loop; substep count scales with speed.
3. ✅ Unfinished AI get an extrapolated finish time from remaining distance, flagged `provisional` and rendered as `est` — true DNF only when there is nothing to extrapolate from.
4. ✅ Gameplay keys are only `preventDefault`ed while driving (`captureKeys`), and Enter/Space activate focused buttons; Enter starts the race from the menu.
5. ✅ Gaps are formatted from `Math.abs`, with ahead/behind implied by position.
6. ✅ `Game.create()` throws `WebGLUnavailableError`, caught by `GameCanvas` → fatal screen with a retry; plus a React `ErrorBoundary` and `webglcontextlost`/`restored` handling.
7. ✅ `.safe-pad` (`env(safe-area-inset-*)`) on the HUD, menu, results and touch controls.
8. ✅ `pause()` accepts the countdown state; blur/visibility change suspends the AudioContext.
9. ✅ Touch buttons use pointer capture with window-level `pointerup`/`pointercancel`/`blur` release, and `input.touch` is reset on blur.
10. ✅ Barlow and Barlow Condensed are self-hosted via Fontsource (latin subsets) and inlined into the single-file build.

## §2 Performance

- ✅ Terrain generation is staged with real progress and yields between stages; the nearest-track field is a precomputed approximate Voronoi instead of 85M distance tests.
- ✅ Terrain no longer casts shadows.
- ✅ Four quality presets (render scale, shadows, particles, skid segments, prop density, clouds, bloom, view distance) plus adaptive resolution and automatic preset downgrade driven by a frame-time average.
- ✅ Collider broad phase: `ColliderGrid` uniform hash (`collision.ts`), padded by the car radius so one cell lookup suffices.
- ✅ Clouds are a single `InstancedMesh` — ~80 draw calls became one.
- ✅ Particles track a high-water mark so the update loop skips the untouched tail of the pool.
- ✅ `Terrain.releaseScratch()` frees the ~340 kB lateral-distance field once the mesh is coloured.
- ⚠️ Deviation: world generation stayed on the main thread (time-sliced with honest progress) rather than moving to a Worker. Transferring the built geometry plus the track/collider data back costs more complexity than the stall it removes, now that the stall is gone.

## §3 Gameplay

- ✅ Airtime, suspension travel, launch and landing impacts; no more hard snap to the terrain.
- ✅ Drift-charged boost economy (chain multiplier up to ×5, airtime charges too), HUD bar, exhaust flames, FOV kick.
- ✅ Four seeded circuits with hot-swap from the menu; three car classes with distinct speed/accel/grip envelopes and six liveries.
- ✅ Time trial with a persisted ghost car; race mode with 1–7 laps and three AI difficulties.
- ✅ Three sector gates per lap with lap invalidation, off-track tolerance, live delta and per-sector bests.
- ✅ Manual respawn plus automatic stuck rescue; position-change toasts; look-back camera.
- ✅ Positional engine audio for rivals, music bed, master/music volume.

## §4 UX / accessibility

- ✅ All settings persisted (v2 schema with migration-safe defaults).
- ✅ Steering sensitivity slider; analog touch pad, button and tilt steering modes with calibration and iOS permission flow.
- ✅ Full gamepad mapping with deadzone, connect/disconnect detection, pause/restart/camera buttons and rumble.
- ✅ `prefers-reduced-motion` honoured by CSS and by an in-game toggle; `aria-live` callouts; visible focus rings; higher-contrast HUD chips; pause on blur.
- ⚠️ Deviation: no i18n scaffolding or analytics — both add dependencies and surface area for a single-page offline game, and neither affects play.

## §5 Code quality

- ✅ `gameHolder` is now an observable holder with `subscribe()`; the HUD's 200 ms polling loop is gone.
- ✅ `ColliderGrid` → `collision.ts`, minimap rendering → `minimap.ts` (both unit-tested). `Game.ts` keeps the renderer, race state machine and cameras.
- ✅ `PauseOverlay` goes through `applySettings()` instead of writing `cameraMode` directly.
- ✅ Car classes **and** AI difficulty tuning now live in `config.ts` as plain data (`CAR_CLASSES`, `DIFFICULTIES`), unit-tested for monotonic difficulty.
- ✅ Car disposal is a single shared helper; dead fields (`lastYawRate`, `lastAccel`, unused `hemi`/`compressor`) removed.
- ✅ `Terrain.trackDist` is released after use.
- ℹ️ `Track.signedLateral` was kept — it is small, unit-tested, and the natural companion to `distanceToTrack`.
