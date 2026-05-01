# 🚗💥 CURSED ROAD — Instant Browser Survival Simulator
### Build Plan & Technical Specification

---

## Concept Summary

**"Cursed Road"** is a fast-loading, browser-based 3D survival car game.  
You pick a car → the road tries to kill you → you get a survival score → you share it → you try again.  

**Tagline:** *"The road is not built for you."*  
**Core loop:** ~60–90 seconds per run. Instant reload. Obsessively replayable.  
**Positioning:** Viral browser game. NOT a driving sim. NOT BeamNG.

## Run locally

```bash
npm install
npm run dev
```

Open **`http://127.0.0.1:5174/`** (dev is pinned to this port). If it says the port is in use, stop the other Vite process or run `lsof -ti:5174 | xargs kill` on macOS/Linux.

Production preview (`http://127.0.0.1:4174/`):

```bash
npm run preview:build
```

If **`npm run dev`** fails because the port never frees: stop other Vite terminals, then on macOS/Linux `lsof -ti:5174 | xargs kill`.

## 3D model credits (CC-BY, Poly Pizza)

| In-game car | GLB filename | Model source | Attribution |
|---|---|---|---|
| Hatchback | `car-hatchback.glb` | Taxi | Taxi by Poly by Google, [CC-BY](https://creativecommons.org/licenses/by/4.0/), via Poly Pizza |
| Truck | `car-truck.glb` | Truck | Truck by KolosStudios, [CC-BY](https://creativecommons.org/licenses/by/4.0/), via Poly Pizza |
| SUV | `car-suv.glb` | — | (your model) |
| Sports Car | `car-sports.glb` | — | (your model) |

All GLB files live in **`public/assets/models/`**. The game loads them after spawning a procedural placeholder. Rickshaw stays procedural (no `.glb` configured).

**Audio:** 
- **Background music:** Garage Fuzz (60s loop) plays during runs
- **Engine + SFX:** Howler-based engine sound scales with speed; crash/oil/shock/win/lose SFX on events
- All files: **`public/assets/audio/`**

## Vibe Jam 2026 Portal Integration

This game is part of the **Vibe Jam 2026** webring — players can portal between games while keeping continuity fields.

- **Exit portal (green):** Drive into the green **"VIBE JAM PORTAL"** ahead on the roadside (~850m) to continue to the hub at `vibejam.cc/portal/2026`.
- **Entry portal (red):** If you arrived via `?portal=true` **and** a `ref=` back-link is present, a red **"BACK TO LAST GAME"** portal appears behind spawn; drive into it to return to that game.

**Query parameters forwarded (when applicable):** `username`, `color`, `speed`, `ref`, `avatar_url`, `team`, `hp`, `speed_x` / `speed_y` / `speed_z`, `rotation_x` / `rotation_y` / `rotation_z`, plus other keys from the incoming URL (excluding `ref`/`portal` replacements).

Opening the game with `?portal=true` auto-starts a run (menu skipped); optional `speed` seeds forward velocity.

---

## Stack Decision

| Layer | Technology | Why |
|---|---|---|
| 3D Rendering | **Three.js** (plain, no R3F) | Lightest bundle, direct control, no React overhead |
| Physics | **cannon-es** | Smaller than Rapier.js, simpler API, sufficient for arcade physics |
| Models | **GLB + Draco compression** | 70–85% size reduction vs raw GLTF |
| Audio | **Howler.js** (lazy-loaded) | Lightweight, loaded after first render |
| Build | **Vite** | Sub-second HMR, excellent tree-shaking, ESM-native |
| Hosting | **Cloudflare Pages / Vercel** | Global CDN edge delivery, free tier |

**No React. No big framework. Plain JS modules.**  
First paint target: **< 1.5 seconds** on 4G.  
First playable target: **< 3 seconds** on 4G.

---

## Phase 0 — Project Scaffold (Day 1)

```
cursed-road/
├── index.html           # Single entry point, minimal shell
├── main.js              # Boot: scene, camera, renderer
├── src/
│   ├── game.js          # Game state machine
│   ├── physics.js       # cannon-es world setup
│   ├── track.js         # Procedural road + obstacles
│   ├── cars/
│   │   ├── carBase.js   # Shared car class
│   │   ├── hatchback.js
│   │   ├── suv.js
│   │   └── sports.js    # More loaded lazily
│   ├── obstacles/
│   │   ├── pothole.js
│   │   ├── ramp.js
│   │   ├── oilPatch.js
│   │   └── divider.js
│   ├── ui/
│   │   ├── hud.js       # In-game speedometer, damage bar
│   │   ├── carPicker.js # Car selection screen
│   │   └── results.js   # End screen + score
│   └── utils/
│       ├── loader.js    # GLTF/Draco loader wrapper
│       └── survival.js  # Survival score calculator
├── assets/
│   ├── models/          # Draco-compressed GLBs
│   └── audio/           # OGG (not MP3, smaller)
└── vite.config.js
```

---

## Phase 1 — The Skeleton (Days 2–3)

**Goal: Anything renders on screen fast.**

### 1.1 — Renderer Bootstrap (`main.js`)
- Create `WebGLRenderer` with `antialias: false` initially (enable later on desktop)
- Use `requestAnimationFrame` loop immediately
- `PixelRatio` capped at `1.5` (never `window.devicePixelRatio` raw — mobile killer)
- Fog: `THREE.FogExp2` — free depth, no texture cost

### 1.2 — Procedural Road (`track.js`)
- Road = flat `PlaneGeometry` segments, generated on the fly
- No road textures initially — use `MeshLambertMaterial` (cheaper than Standard)
- Road is **not a big map** — it's a ~800m corridor that streams ahead of the car
- Segments outside camera frustum are removed and recycled

### 1.3 — Physics World (`physics.js`)
- cannon-es world with gravity `-9.82`
- Fixed timestep `1/60`
- Road segments = static `Box` bodies
- Car = compound body (chassis box + 4 sphere wheels)
- No mesh-to-physics sync for obstacles — simple proxy shapes

### 1.4 — Camera
- Chase camera: lerp behind car, slight lag
- On big impact: camera shake (`noise * intensity * decayFactor`)
- On rollover: camera tries to stay upright (lerp to world-up)

---

## Phase 2 — Cars (Days 4–5)

**Start with 3 procedural (no models), add GLB models lazily.**

### Car Stats Table

| Car | Mass | Suspension | Speed | Ground Clear | Flip Risk | Personality |
|---|---|---|---|---|---|---|
| Hatchback | 900kg | Soft | 140kmh | Low | High | "Glass cannon" |
| SUV | 1800kg | Medium | 110kmh | High | Medium | "Tank that survives" |
| Sports Car | 1100kg | Stiff | 200kmh | Very low | Medium | "Fast but doomed on gaps" |
| Truck | 3000kg | Hard | 90kmh | High | Low | "Slow unstoppable boulder" |
| Auto-Rickshaw* | 400kg | None | 80kmh | Low | Extreme | "Comedy chaos mode" |

*Unlocked after first run

### Car Class Interface
```javascript
class CarBase {
  constructor(world, scene, config) {}
  
  get chassisBody() {}       // cannon-es Body
  get mesh() {}              // Three.js Group
  
  applyEngineForce(force) {}
  applyBrake(force) {}
  steer(angle) {}
  
  update(dt) {}              // sync mesh to physics
  getDamage() {}             // 0–100
  getIntegrity() {}          // structural health
  dispose() {}
}
```

### Damage System (Fake but Fun)
No real mesh deformation. Use:
- `damagePercent` number tracked per car
- On big impact: bump `damagePercent` by `impactForce * carDamageMultiplier`
- Visuals: shader `uniform float damage` → tint mesh red progressively
- At 100% damage: car stops, end screen triggers

---

## Phase 3 — Obstacles (Days 6–7)

Each obstacle is a **module** with:
1. `spawn(track, position)` — add to scene + physics
2. `update(dt)` — animate if needed  
3. `onCarContact(car, contactInfo)` — apply damage/force
4. `dispose()` — clean up

### Obstacle Catalog (MVP)

#### 🕳️ Pothole / Gap
- Remove road segment, leave physics gap
- Cars with low ground clearance (sports) crash hard
- SUV/Truck may bridge it
- Survival effect: `impactForce * groundClearanceFactor`

#### ⚡ Speed Shock Zone
- Trigger volume: invisible Box3
- On entry: `car.velocity.z = 55` (200 km/h in m/s)
- Player must steer to avoid roadside trees/dividers
- HUD shows "SPEED SHOCK!" with electric effect

#### 🛢️ Oil Patch
- Reduce friction coefficient on that road segment (`friction: 0.01`)
- Car slides, steering becomes slow to respond
- Visual: dark wet patch with shader shimmer

#### 🪵 Broken Bridge
- Road segment that collapses 1.5s after car touches it
- cannon-es body becomes dynamic (falls with gravity)
- Must accelerate through fast enough

#### 🌳 Tree / Divider
- Static obstacles near road edge
- Low `mass` for trees (they move), concrete `mass = 0` for dividers
- Trees: soft collision, partial damage
- Dividers: hard stop, high damage

#### 🚀 Jump Ramp
- Angled plane that launches car airborne
- Landing angle tracked: flat landing = low damage, nose-dive = high damage
- Airtime tracked for score bonus

---

## Phase 4 — Game Modes (Day 8)

**3 modes only at launch.**

### Mode 1: Pothole Gauntlet
- Road: 5 increasingly bad gaps + random bumps
- Win condition: reach end with < 80% damage
- Time limit: none (pure skill)

### Mode 2: Speed Shock
- Road: straight, obstacles on sides
- Random speed shocks every 8–15 seconds
- Win condition: survive 90 seconds

### Mode 3: Obstacle Road
- Mixed: oil patches, trees, dividers, broken lane
- Win condition: cover 500m without cabin damage > 50%

---

## Phase 5 — Survival Score System (`survival.js`)

```javascript
function calculateSurvival(runData) {
  const {
    impactForces,      // array of force magnitudes
    rolloverCount,
    topSpeedAtImpact,
    landingAngles,     // degrees from flat
    cabinDamage,       // 0–100
    distanceSurvived,
    timeAlive,
  } = runData;

  // Weighted survival formula
  const rawSurvival = 100
    - (cabinDamage * 0.5)
    - (rolloverCount * 12)
    - (landingAngles.reduce((a,b) => a + b, 0) * 0.3)
    - (impactForces.filter(f => f > 50).length * 8);

  const passengerSurvival = Math.max(0, Math.min(100, rawSurvival));
  const controlScore = Math.round((distanceSurvived / 800) * 100);
  const carDamage = Math.round(cabinDamage);

  const status = passengerSurvival > 80 ? "Perfectly Fine 😎"
    : passengerSurvival > 60 ? "Shaken But Alive 😰"
    : passengerSurvival > 40 ? "Barely Conscious 😵"
    : passengerSurvival > 20 ? "Needs Hospital 🏥"
    : "Flatlined 💀";

  return { passengerSurvival, carDamage, controlScore, distanceSurvived, status };
}
```

### Results Screen
```
╔════════════════════════════╗
║   CURSED ROAD — RUN OVER   ║
╠════════════════════════════╣
║  🚗 Car Damage:    73%     ║
║  🧍 Passenger:     42%     ║
║  🎮 Control Score: 61/100  ║
║  📏 Distance:      423m    ║
║  📊 Status: BARELY ALIVE   ║
╠════════════════════════════╣
║  [TRY AGAIN]  [SHARE]      ║
╚════════════════════════════╝
```

Share text (auto-generated):
> "I survived 423m in a hatchback on Cursed Road. Passenger: 42% alive. Can you beat it? [link]"

---

## Phase 6 — Performance & Load Time (Critical)

### Loading Strategy

```
Frame 0 (0ms):     HTML shell renders. Black screen + logo.
Frame 1 (~100ms):  Three.js + cannon-es init. Road segments drawn (procedural, no assets).
Frame 2 (~300ms):  First car (default hatchback) spawned as BOX placeholder.
Frame 3 (~800ms):  GLB for hatchback loaded (< 150KB with Draco).
Background:        Other car models lazy-loaded silently.
Background:        Audio loaded after 3s delay.
```

### Asset Budget

| Asset | Max Size |
|---|---|
| Hatchback GLB (Draco) | 120 KB |
| SUV GLB (Draco) | 140 KB |
| Sports Car GLB (Draco) | 130 KB |
| Each obstacle GLB | < 30 KB |
| Audio per clip (OGG) | < 80 KB |
| **Total first load** | **< 500 KB** |

### Three.js Optimizations
- `renderer.shadowMap.enabled = false` (MVP — add later)
- `MeshLambertMaterial` everywhere except car paint (one `MeshStandardMaterial`)
- Geometry instancing for trees (one `InstancedMesh`, many trees)
- Dispose obstacles when > 200m behind car
- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))`

### Physics Optimizations
- Max 30 active cannon-es bodies at once
- Road segments: `type: Body.STATIC` (no physics update cost)
- Broadphase: `SAPBroadphase` (faster than naive for linear roads)
- `allowSleep: true` on all dynamic bodies

---

## Phase 7 — UI & HUD (`ui/`)

### HUD (in-game)
- Speed: analog-style arc, updates every frame
- Damage bar: top-right, fills red
- Mode name: top-left
- Distance counter: bottom center
- No complex DOM — single `<canvas>` overlay drawn with 2D context

### Car Picker Screen
- 3 cards horizontally scrollable
- Each card: car silhouette (SVG), 3 stat bars (Speed, Durability, Stability)
- "START" button
- No animations needed — keep it instant

### Results Screen
- Full screen overlay
- ASCII-box style result card (matches game's chaotic energy)
- "Share" button copies text to clipboard
- Local high score stored in `localStorage`

---

## Build Milestones

| Day | Milestone |
|---|---|
| 1 | Vite project up, Three.js renders a spinning cube |
| 2 | Procedural road renders, camera follows a moving box |
| 3 | cannon-es integrated, car drives on road with physics |
| 4 | 3 cars with meaningfully different physics feel |
| 5 | 3 obstacle types working with damage callbacks |
| 6 | Survival score system + results screen |
| 7 | 3 game modes switchable from car picker |
| 8 | GLB car models replace boxes, Draco compressed |
| 9 | HUD polish, camera shake, speed shock visual |
| 10 | Performance audit, load time verified < 3s on 4G |
| 11 | Share mechanic, local leaderboard |
| 12 | Buffer: bugfix, balance, feel |

---

## Post-MVP Roadmap (only after MVP ships)

1. **Daily Challenge** — same seed for all players, global leaderboard
2. **Ghost Replay** — record position keyframes, replay as transparent ghost
3. **Auto-Sim Mode** — "Which car survives this obstacle?" — watch all 5 cars attempt it
4. **Custom Track Builder** — drag obstacles onto a road template
5. **Car Durability Ranking** — after 10 runs with each car, get a tier list
6. **Mobile Tilt Controls** — `DeviceOrientation` for steering

---

## Harsh Truths (Keep These Visible)

1. **The game is only as good as the obstacle feel.** Spend 40% of build time on obstacle physics tuning.
2. **Survival score is the only reason to replay.** If it doesn't feel funny and personal, the game dies after 2 runs.
3. **Load time is a hard constraint, not a soft goal.** Test on a throttled connection every day.
4. **Do not add a car before perfecting 3.** 5 mediocre cars < 3 cars that feel genuinely different.
5. **The share mechanic IS the marketing.** The text output when you share your result IS the ad.

---

## Car Picker → Game Loop Pseudocode

```
BOOT
  → init Three.js renderer
  → init cannon-es world
  → spawn procedural road (no assets needed)
  → show car picker UI (SVG silhouettes, no GLB yet)
  → background: start loading hatchback GLB

PLAYER PICKS CAR
  → if GLB ready: swap box for GLB mesh
  → else: show box with color, GLB loads in 200ms anyway

MODE STARTS
  → spawn obstacles for this mode
  → car starts moving (constant engine force)
  → player: WASD or Arrow keys or touch
  → physics ticks at 60fps fixed

OBSTACLE CONTACT
  → contactInfo → survival.js → update damagePercent
  → HUD flashes damage taken
  → camera shake proportional to impact

WIN / LOSE CONDITION MET
  → freeze car physics
  → calculate final survival score
  → show results overlay with animation
  → local high score check

PLAYER HITS RESTART
  → dispose obstacles
  → reset car position + physics
  → regenerate road
  → re-run mode (< 500ms reset time)
```

---

*"The road is not built for you. It is built to see how badly you break."*