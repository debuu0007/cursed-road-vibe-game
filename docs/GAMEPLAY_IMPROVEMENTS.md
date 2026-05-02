# Gameplay Improvement Ideas (from Vibe Jam Starter Pack Review)

Based on reviewing the [Vibe Jam Starter Pack](https://github.com/chongdashu/vibejam-starter-pack) and applying **threejs-builder** best practices, here are **concrete, quick-win improvements** for Cursed Road gameplay.

---

## ✅ Fixed (Just Now)

### 1. **Car Idle Twitch**
**Problem:** Car visibly flickered/twitched even at speed=0.  
**Root cause:** Damping left micro-velocities that never reached exactly zero.  
**Fix:** Added dead zone in `clampCarVelocityForFixedStep` — forces velocity/angular velocity to zero when below 0.5 m/s.  
**Impact:** Cleaner idle state, better for menu/portal entry visuals.

---

## 🎯 Quick Wins (< 1 hour each)

### 2. **Add Lane Markers / Visual Flow**
**Why:** Right now the road is flat gray — hard to judge speed/distance.  
**What:** Add dashed center line (instanced line meshes or painted onto road texture) that scrolls with movement.  
**Impact:** Better speed perception, more satisfying forward motion feel.

**Implementation sketch:**
```js
// In track.js or scenery setup
const dashGeom = new THREE.BoxGeometry(0.3, 0.05, 4);
const dashMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
const dashes = new THREE.InstancedMesh(dashGeom, dashMat, 50);
// Position dashes along centerline (x=0), space them ~12m apart
// Update positions each frame based on car.body.position.z
```

### 3. **Countdown "3, 2, 1, GO!" on Mode Start**
**Why:** Current mode starts instantly — feels abrupt, especially for portal auto-start.  
**What:** 2-second countdown overlay (large center text, fade out).  
**Impact:** Gives player a breath before chaos, more arcade feel.

**Implementation:**
- Add `state.countdownTTL` in `resetRun()`, set to 2.5s
- In `updateGame`, decrement it; if > 0, don't apply driving input
- Show HUD overlay: "3" (1s), "2" (1s), "1" (0.5s), "GO!" (fade)

### 4. **Speedometer Needle (Instead of Just Arc)**
**Why:** Current arc HUD is okay but doesn't "pop" at high speed.  
**What:** Add a rotating needle overlay on the arc (like a real tachometer).  
**Impact:** More visceral speed feedback, easier to read at a glance.

### 5. **Particle Trail at High Speed (>100 km/h)**
**Why:** threejs-builder emphasizes "animation as transformation" — use particles to show velocity.  
**What:** Spawn fading point particles behind the car when speed > 100 km/h (like dust/speed lines).  
**Impact:** High-speed driving feels more intense, better visual reward for risky play.

**Implementation sketch:**
```js
// In game loop, when speed > 100:
const trail = new THREE.Points(
  new THREE.BufferGeometry().setFromPoints([car.body.position.clone()]),
  new THREE.PointsMaterial({ color: 0xaaccff, size: 0.8, transparent: true, opacity: 0.6 })
);
scene.add(trail);
// Fade out over 0.5s, remove after
```

---

## 🚀 Medium Improvements (2–4 hours)

### 6. **"Checkpoint Ring" Obstacles for Speedrun Modes**
**Why:** Current obstacles are all "avoid this or crash" — no positive reinforcement for skillful play.  
**What:** Add glowing rings (torus geometry) that give +5s time extension or +50m distance credit when driven through.  
**Impact:** Adds risk/reward routing — do you take the risky ring path or play safe?

**Placement:** On curves, near potholes, or after bridges (reward brave players).

### 7. **Dynamic Camera Tilt During High-Speed Turns**
**Why:** Camera is currently static chase; threejs-builder suggests **camera moods** for impact.  
**What:** Tilt camera roll slightly when `car.yaw > 0.3` and `speed > 80` (like a racing game).  
**Impact:** More immersive, emphasizes dangerous steering at speed.

**Implementation:**
```js
// In updateCamera()
const rollFactor = THREE.MathUtils.clamp(car.yaw * (speed / 100), -0.15, 0.15);
camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, rollFactor, 0.08);
```

### 8. **"Near Miss" Score Bonus**
**Why:** Adds skill expression — reward players who dodge obstacles closely.  
**What:** Track when car passes within 2m of an obstacle without hitting it; flash "+NEAR MISS" and add bonus score.  
**Impact:** Encourages aggressive play, makes dodging potholes feel cooler.

### 9. **Better Curse Hazard Visuals (per threejs-builder scene intent)**
**Why:** Current curses (fog, wind, friction) are functional but visually muted.  
**What:**
- **Fog:** Add particle system (white/gray points) that fills screen edges
- **Wind:** Arrow sprites that fly across screen showing wind direction
- **Friction:** Ice-blue shader overlay on road segments

**Impact:** Makes curses feel more impactful, easier to understand why car is sliding.

---

## 🌟 Big Swings (post-jam polish, 1+ days)

### 10. **Deterministic Testing Harness (playwright-testing skill)**
**Why:** Currently no automated tests — hard to catch regressions on portal logic, mode goals, collision bugs.  
**What:** Add `window.__TEST__` seam + Playwright smoke test:
1. Seed RNG for obstacle placement
2. Freeze time for deterministic mode progression
3. Screenshot portal visuals, HUD, results screen
4. Automated "start game → drive 100m → check no crash" test

**Impact:** Safer refactors, visual regression catching, CI confidence.

### 11. **"Ghost Replay" from Top Score**
**Why:** Adds replayability without multiplayer complexity.  
**What:** Record position keyframes of best run, replay as transparent ghost car in subsequent runs.  
**Impact:** Personal competition, easy to see where you can improve.

### 12. **More Mode Variety**
Current modes are distance/time-based. Add:
- **"No Damage Run"** — reach 500m without any damage
- **"Risky Business"** — bonus score for near misses, high-speed turns
- **"Gauntlet+"** — every 100m adds a new curse layer (fog → wind → friction stacks)

---

## Priority Ranking (if time is tight)

1. **Lane markers** (huge visual improvement, minimal code)
2. **Countdown timer** (polish, better pacing)
3. **Near miss bonus** (adds skill expression)
4. **Checkpoint rings** (new gameplay mechanic, high value)
5. **Camera tilt** (immersion boost)
6. **Speedometer needle** (visual polish)
7. **Particle trail** (nice-to-have)
8. Rest = post-jam

---

## Takeaway from Vibe Jam Starter Pack

The **threejs-builder** skill's philosophy is: **"Start from scene intent, animation as transformation, performance through restraint."**

Applied to Cursed Road:
- **Scene intent:** Fast-loading, chaotic arcade drive → keep visuals punchy (lane lines, particles) but avoid texture/model bloat.
- **Animation as transformation:** Use rotation, position, scale tweens for feedback (camera tilt, particle trails) instead of complex state machines.
- **Performance through restraint:** Reuse geometries (instanced dashes/rings), clamp pixel ratio ✅, keep draw calls low.

The **playwright-testing** skill is overkill for jam scope but valuable if you plan post-jam updates or want to catch portal redirect bugs in CI.

---

**Next step:** Pick 1–3 from the Quick Wins list and I can implement them now, or you can prioritize based on what feels most important for Vibe Jam submission.
