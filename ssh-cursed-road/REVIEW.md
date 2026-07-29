# Code Review — ssh cursed.road

Reviewed at ~2,150 lines of Go. `go vet ./...` clean, all unit tests pass, `.gitignore` correctly excludes the private host key, scores, binary and `.e2e/` junk. The architecture matches the plan (single-writer room goroutine, drop-oldest snapshots, token-bucket limits) and is fundamentally sound. Below: what to fix, ordered by impact.

**Priority shortlist**

| # | Issue | Type | Effort |
|---|-------|------|--------|
| 1 | `fsync` on every score write runs inside the room tick loop | Latency | S |
| 2 | ANSI reset bug: row loses gray color after first hazard glyph | Visual bug | M |
| 3 | Personal distance drifts away from hazard positions | Gameplay logic | M |
| 4 | Shock scan walks the timeline from index 0 every tick | Latency | S |
| 5 | Per-frame lipgloss style construction + `ReplaceAll` chains | Latency/CPU | M |
| 6 | Wrong-way traffic doesn't move | Visual/fun | S |
| 7 | "LEFT THE ROAD" records 0-meter quits to the scoreboard | Gameplay | S |

---

## A. Latency & performance

### A1. Score writes block the room tick loop (biggest real latency risk)
> ✅ fixed in bounded async score queue with one-second sync batching (A1)

`internal/score/store.go:139` does `file.Sync()` (fsync) on every record, and records are written **synchronously from inside the room tick handler** (`internal/rooms/room.go:213` and `room.go:159`). A slow fsync (cheap VPS disk, busy moment) stalls the *entire room* — all 20 players hiccup on every death. Worst case: a pile-up where 5 players die on the same traffic event = 5 sequential fsyncs inside one 50ms tick budget.

**Fix:** make `Record` fire-and-forget from the room's perspective — push the entry into the store's channel and return immediately (the store already has its own goroutine; drop the synchronous `reply` wait from the room path). Batch the fsync: sync at most once per second or on `Close`, not per entry. Losing one score line in a hard crash is acceptable; a frozen room is not.

### A2. Shock detection scans the timeline from the beginning every tick
> ✅ fixed with monotonic timeline cursor and fixed-seed equivalence test (A2)

`internal/rooms/room.go:188–197` iterates `timeline` from index 0 on every tick, skipping already-consumed events until `event.Distance > distance`. The 1,000,000m timeline holds ~9–11k events; late in a long run that's thousands of wasted iterations per tick, per room, 20×/s.

**Fix:** keep a `timelineCursor int` in the room loop; advance it past events whose `Distance + Length + margin < distance`. Same applies to `resolveHazards` and `activeHazards` — they already use `sort.Search` (fine), but the shock loop is the raw scan.

### A3. Per-frame style building and string replacement in the render path
> ✅ fixed in cached per-session palette and span renderer (B1+A3)

`internal/render/render.go:333–359` (`colorizeRoad`) runs per row, per frame, per session: it constructs new lipgloss styles (`newStyle(...).Bold(...).Foreground(...)`) and does ~8 `strings.ReplaceAll` passes over each row. At 22 rows × 20 snapshots/s that's ~3,500 style constructions and replace passes per second *per player* — pure garbage-collector food.

**Fix:** precompute once per session (they only depend on `ColorTier`): a small struct of already-rendered glyph strings, e.g. `styledOil = style.Render("≈≈≈")` built in `NewModel`, and pass it through `Options`. Then `colorizeRoad` is only the `ReplaceAll` calls with cached strings — or better, colorize while composing the canvas (you know the glyph positions there; no string searching needed at all).

### A4. A 50ms wakeup per session just to check the idle timer
`internal/session/model.go:84–86`: `tick()` re-arms every 50ms purely to test a 3-minute idle timeout. That's 20 wakeups/s/session — with 300 sessions, 6,000 timer events/s doing nothing.

**Fix:** tick every 5 seconds. Idle-timeout precision of ±5s is invisible to users.

### A5. Truecolor detection mostly can't work over SSH
`cmd/cursedroad/main.go:65` reads `COLORTERM` from `s.Environ()`, but SSH clients don't forward `COLORTERM` unless the user configures `SendEnv` — so almost everyone silently lands on 256-color or mono even in iTerm/kitty/Ghostty. (The `TERM`-substring fallbacks in `session.NewModel` catch kitty but not the common `xterm-256color` truecolor terminals.)

**Fix:** trust `wishtea.MakeRenderer(s)` — it already profiles the session — and derive the tier from `renderer.ColorProfile()` instead of hand-parsing env vars. Delete the manual TERM sniffing.

### A6. Every line is padded to full terminal width
`internal/render/render.go:383–389` (`fit`) pads all lines with trailing spaces to `width`. Bubble Tea diffs by line, so any change ships the whole padded line; trailing spaces are pure wasted bytes on a 1,000-player launch day and make asciinema files bigger.

**Fix:** only pad lines that need it for centering/right-alignment (the header). For road rows, stop at the right `║`.

### A7. Perceived input lag is OS key-repeat delay, not the server
Steering moves one lane per keypress and relies on the client OS's key repeat (~300–500ms initial delay) for held keys. That delay *feels* like network lag. You can't detect key-up over SSH, but you can soften it: if two presses of the same direction arrive within ~150ms, move 2 lanes (tap-tap dash). Cheap, and makes the controls feel much snappier than any server-side change would.

---

## B. Correctness / gameplay logic

### B1. ANSI reset bug — the road loses its gray after the first colored glyph *(fix before anything cosmetic)*
> ✅ fixed in cached per-session palette and span renderer (B1+A3)

`colorizeRoad` first wraps the **whole row** in gray (`render.go:335`), then replaces glyphs inside that string with independently-styled versions. Each lipgloss render ends with `\x1b[0m` (full reset) — so everything on the row *after* a hazard glyph renders in the terminal's default color, not road-gray. Rows with hazards visibly don't match rows without. This is also why per-glyph `ReplaceAll` styling is fragile in general.

**Fix:** colorize during canvas composition (per-cell/segment spans with one style each), or have glyph replacements end by *re-opening* the gray foreground instead of relying on reset. The span-based approach also fixes A3.

### B2. Personal distance and hazard positions drift apart
Hazards are resolved and drawn against the **room's** shared `distance` (`room.go:186–204`, `render.go:190–204`), but the HUD `DIST`, the score, and slipstream all use the player's **personal** `p.Distance`, which permanently outruns room distance whenever `SpeedNudge=+1` or slipstream is active (`room.go:222–231`). Consequences: (a) the header distance doesn't correspond to where hazards actually are; (b) holding `w` inflates score forever while having zero effect on which hazards you hit — boost is strictly free points; (c) two players at the same screen position show different distances.

**Fix (pick one):** simplest — make score/HUD use room distance + a small boost *bonus* pool, keeping one world truth; or fully commit — resolve hazards against each player's personal distance (hazard timeline is already distance-keyed, so per-player resolution is a one-line change in `resolveHazards`, and rendering per-player already receives its own snapshot overlay). The second is truer to "boost = risk of meeting hazards sooner" and makes `w/s` a real dodge tool.

### B3. Quitting at 0m spams the wall of death
`room.go:157–164` records `LEFT THE ROAD` for any racing player who disconnects — including someone who connected, saw the road, and quit at 12m. Launch day will fill "TODAY'S TOP 10" with `anon_3f2a 12m` lines.

**Fix:** only record on disconnect if `Distance >= 100` (or only record deaths, and let leavers vanish — arguably more on-brand: the road forgets you).

### B4. Header player count includes spectators
`render.go:170–172` prints `len(snapshot.Players)` as "N racing", but the slice includes spectators. Count `State == Racing` only (spectators can be a second number: `12 racing · 3 ghosts`).

### B5. Gap hazard is nearly invisible
The gap renders as blank cells (`render.go:225–231`, glyph `"     "`), which on an empty dark road is… nothing. In mono it's literally undetectable until you take 58 damage.

**Fix:** draw crumbled edges — first/last row of the gap as `▚▞▚▞` (or `░░░` in mono) across the lane, void rows empty between them. Reads as "hole" at a glance in every color tier.

### B6. Small ones
- `host_ed25519.pub` isn't in `.gitignore` (harmless, but for cleanliness add `/host_ed25519*`).
- `session.Model.snapshot`/`screen` are written from the Update loop and read in `View` — fine under Bubble Tea's single-threaded model, but `Close()` is called from a separate goroutine (`main.go:68–71`); it correctly touches only `sub` under `subMu`. Keep it that way — don't add fields to `Close()` later.
- `sanitizeName` blocklist is substring-based and tiny; fine for launch, but expect creative bypasses — keep the list in one place so it's easy to extend live.
- The death wall isn't skippable (5s hold). Intentional per plan, but add `any key: spectate now` after 2s — 5 forced seconds feels long the tenth time you die.

---

## C. Visual polish (make it good to the eyes)

Ordered by fun-per-line-of-code.

### C1. Make wrong-way traffic actually move ★ the single best upgrade
Traffic (`▼▼`) currently sits at a fixed road position like a cone. It's supposed to be *oncoming*. Give the traffic event a virtual speed: when computing its row, use `row = carBaseRow - int((hazard.Distance - snapshot.Distance*1.6)/4)` style math (or track an offset that grows with ticks after it becomes visible) so it visibly rushes down the screen at you. Pair with the existing `!!!` warning strip. This transforms the hazard from "static obstacle #4" into the scariest thing on the road.

### C2. Hit feedback flash
On `ApplyDamage`, set `HitUntil = tick + 3` and render the car in reverse-video/red for those ticks. Right now damage is only a number changing in the header — the moment of impact needs to *feel* like impact. (Field: add to `Player` + `PlayerView`, one style branch in the car render.)

### C3. Explosion animation instead of static `*BOOM*`
The 2-second death freeze shows one static string. Cycle frames by `tick - DeathTick`:
`✷` → `✹✷✹` → `* ✹ *` → `·  ·  ·` (mono: `*` → `***` → `* *` → `. .`). Dying is content — make the clip-worthy frame.

### C4. Speed needs to be *felt*, not just printed
- Tie lane-dash cadence to speed: the `·` dashes currently alternate on `distance/3` regardless of pace. Use `distance/2` at low speed → `distance/5` spacing at high speed so the road visibly streams faster.
- During SHOCK and slipstream, draw brief streak chars `¦` in empty cells near the road edges (seeded by `(x*7+y*13+tick)%N` so it shimmers).
- Slipstream: green `^` trail in the 1–2 cells behind your car while active.

### C5. Shock should shake more than 1 column
`render.go:289–291` jitters `leftPad` by +1 on even ticks. Add vertical judder (drop the top canvas row on alternating ticks so the whole road jumps), and during shock render the `║` borders in red. The current header reverse-flash every 10 ticks is good — keep it.

### C6. Color the road furniture
- `║` borders: dim yellow (`226`-family) — echoes the browser game's yellow edge lines; instantly reads "road", and gives mono users nothing to miss since borders are already glyphs.
- Damage bar: green → yellow → red as it fills (same thresholds as the car tint, `render.go:347–354`), instead of always-white blocks.
- Other players' *names* are uncolored — only their `◇` is cyan (`render.go:346`). Style the name with the same faint cyan, and clip it to the lane width so long names don't overlap the next lane.

### C7. Animate the fog
`render.go:233–239` picks `░▒▓` by `(x+y)%3` — a frozen texture. Use `(x+y+int(snapshot.Tick/3))%3` so the fog crawls. Three characters, huge atmosphere gain. (Also consider hiding *player* cars inside fog rows — currently only hazards are hidden, so cars ghost through fog visibly.)

### C8. Consumed repair pads should show as sniped, not vanish
When someone grabs `[+]` it disappears (`render.go:201`). Render consumed pads as a dim `[ ]` instead — the "someone got here first" rivalry is the whole point of the mechanic, so show the evidence.

### C9. Title screen deserves the bit
The name screen is centered plain text. Cheap upgrades: a small ASCII logo (`CURSED ROAD` in 3-row block letters or even just the car glyph ▄██▄ above the title), the selected mode `> THE ROAD` in bold red, locked modes in faint, and a blinking `█` cursor (toggle on tick — the 5s tick from A4 is too slow for this; blink only while on the name screen with a 500ms tick). First impression is the screenshot.

### C10. Wall of death hierarchy
`render.Wall` is uniform text. Give it: box-drawing frame around the whole board, ranks 1–3 in gold/silver/red-ish (`220`/`250`/`208`), **your own row bold/reverse** (pass the player name in — seeing yourself on the board is the retention hook), and the `share: asciinema…` line faint. Also guard the truncation at `render.go:50–52`: on short terminals the share line and "spectating shortly…" are currently the first things cut — compute `remaining` so the footer always survives and trim all-time entries instead.

### C11. Small touches
- Engine wobble: `SPD` jitter ±2 km/h per tick makes the number feel alive (`DisplaySpeed` + `tick%3-1`).
- Queue and closed screens: run them through the same centered, faint-styled card helper as the title screen so every non-race screen shares one look.
- First racing frame renders an empty road before the first snapshot arrives (`model.go:231` with zero-value snapshot) — keep showing `ENTERING THE ROAD…` until `snapshot.Tick > 0`.

---

## Suggested fix order

1. **B1** (reset bug) together with **A3** (cached/span styling) — same code, one rewrite of `colorizeRoad`.
2. **A1** (async score writes) and **A2** (timeline cursor) — small, protect the tick loop.
3. **B2** (distance model decision) — decide before tuning anything else, it changes scoring.
4. **C1–C3** (traffic motion, hit flash, explosion) — the fun tier.
5. **A4–A7, B3–B5** — sweep of small fixes.
6. **C4–C11** — polish pass, then re-record launch gifs.
