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
