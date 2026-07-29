# Goal prompt for the review-fix run (copy-paste everything below the line)

---

Implement every fix and improvement documented in `ssh-cursed-road/REVIEW.md` in this repository. Read that file first and treat it as the authoritative work list — it contains three sections (A: latency/performance, B: correctness/gameplay bugs, C: visual polish) plus a "Suggested fix order" at the bottom. Follow that fix order exactly. Work fully autonomously: do not ask me questions, do not wait for approval between steps, and log every judgment call you make in `ssh-cursed-road/DECISIONS.md` under a new "## Review fixes" heading.

## Hard constraints (never violate these)

1. **All changes stay inside `ssh-cursed-road/`.** Never modify, move, or delete anything outside that folder — the rest of the repo is a separate browser game. Do not touch `PLAN.md`, `CODEX_GOAL.md`, or `REVIEW.md` itself, except you MUST check off items in `REVIEW.md` by appending a line `> ✅ fixed in <commit-ish/short description>` under each item's heading as you complete it, so progress is auditable.
2. **No new dependencies.** The existing stack (wish, bubbletea, lipgloss, stdlib) is sufficient for every item.
3. **No scope creep.** Only items listed in REVIEW.md. Do not refactor beyond what an item requires, do not rename packages, do not add features from the PLAN.md cut list.
4. The game must remain playable at 80×24 in a plain mono terminal after every change; color remains progressive enhancement.
5. Server stays on port 2222 by default; never touch the system sshd.

## Decisions I am making for you now (so you don't stall)

- **Item B2 (distance model):** implement the second option — resolve hazards against each player's **personal** distance. Concretely: `resolveHazards` runs per-player using `player.Distance` instead of the shared room distance; `activeHazards`/rendering compute hazard rows per-player from that player's own distance (move the hazard-view computation into the per-player snapshot personalization, or include enough timeline data in the snapshot for the renderer to position hazards per player); the HUD, score, and SHOCK timing keep working. Boost (`w`) must now genuinely change when you meet hazards. Keep the room's shared distance for room-level pacing (base speed, shock schedule).
- **Item B3:** do not record disconnects at all if the player's distance is under 100m; record `LEFT THE ROAD` only at ≥100m.
- **Item A1:** the room must never block on scoring — `Record` becomes non-blocking from the caller's side (buffered channel into the store goroutine, drop with a logged warning if the buffer is somehow full), and fsync happens at most once per second plus once on Close.
- **Item B1 + A3:** rewrite `colorizeRoad` into span-based coloring during canvas composition (track a per-cell style class alongside the rune canvas, then emit each row as styled segments), with all lipgloss styles precomputed once per session in a struct passed via `render.Options`. This must fix the gray-reset bug and eliminate per-frame style construction and `ReplaceAll` calls entirely.
- **Item C1 (moving traffic):** give traffic a virtual oncoming speed of ~1.6× road speed once it enters the visible window, both for rendering and for its collision position, so it visibly rushes at the player and hits where it appears.

## Quality bar and verification (do this yourself, continuously)

- `gofmt` everything; `go vet ./...`, `go build ./...`, and `go test ./...` must pass at every commit.
- Update existing tests that the distance-model change breaks, and add new unit tests for: per-player hazard resolution (a boosted player meets a hazard earlier than an unboosted one), the timeline cursor (A2) producing identical shock/hazard behavior to the old full scan on a fixed seed, non-blocking score recording (room tick completes even when the store is artificially slowed), and the ≥100m disconnect-recording rule.
- For the rendering rewrite (B1+A3), add a test asserting that a colorized row with a hazard glyph in the middle still carries the road-gray style after the glyph (inspect the emitted ANSI string), and a benchmark (`go test -bench`) proving the new render path allocates less than the old one — record the before/after numbers in DECISIONS.md.
- After each phase of the fix order, run the end-to-end script (`scripts/e2e.sh` / Makefile) and keep it green; extend it minimally if a fix changes observable output it asserts on.
- Visually verify the C-section items yourself: start the server, connect with `ssh -tt -p 2222 localhost` (with `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`), and capture frames to confirm: traffic moves down the screen, the explosion animates across frames, fog crawls, consumed repair pads show `[ ]`, the gap has visible crumbled edges, and the wall of death highlights the current player's row. Fix anything that doesn't look right before moving on.
- Commit at the end of each step of the fix order with messages prefixed `ssh-cursed-road:` (e.g. `ssh-cursed-road: fix ANSI reset bug with span-based rendering (B1+A3)`). Do not push.

## Finish line

Done means: every item in REVIEW.md sections A, B, and C is either implemented (checked off in REVIEW.md) or explicitly logged in DECISIONS.md with a one-line reason it was intentionally altered; vet/build/tests/e2e all pass; the game runs and a full join → race → boost-into-a-hazard → die → wall-of-death → spectate → respawn loop works over a real SSH connection with the new visuals. End with a summary listing each REVIEW.md item and what you did for it, plus the render benchmark before/after numbers.
