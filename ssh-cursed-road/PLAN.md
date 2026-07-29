# ssh cursed.road — Design & Build Plan

> **"There's no website. `ssh cursed.road` and start dodging."**

A multiplayer ASCII racing game played entirely over SSH. Top-down terminal-rendered road, live players as ASCII cars, shared curse hazards, sudden speed shocks, and a persistent wall-of-death scoreboard. The anti-browser browser game: the "link" is a command, which is even more copy-pasteable in dev-Twitter/HN replies than a URL.

This is the SSH sibling of the existing browser game in this repo (**cursed road**, `src/`). It reuses the proven theme and hazard design, ported to a completely different substrate. Nothing here touches the browser game's code.

---

## 1. Vision

### Positioning
- **Substrate as the joke.** The game exists where games shouldn't: a raw SSH session. Precedents that hit: eieio's `ssh tiny.christmas` multiplayer caroling, `snakes.run` SSH snake, and terminal.shop selling coffee over SSH that kept re-virating for a year.
- **The command is the demo.** No signup, no download, no browser. Anyone with a terminal is 3 seconds from playing. In an HN thread, `ssh cursed.road` in a reply *is* the marketing.
- **Two-wave virality plan.** Wave 1: silly launch ("I made a racing game you play over SSH"). Wave 2, ~2–4 weeks later: engineering postmortem ("How 20 people race in one terminal: the architecture of cursed.road") — the documented eieio pattern where the how-it-works post re-virals on HN.

### Design pillars
1. **Instant.** Connect → racing within 5 seconds. No auth, no menu maze. One keypress from the title card to the road.
2. **Legible chaos.** ASCII cars at 200 km/h are funnier than sprites, but the screen must stay *readable*. Every hazard telegraphs before it hits.
3. **Death is content.** Dying drops you into spectator mode and onto the wall-of-death. Losing should be as screenshot-able as winning.
4. **Recordable by design.** Every player's terminal is an asciinema recorder. The rendering must survive recording/playback cleanly — players make our clips for us.

---

## 2. Carry-overs from the browser game

The browser game already proved the theme. Port the *ideas*, not the code.

### Theme & framing
- Tagline: **"The road is not built for you."**
- Mode select framed as **"Pick a curse."**
- Survival status ladder (used verbatim on the scoreboard):
  `Perfectly Fine → Shaken But Alive → Barely Conscious → Needs Hospital → Flatlined`
- Seed easter egg: default world seed `0xC012ED` ("cursed").
- Flash-message gimmick text in ALL CAPS: `CONTROLS REVERSED`, `FIELD REPAIR`, `SHOCK INCOMING`.

### Curse hazards, reimagined for the terminal

| Browser curse | SSH version |
|---|---|
| Oil patch (inverted controls) | **Oil slick** `≈≈≈` — left/right keys swap for 4s, `CONTROLS REVERSED` flash |
| Fog patch (vision reduction) | **Fog bank** — road chars degrade to `░▒▓` in a moving band; obstacles inside are hidden until 3 rows away |
| Gravity well (pull/lift) | **Gravity well** `(( @ ))` — lateral drift force toward its column; you fight it with steering |
| Wind gust (lateral push) | **Crosswind** `»»»` — constant sideways push for a stretch of road |
| Friction zone (ice/gravel) | **Ice stripe** — steering momentum: you keep sliding 2 extra cells after a keypress |
| Slipstream (speed boost) | **Slipstream lane** `^^^` — green lane segment, +50% scroll speed while inside (the one benevolent curse) |
| Traffic (oncoming car) | **Wrong-way traffic** — oncoming ASCII car in a lane, preceded by a red `!!!` lane warning strip |
| Shock (forced 2.2× speed) | **SHOCK** — global event: everyone's scroll speed doubles for ~4s, screen-shake (1-cell frame jitter), inverse-video flash |
| Repair pad (heal 16 damage) | **Repair pad** `[+]` — drive over it, `FIELD REPAIR`, −16 damage, one use, first-come-first-served (multiplayer twist: someone can snipe your heal) |
| Gap / collapsed bridge | **Road gap** — missing road rows; hitting the void costs heavy damage and respawns you 2 lanes over |

### The Curse Director (the strongest pattern to port)
The browser game's `curseDirector.js` is a **deterministic, seeded scheduler** that pre-builds a distance-keyed curse timeline with per-mode weights, lead-in warning distances, and an 18%-chance **chained curse** (two curses 8–18m apart). Port this concept to server-side Go:

- One timeline per room, generated at room creation from the room seed.
- Distance-keyed: curses trigger when the room's shared scroll distance crosses each key.
- Because it's seeded and server-authoritative, all 20 players see the exact same hazards at the exact same road positions — shared suffering is the multiplayer glue.
- Chained curses stay (fog immediately followed by traffic is peak cursed).
- A **daily seed** (date-hashed, like the browser game's Daily Challenge) becomes the v2 daily mode for free.

---

## 3. Gameplay design

### Core loop
Top-down road scrolling **upward** (you drive toward the top of the screen). The road scrolls automatically; you control lane position and a small speed modulation.

- **Steer:** `←`/`→` or `a`/`d` — move one cell laterally per press (held keys auto-repeat via terminal key repeat; that's the throttle-free skill ceiling).
- **Boost / brake:** `↑`/`↓` or `w`/`s` — nudge your personal scroll contribution ±20% for overtakes and dodges. Base speed always climbs with distance, so runs get faster and end in chaos.
- **Quit:** `q` or `Ctrl+C` (clean disconnect, score still recorded).

### Damage, not instant death
Straight port of the browser game's survival system: damage 0–100.
- Obstacle hit: 10–25 depending on type; wrong-way traffic: 46 (the browser game's number, kept as an in-joke).
- Car glyph tints with damage (white → yellow → red → dark red), mirroring the browser game's mesh tinting.
- At 100: **FLATLINED**. Explosion frame (`*` burst), 2s freeze, then spectator mode.

### Scoring
`score = distance_m + survival_bonus` where survival bonus mirrors the browser game's formula in spirit: start at 100, subtract damage-weighted penalties. Scoreboard line shows distance, score, and survival status string.

### Multiplayer rules (20-player rooms)
- All players share **one road, one curse timeline, one scroll distance** (the room scrolls as one; your boost/brake shifts you a few rows up/down within a visible band, it doesn't fork the world).
- **Collisions between players: none** (v1). Cars are ghosts to each other. This kills griefing, netcode pain, and rubber-banding in one decision. The *shared hazards* are the interaction.
- **Ghost-overlap rendering:** when two cars occupy one cell, render the local player on top; other overlapping players render as a stacked count badge `[3]` in dim color. Your own car is always bold + bright; others are dim cyan with 1-char name tags floating beside them.
- **Repair pads are the one contested resource** — first car over it gets the heal. Instant rivalry, zero netcode complexity.
- **Join mid-race:** new players spawn at the room's current distance with 0 damage. Runs are individual (your score = your distance survived since *you* joined), so mid-join is fair.
- **Spectator mode:** after death you keep watching the room with a `SPECTATING — [r] to respawn, [q] to quit` footer. Respawn re-enters the same room as a fresh run.

### The wall of death
- Shown full-screen **on join** (2s, skippable with any key) and **on death**.
- Persistent all-time top 50 + today's top 10, with name, distance, score, survival status, and cause of death (`FLATLINED by WRONG-WAY TRAFFIC at 2,340m`).
- Names: 1–12 chars, asked once per connection with a single prompt (`who dies today?`), profanity-filtered, default `anon_<4hex>`.

### Modes ("Pick a curse") — v1 ships ONE mode
V1 is a single endless mode: **THE ROAD** (all curses, escalating speed). The mode-select screen exists but shows the other two as `LOCKED — soon`: keeps the "pick a curse" bit, ships faster, and gives an update hook for wave-2 attention.

---

## 4. Rendering spec

### Terminal targets
- **Minimum viable: 80×24.** The classic. Layout: 1 header row (speed / distance / damage bar), 22 road rows, 1 footer row (flash messages, controls hint).
- **Adaptive:** Bubble Tea delivers `WindowSizeMsg`; road width uses `min(termWidth-2, 60)` columns, road height fills available rows. Below 60×16: render a `your terminal is too small — the road pities you` card instead of garbage.
- Road is 5 lanes at standard width (each lane ~6 cells), 3 lanes on narrow terminals.

### Frame mockup (80×24, drawn in-doc so we agree on the look before coding)

```
 SPD 187 km/h   DIST 1,842m   DMG ██████░░░░ 58   Shaken But Alive      12 racing
 ║ · · · │      │  ▒▒▒▒  │      │      · ║
 ║       │  ok◇ │ ▒fog▒  │      │      · ║
 ║ · · · │      │  ▒▒▒▒  │ »»»  │      · ║
 ║       │      │        │ »»»  │  ▄██▄ ← miki
 ║ · ≈≈≈ │      │  [+]   │      │  ▀██▀ · ║
 ║ · ≈≈≈ │ ▄██▄ │        │      │      · ║
 ║       │ ▀██▀ │        │ !!!  │      · ║
 ║ · · · │  you │        │ !!!  │ [2]  · ║
 ║       │      │  ▲     │ ▄▄   │      · ║
 ║ · · · │      │  ▲▲    │ oncoming!    ║
 ...
 !! SHOCK INCOMING !!                                  [a/d] steer  [w/s] speed
```

(Exact glyph choices to be tuned in play; the doc's contract is: bordered road `║`, dashed lane lines `│`/`·`, your car `▄██▄/▀██▀` bold, others dim with name tag, hazards use the glyph table from §2.)

### Rendering pipeline
- **Server composes per-room, sessions personalize.** The room produces one shared "road canvas" per tick (hazards + all cars at their positions). Each session's renderer overlays its personal layer: highlight own car, own damage HUD, own flash messages, then converts to ANSI for that terminal's size/color depth. Composing the shared canvas once per tick per room, not per player, is the key CPU win.
- **Frame rate:** room simulation at **20 ticks/s**; sessions render at 10–15 fps (every tick or every other tick, degrading under load). Bubble Tea's renderer already does line-diffing, so we send diffs, not full frames.
- **Bandwidth sanity check:** worst case full-frame redraw ≈ 80×24 cells with ANSI ≈ 4–6 KB → at 15 fps ≈ 90 KB/s/player → 20 players ≈ 1.8 MB/s. Fine for a cheap VPS; diffing cuts it by 5–10×.

### Color tiers
1. **Truecolor** (`COLORTERM=truecolor`): full palette — night-road grays, hazard colors per §2 table.
2. **256-color**: mapped palette, same semantics.
3. **Mono / dumb terminals**: no color, semantics carried by glyphs alone (this is why every hazard has a distinct glyph, not just a distinct color). Detect via `TERM`; also a `--mono` toggle key `m`.

### asciinema-friendliness rules
- Use the alt-screen normally (asciinema records it fine) but: no OSC title spam, no mouse protocols, no queries that stall dumb recorders, clean reset on exit so recordings end tidy.
- On death, hold the wall-of-death + a `share: asciinema + "ssh cursed.road"` hint on screen for 5s — that's the frame people screenshot.

---

## 5. Architecture

### Stack
- **Go** — one static binary, trivial deploy, goroutines map perfectly onto sessions.
- **`charmbracelet/wish`** — SSH server middleware: gives us sessions, PTY info, and Bubble Tea integration out of the box.
- **`charmbracelet/bubbletea`** — per-session TUI program (input handling, window size, diff rendering).
- **`charmbracelet/lipgloss`** — styling/color-tier handling.
- No web framework, no browser code, no DB server.

### Single-process world (the One Million Chessboards pattern)
One process owns all state. No distributed anything.

```
                       ┌──────────────────────────────────────┐
 ssh session ──┐       │  process: cursedroad                 │
 ssh session ──┼──▶ wish ──▶ session goroutine (bubbletea)    │
 ssh session ──┘       │        │ input msgs      ▲ snapshots │
                       │        ▼                 │           │
                       │   room.Inbox chan   room.Broadcast   │
                       │        │                 │           │
                       │   ┌────┴─────────────────┴────┐      │
                       │   │ room goroutine, 20 tick/s │ ×N   │
                       │   │ world state + curse       │      │
                       │   │ director timeline         │      │
                       │   └───────────┬───────────────┘      │
                       │               ▼                      │
                       │   scoreboard goroutine → scores.json │
                       └──────────────────────────────────────┘
```

- **Room goroutine** is the single writer of its world state. Each tick: drain input channel → apply moves → advance distance → fire curse-director events → resolve hazard collisions & damage → compose shared road canvas → publish an immutable snapshot to subscribers. Single-writer means zero locks on game state.
- **Session goroutines** never touch world state directly: they send typed input commands into `room.Inbox` and receive snapshots on a subscription channel (buffered size 1, drop-oldest — a slow client skips frames instead of back-pressuring the room).
- **Interpolation: none.** At 20 ticks/s on a cell grid there is nothing to interpolate; cars move whole cells. This deletes the hardest part of normal racing netcode. SSH latency (30–150ms) just means your keypress lands a tick or two later — acceptable for a comedy game, and everyone's hazards are identical regardless.
- **Room lifecycle & matchmaking:** join newest room with < 20 players, else create one. Room dies when empty for 60s. Room seed = daily seed + room counter (deterministic, logged — any run is replayable for debugging).
- **Scoreboard persistence:** append-only JSONL + in-memory top-N; flushed on write, loaded on boot. SQLite only if/when we want per-key identity in v2. No Postgres. (`vendor/tinyskies` in this repo is the reference for what a *full* client/server/DB multiplayer setup looks like — and deliberately what we're *not* building.)
- **Crash policy:** rooms are disposable. On panic in a room goroutine: recover, kill the room, sessions get a `THE ROAD ITSELF HAS DIED — reconnecting…` card and rejoin matchmaking. Scoreboard is the only state that must survive.

### Package layout (target repo: a NEW separate folder/repo, not `src/`)

```
ssh-cursed-road/
├── PLAN.md               ← this doc
└── (implementation, when it happens:)
    cmd/cursedroad/main.go     — flags, wish server wiring, signal handling
    internal/game/             — world state, tick loop, physics-on-a-grid
    internal/curse/            — curse director port: seeded timeline, hazard defs
    internal/render/           — shared canvas compose + per-session ANSI overlay
    internal/session/          — bubbletea model: input, resize, screens (title/race/death/spectate)
    internal/rooms/            — matchmaking, lifecycle
    internal/score/            — wall of death, JSONL persistence
    internal/limits/           — per-IP rate limiting, session caps
```

---

## 6. Abuse prevention & ops

### Abuse
- **Per-IP limits:** max 3 concurrent sessions, max 10 connections/min (token bucket keyed by IP at the wish middleware layer). Over limit → instant polite banner + disconnect.
- **Input flood guard:** cap processed inputs at ~30/s/session; excess dropped silently (also neutralizes trivial keypress bots).
- **Idle timeout:** 3 min without input → `the road forgets you` → disconnect. Global session cap (~300) so one HN spike can't OOM the box; over cap → a queue screen with live "cars ahead of you" count (the queue itself is content).
- **Name filter:** profanity list + charset whitelist `[a-z0-9_-]`, since names render on a shared scoreboard.
- **No shell, ever:** wish serves only the Bubble Tea app; no exec/sftp/forwarding subsystems enabled.

### Ops
- **One cheap VPS** (2 vCPU / 2GB — Hetzner CX22-class). Budget math: 20 ticks/s × a handful of rooms of grid math + ~2 MB/s peak egress is nothing; the box will be bored.
- **Port:** listen on **:22 directly** (move the admin sshd to :2222 or WireGuard-only). The whole bit dies if users must type `-p 2222`.
- **Host key:** generated once, persisted, backed up — changing it mid-viral moment shows every returning player a MITM warning. This is the single most important ops file.
- **DNS:** `cursed.road` A/AAAA record. (Buy the `.road` domain before writing any code; the name is the product.)
- **Deploy:** systemd unit, `Restart=always`; deploy = scp new binary + restart. Graceful drain: on SIGTERM, show all sessions `ROAD CLOSED FOR REPAIRS — reconnect in 10s`, flush scoreboard, exit. Sub-second downtime is fine for v1; SO_REUSEPORT handoff is a v2 luxury.
- **Observability:** structured logs (connects, room births/deaths, scores, IPs); a tiny in-process `/metrics`-style admin view reachable as `ssh admin@cursed.road` with a password-protected key — the ops dashboard is also a TUI, obviously.

---

## 7. MVP scope & milestones (6–9 days)

**MVP definition:** SSH login → instant race; ASCII road + 20-player rooms; shared curse obstacles; SHOCK events; wall-of-death on join/death; spectator mode; per-IP rate limiting; asciinema-friendly.

| Day | Deliverable | Exit criterion |
|---|---|---|
| **D1–2** | wish + Bubble Tea skeleton; solo scrolling road; steering; obstacles kill you | `ssh localhost -p 2222` and playably dodge for 60s alone |
| **D3–4** | Room goroutine, shared canvas snapshots, matchmaking, other players rendered with name tags | Two terminals see each other move in the same road, in real time |
| **D5** | Curse Director port: seeded timeline, 6 hazards (oil, fog, traffic, slipstream, repair pad, gap) + SHOCK | Two clients see identical hazards at identical distances; SHOCK shakes both screens |
| **D6** | Damage/scoring/survival statuses; death → wall-of-death → spectator → respawn; JSONL persistence | Full loop: join → name → race → die → scoreboard → spectate → respawn |
| **D7** | Rate limits, session caps, idle timeout, resize handling, too-small-terminal card, mono fallback, clean exit reset | Hammering it with `ssh` in a loop gets politely rejected; works in an 80×24 mono xterm and a 4K kitty |
| **D8–9** | Buffer: playtest with 5–10 friends, tune speeds/damage, VPS deploy on :22, DNS, host-key backup, record 3 launch asciinema clips | Strangers can `ssh cursed.road` and it doesn't fall over |

**Scope discipline:** anything not in the MVP definition goes to §8. The browser game grew a 1,334-line `game.js` monolith; the SSH version's whole point is a small state space — keep it small.

---

## 8. Cut list / v2 ideas

Explicitly **not** in v1, in rough priority order for v2:

1. **Persistent identity via SSH public-key fingerprint** — zero-auth accounts for free: same key → same name → personal bests. (The killer SSH-native feature; needs scoreboard schema thought, hence v2.)
2. **Daily Challenge** — date-seeded curse timeline, separate daily wall-of-death; mirrors the browser game's daily mode and gives a reason to return.
3. **The other two curses** on the mode-select screen (e.g. *POTHOLE GAUNTLET*: fixed 1,300m sprint; *SPEED SHOCK*: survive 120s of escalating shocks — both straight from the browser game's modes).
4. **Private rooms** via SSH username: `ssh race42@cursed.road` joins/creates room "race42". Trivially implementable with wish (username is free routing data), cut only for launch-scope reasons.
5. **Player collisions / bumping** — only after the ghost version proves fun; bumping invites griefing.
6. **Cross-promo** — browser game's site gets a terminal-styled banner with the ssh command; SSH death screen occasionally shows `the road also exists at <browser game URL>` (the webring spirit).
7. **Spectator-only firehose** — `ssh watch@cursed.road` streams the busiest room; embeddable as a live asciinema wall.
8. **Zero-downtime deploys** via socket handoff.

---

## 9. Launch plan

### Wave 1 — the joke
- **HN (Show HN):** "Show HN: A multiplayer racing game you play over SSH (no browser, no signup)". First comment: architecture teaser + honest numbers, pre-committing to the postmortem.
- **Twitter/X:** 20-second asciinema-to-gif of a SHOCK event with 8 cars on screen. Copy: *"there's no website. `ssh cursed.road` and start dodging."* The command in plain text — replies can copy-paste it.
- Seed 5–10 friends at launch hour so early joiners see a *populated* road; an empty multiplayer road kills the magic.
- Wall-of-death holds the ssh command on screen at all times → every screenshot is an ad.

### Wave 2 — the postmortem (2–4 weeks later)
Blog post outline (write notes during the build, not after):
1. Why SSH is a great game platform (and the three ways it isn't)
2. One process, N terminals: the single-writer room loop
3. Rendering a racing game in ANSI diffs (with bandwidth math)
4. The Curse Director: one seeded timeline, twenty synchronized victims
5. Launch-day graphs: connections, rooms, the rate limiter earning its keep
6. Everything people typed at the name prompt (the comedy section)

### Monetization
None. This is a distribution asset: HN/dev-Twitter reputation with the strongest engineering-postmortem potential in the idea list.

---

## Appendix: key decisions log

| Decision | Choice | Why |
|---|---|---|
| Language/stack | Go + wish + Bubble Tea | Static binary, goroutine-per-session, SSH plumbing solved |
| Multiplayer model | Shared road/hazards, ghost cars, no player collision | All the "we're in this together" with none of the netcode |
| Interpolation | None — whole-cell movement at 20 tick/s | Grid + latency tolerance of a comedy game |
| State | Single process, single-writer per room, JSONL scores | One Million Chessboards pattern; no DB until identity (v2) |
| Port | :22 | `-p 2222` kills the pitch |
| v1 modes | One (endless), others "LOCKED — soon" | Ship fast, keep the "pick a curse" bit, create an update hook |
| Room size | 20 | Enough chaos to be funny, small enough that name tags stay readable |
