# Engineering decisions

This file records choices made where `PLAN.md` deliberately leaves details open.

## 2026-07-29

- The module targets Go 1.26, the latest stable language release at build start.
- The default bind address is `0.0.0.0:2222`; `-host` and `-port` are separate flags so local and VPS deployment do not require code changes.
- A run starts after the name prompt; the decorative locked mode picker is folded into the join wall to preserve the five-second connect-to-race goal.
- Player names are normalized to lowercase `[a-z0-9_-]`, truncated to 12 runes, and fall back to `anon_<4hex>`.
- The simulation uses integer cells and metres. The room advances at 20 Hz and publishes every tick; Bubble Tea's renderer performs output diffing.
- Damage status thresholds are 0, 25, 50, 75, and 100. The survival bonus is `max(0, 100-damage)`, making the documented scoring rule explicit and easy to audit.
- A player's local speed nudge is one of `-1, 0, +1`, representing 80%, 100%, and 120% of base speed. It changes the player's vertical band position while room distance remains shared.
- The six local hazard effects use these concrete values: traffic 46 damage, gap 58 damage plus a two-lane relocation, repair 16 healing, oil reversal for four seconds, and slipstream 50% personal progress for two seconds. SHOCK doubles shared scroll speed for four seconds.
- Curse warnings begin 20–45 metres before impact by type. Normal event gaps are 70–140 metres; chained events preserve the specified 8–18 metre spacing and 18% probability.
- Score records are `fsync`ed per death. This favors crash durability over peak write throughput; MVP death frequency is low enough for the tradeoff.
- The join wall lasts two seconds and is any-key skippable. The death wall holds for five seconds for screenshots before entering spectator mode.
- Empty rooms self-terminate after 60 seconds and are pruned lazily by matchmaking on the next join.
- The global queue is deliberately approximate rather than a persistent FIFO identity queue: connections wait on a bounded process-local gate and see a live count of other waiters.
- Graceful drain gives active Bubble Tea sessions two seconds to render the repair notice before the SSH server begins its ten-second shutdown deadline.
- Rooms publish one immutable, shared world snapshot per tick, but each session composes its own terminal-sized road canvas. This differs from the plan's proposed precomposed per-room canvas and keeps resize, color-tier, mono, and local-player overlays simple; it spends more CPU per player and is the first optimization target if profiling shows rendering pressure.
- The scoreboard store retains the required all-time top 50 and today's top 10. At 80×24 the wall renders today's top 10 first and then as many all-time rows as fit; larger terminals show more. Showing all 60 records simultaneously would violate the 80×24 target, so paging/scrolling is left as a known presentation limitation.
- Development landed as one integrated, verified commit rather than five milestone commits. Milestone behavior is separated by packages and tests, but the Git history does not pretend that retrospective empty or non-buildable milestone commits were made.

## Review fixes

- B1+A3: the renderer now carries a style class beside every canvas rune and emits contiguous ANSI spans using a palette built once per SSH session. Cached ANSI prefixes/suffixes avoid per-frame Lipgloss style construction and glyph-search `ReplaceAll` passes while explicitly reopening road gray after every colored span.
- B1+A3 benchmark on Apple M2 (`go test ./internal/render -run '^$' -bench 'Benchmark(Legacy|Span)ColorizeRoad' -benchmem -count=5`): final like-for-like median is legacy 24,083 ns/op, 4,771 B/op, 237 allocs/op versus span 383.6 ns/op, 1,008 B/op, 6 allocs/op. The benchmark keeps the former implementation in test-only code for a reproducible comparison.
- A1: score submissions use a bounded 256-entry queue. Room callers never wait; overflow is dropped with a structured warning. The writer syncs dirty data on a one-second ticker and drains then syncs again on close. A sink seam exists solely to prove at room level that another subscriber receives at least five more ticks while the persistence writer is deliberately blocked after a scored disconnect.
- A2: a monotonic room cursor processes each timeline event exactly once for SHOCK activation. A fixed-seed equivalence test compares every sampled shock state and visible hazard set against the former full-scan behavior through 20,000m.
- B2: ordinary hazards are resolved and positioned from each player's personal distance after that player's speed contribution is applied. The room distance remains the source for base-speed escalation and SHOCK scheduling; SHOCK events are filtered out of personalized road-hazard views so a boosted player cannot trigger or preview a room-global shock early.
- C1: traffic begins its approach 80m ahead and advances toward the player at 1.6× virtual oncoming speed. A single `trafficPosition` function drives both personalized snapshots and collision checks; the warning occupies a stable visible row immediately before approach.
- C2: damage records a three-tick hit window in authoritative player state, exposed as a boolean view flag and rendered with a cached bold reverse-red car style.
- C3: the two-second exploding state is divided into four ten-tick animation phases, with distinct Unicode and mono-safe frame sets.
- C1–C3 visual verification: a freshly rebuilt real SSH run captured 63 traffic glyph updates spanning terminal rows 2–23, two mono hit-car frames (`▓██▓`), and all three post-impact mono explosion expansions (`***`, `* *`, `. .`) before the wall. The E2E harness now retains its full ignored client transcript so these claims remain inspectable after each run.
- A4: the general session maintenance timer now wakes every five seconds; phase C9 will add a separate 500ms timer scoped strictly to the name screen for cursor animation.
- A5: color tier comes exclusively from the Wish/Lipgloss session renderer profile: truecolor maps to the full palette, ASCII to mono, and other ANSI profiles to the renderer-downsampled color palette.
- A6: only headers are padded for deliberate full-width redraw semantics. Wall lines, road rows, and footers truncate at the terminal boundary without trailing fill bytes.
- A7: the second same-direction steering press within 150ms emits two room inputs. Direction changes and slower repeats remain single-cell moves.
- B3: disconnect scores require an active, unrecorded racing player at an inclusive 100m threshold.
- B4: the HUD counts `Racing` players separately and labels all exploding/spectating participants as ghosts.
- B5: gap interiors remain void, while their first and last rows alternate `▚▞` across the affected lane in mono and color tiers.
- B6: the public host-key companion is ignored with `/host_ed25519*`; the name blocklist is centralized; `Close` remains intentionally limited to the mutex-protected subscription; and death walls accept any key after a two-second unskippable screenshot window while retaining the five-second automatic transition.
- C4: lane-dash phase uses a speed-scaled 2–5m divisor; SHOCK/slipstream add deterministic edge streaks; an active slipstream adds two green carets behind the local car. Engine speed display receives a deterministic −2/0/+2 km/h wobble without changing physics.
- C5: even SHOCK ticks shift the composed canvas upward and right by one cell, with a blank replacement row preserving terminal height; road borders switch from dim yellow to bold red for the entire SHOCK.
- C6: the cached palette now covers road borders and HUD spans. Damage bars follow green/yellow/red/dark-red thresholds, while remote glyphs and lane-clipped names share faint cyan.
- C7: fog texture phase advances every three ticks and remote cars on fog rows are omitted; the local car remains visible for playability.
- C8: consumed repairs render as faint `[ ]` and remain in personalized hazard views for 22m behind the player, long enough to move clear of the local car and visibly show the sniped pad.
- C9: the title uses a two-row car logo, styled selected/locked modes, and a 500ms cursor timer that stops rearming immediately after the name screen.
- C10: the wall is a terminal-sized box with colored top-three ranks, a bold reverse current-player row, faint sharing copy, and footer-first space reservation down to the 60×16 minimum.
- C11: title, entering, reconnect, closed, and middleware queue states share the centered card language. Racing stays on `ENTERING THE ROAD…` until a nonzero snapshot arrives.
- C4–C11 real-terminal verification: the final freshly built xterm-256color SSH transcript contains 79 moving-traffic updates, 82,518 animated fog cells, 452 crumbled-gap glyphs, 7,816 speed streak/trail glyphs, all four explosion phases, 23 reverse-video spans, two `FIELD REPAIR` flashes followed by 11 visible `[ ]` spent-pad frames, the protected share/skip footer, spectator mode, and a successful respawn. The run died at 2,836m, then completed the shutdown-drain scenario.
- Finish-line E2E uses discrete 60ms-separated steering keys because SSH/Bubble Tea may legitimately batch an injected multi-rune burst into one unknown key message. A separate final run pressed `w`, met and died on the 1,112m road gap earlier than the unboosted trajectory, showed the wall, spectated, respawned, quit cleanly, and passed queue/drain checks.
