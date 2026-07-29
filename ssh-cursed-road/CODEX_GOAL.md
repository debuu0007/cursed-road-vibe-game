# Goal prompt for autonomous build (copy-paste everything below the line)

---

Build a complete, working MVP of **ssh cursed.road** — a multiplayer ASCII racing game played entirely over SSH — by following the design document at `ssh-cursed-road/PLAN.md` in this repository. Read that document first; it is the source of truth for gameplay, architecture, and scope. Work fully autonomously: do not ask me questions, do not wait for approval between steps, and make reasonable senior-engineer decisions yourself whenever the plan leaves a detail open. Record every such decision in `ssh-cursed-road/DECISIONS.md` as you go.

## Hard constraints (never violate these)

1. **All code goes inside `ssh-cursed-road/` only.** Never modify, move, or delete anything outside that folder — the rest of the repo is a separate browser game that must remain untouched. Do not edit `package.json`, `src/`, `vendor/`, `index.html`, or any other existing file.
2. **Stack is fixed:** Go (latest stable), `charmbracelet/wish` for the SSH server, `charmbracelet/bubbletea` for per-session TUI, `charmbracelet/lipgloss` for styling. Single process, no database — scoreboard persists to an append-only JSONL file. No web server, no browser code, no Docker required to run.
3. **Scope is the MVP definition in PLAN.md §7, nothing more:** SSH login → instant race; ASCII road; 20-player rooms with shared seeded hazards; ghost cars (no player-vs-player collisions); damage/scoring/survival statuses; SHOCK events; wall-of-death scoreboard on join and death; spectator mode with respawn; per-IP rate limiting; idle timeout; clean terminal reset on exit. Everything in PLAN.md §8 (cut list) is out of scope — do not build it.
4. **Server listens on port 2222 by default** (configurable via `-port` flag). Never touch the system's sshd or anything on port 22.
5. The game must be playable at 80×24 in a plain mono terminal; color is progressive enhancement (truecolor → 256 → mono), per PLAN.md §4.

## Project layout

Use the package layout from PLAN.md §5: `cmd/cursedroad/main.go` plus `internal/game`, `internal/curse`, `internal/render`, `internal/session`, `internal/rooms`, `internal/score`, `internal/limits`. Initialize the Go module as `cursedroad` inside `ssh-cursed-road/` (its own `go.mod`; do not create one at repo root).

## Build order

Follow the milestone order from PLAN.md §7 and commit at the end of each milestone with a clear message prefixed `ssh-cursed-road:`. Do not push.

1. **Skeleton:** wish + Bubble Tea server; name prompt; solo scrolling road with steering (`a/d`/arrows) and speed nudge (`w/s`); static obstacles that deal damage; header HUD (speed, distance, damage bar, survival status) and footer (flash messages, controls).
2. **Multiplayer:** room goroutine as single writer at 20 ticks/s; sessions send input via channel and receive immutable snapshots (buffered size 1, drop-oldest); matchmaking (join newest room under 20 players, else create); other players rendered dim with 1-char-offset name tags; overlap badge `[n]`.
3. **Curses:** port the Curse Director concept — a deterministic seeded, distance-keyed hazard timeline generated at room creation (default seed `0xC012ED`), with lead-in warnings and an 18% chance of chained curses. Implement: oil slick (reversed controls, "CONTROLS REVERSED"), fog bank (glyphs degrade to `░▒▓`, hides obstacles), wrong-way traffic (preceded by red `!!!` strip, 46 damage), slipstream lane (+50% speed), repair pad (`[+]`, −16 damage, one use, first car wins, "FIELD REPAIR"), road gap (heavy damage, respawn two lanes over), and the global SHOCK event (all players ~2× scroll speed for ~4s, 1-cell screen shake, "SHOCK INCOMING" warning first).
4. **Death loop:** damage 0–100 with car glyph tinting; at 100 → explosion frame → wall-of-death (all-time top 50 + today's top 10: name, distance, score, survival status, cause of death) → spectator mode (`r` respawn, `q` quit); JSONL persistence loaded on boot; scoreboard also shown ~2s on join, any-key skippable.
5. **Hardening:** per-IP token bucket (max 3 concurrent sessions, 10 connections/min); input cap ~30/s/session; 3-minute idle timeout; global session cap with a queue screen; terminal resize handling; "terminal too small" card below 60×16; mono fallback; persistent host key at a configurable path; graceful SIGTERM drain ("ROAD CLOSED FOR REPAIRS") that flushes scores; clean ANSI reset on every exit path including Ctrl+C.

## Quality bar and verification (do this yourself, continuously)

- `go vet ./...` and `go build ./...` must pass at every commit; `gofmt` everything.
- Write unit tests for the pure logic: curse timeline determinism (same seed → identical timeline), damage/scoring math, rate limiter, matchmaking, snapshot drop-oldest behavior. `go test ./...` must pass at every commit.
- After milestone 2 onward, verify end-to-end after each milestone: start the server, connect with `ssh -tt -p 2222 localhost` (use `StrictHostKeyChecking=no UserKnownHostsFile=/dev/null` options for test connections), drive with injected keystrokes, and assert on captured output (e.g. HUD text appears, distance increases, death reaches the scoreboard). Script this in a `Makefile` or shell script under `ssh-cursed-road/scripts/` so it is repeatable. Two simultaneous test connections must see each other's cars.
- If something doesn't work, debug and fix it yourself — never leave a milestone with failing tests or a non-running server.

## Finish line

Done means: `cd ssh-cursed-road && go build ./cmd/cursedroad && ./cursedroad -port 2222` starts the server; a human can `ssh -p 2222 localhost`, enter a name, race, hit curses, die, see the wall of death, spectate, respawn, and quit with their terminal restored; two simultaneous players share the same road and hazards; all tests pass. Write `ssh-cursed-road/README.md` with run instructions, controls, and a deploy section (systemd unit example, moving to port 22 on a VPS per PLAN.md §6). End with a summary of what was built, every deviation from PLAN.md, and known limitations.
