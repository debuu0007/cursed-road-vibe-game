# Vibe Jam Starter Pack Skills — Applied to Cursed Road

This doc tracks which skills from [chongdashu/vibejam-starter-pack](https://github.com/chongdashu/vibejam-starter-pack) are useful for **Cursed Road** and what we've applied.

---

## Skills Evaluated

### ✅ **threejs-builder** — Scene Organization & Best Practices
**Why useful:**
- **Reference frame contracts** — clear coordinate system (Three.js right-handed: +X right, +Y up, +Z toward camera)
- **Calibration patterns** — prove forward direction, anchors, scale before building gameplay
- **Camera-relative controls** — derive movement from camera orientation (not blind to world axes)
- **Performance guardrails** — clamp `devicePixelRatio`, reuse geometries, avoid loop instantiation
- **Anti-patterns** — avoid guessing asset forward direction, floating fixes via random Y offsets

**Applied:**
- ✅ **Idle velocity dead zone** (fix car twitch at speed=0) — forced velocity/angular velocity to zero below 0.5 m/s threshold
- 🔄 **Coordinate clarity** — document axes, forward conventions in code comments (next step)
- 🔄 **Scene organization** — extract lighting/scenery setup into clear helper functions (future refactor)

**Key takeaways for Cursed Road:**
- Our game uses camera-chase (not orbit), so "camera-relative WASD" patterns don't apply directly, but **coordinate awareness** matters for portal placement + obstacle spawning
- Portal/obstacle Z positions are in **world forward (+Z away from camera)** — this is already consistent but should be commented
- Car forward is **local -Z** (Three.js convention); we use yaw to rotate the car body
- Performance: already clamping pixel ratio to 1.5, reusing geometries ✅

---

### ✅ **playwright-testing** — Deterministic Canvas/WebGL Testing
**Why useful:**
- **Deterministic mode** — seed RNG, freeze time, lock viewport/DPR for reliable tests
- **Readiness signals** — wait on `window.__TEST__.ready` instead of sleeps
- **Screenshot regression** — targeted canvas snapshots after locking determinism
- **Flake reduction** — control time/RNG/network, explicit readiness conditions

**Applied:**
- ⏳ **Not yet implemented** — would require:
  1. Add `window.__TEST__` seam with `{ ready, state, seedRNG, freezeTime }`
  2. Seed `Math.random` for obstacle spawn patterns
  3. Add Playwright test harness with viewport/DPR locks
  4. Smoke test: "game loads → car spawns → drive forward → reach 50m"

**Value for Cursed Road:**
- Could catch portal redirect bugs, obstacle collision regressions, mode goal changes
- Screenshot tests for HUD layout, portal visuals, result screen
- Deterministic mode would make daily challenge testing reliable

**Decision:** Nice-to-have after MVP ships; priority if we see flaky bugs in CI or want automated visual regression.

---

### 🟡 **phaser-gamedev / phaser4-gamedev**
**Why skipped:** Cursed Road uses **Three.js + cannon-es**, not Phaser. Not applicable.

---

### 🟡 **threejs-capacitor-ios**
**Why skipped:** Game is web-only for Vibe Jam. iOS export could be valuable post-jam if we want App Store presence.

---

### 🟡 **fal-ai-image / retro-diffusion**
**Why skipped:** We use low-poly procedural meshes + CC-BY GLB models. AI sprite generation not needed for this art style.

---

## Immediate Improvements Applied

### 1. **Fixed Car Idle Twitch** (from threejs-builder anti-pattern awareness)
**Problem:** Car had micro-movements even at speed=0 due to asymptotic damping.  
**Fix:** Added dead zone in `clampCarVelocityForFixedStep` — force velocity/angular velocity to zero when `horizontalSpeed < 0.5` and `forwardSpeed < 0.5`.

**File:** `src/game.js` line ~633

```js
// Dead zone: force zero velocity at idle to stop micro-twitching
const IDLE_THRESHOLD = 0.5;
if (horizontalSpeed < IDLE_THRESHOLD && Math.abs(car.forwardSpeed) < IDLE_THRESHOLD) {
  car.body.velocity.x = 0;
  car.body.velocity.z = 0;
  car.body.velocity.y = Math.abs(car.body.velocity.y) < 0.1 ? 0 : car.body.velocity.y;
  car.body.angularVelocity.set(0, 0, 0);
  car.forwardSpeed = 0;
  return;
}
```

---

## Recommended Next Steps (Optional)

### Short-term (if gameplay feels lacking)
1. **Add coordinate comments** — document axes, forward conventions at top of `game.js`, `cars/carBase.js`, `systems/portals.js`
2. **Extract scene setup** — move lighting + scenery into `setupLights()`, `setupScenery()` for readability
3. **Gameplay variety** — add 1-2 new obstacle types (e.g., "lane closure" that forces side-to-side dodging, "checkpoint rings" for speedrun modes)

### Mid-term (post-jam polish)
1. **Playwright smoke test** — deterministic mode + one automated "game loads → drive → finish" test
2. **Visual regression** — screenshot portal visuals, HUD, result screen to catch layout breaks
3. **Performance audit** — use threejs-builder's instancing patterns if tree/obstacle count grows

---

## Resources

- [Vibe Jam Starter Pack (GitHub)](https://github.com/chongdashu/vibejam-starter-pack)
- [threejs-builder skill (raw)](https://raw.githubusercontent.com/chongdashu/vibejam-starter-pack/main/.agents/skills/threejs-builder/SKILL.md)
- [playwright-testing skill (raw)](https://raw.githubusercontent.com/chongdashu/vibejam-starter-pack/main/.agents/skills/playwright-testing/SKILL.md)
- [VibeGameDev.com](https://vibegamedev.com) — broader ecosystem of AI gamedev workflows

---

**Status:** Car idle twitch **fixed**. Coordinate/testing improvements **documented** for future passes.
