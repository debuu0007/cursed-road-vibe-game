# ssh cursed.road

`ssh cursed.road` is a multiplayer ASCII racing game served directly over SSH. Up to 20 players share one deterministic cursed road while remaining collision-free ghosts to one another.

## Run locally

Requirements: Go 1.26 or newer and an OpenSSH client.

```sh
go build ./cmd/cursedroad
./cursedroad -port 2222
```

In another terminal:

```sh
ssh -p 2222 localhost
```

The first start creates a persistent `host_ed25519` host key and an append-only `scores.jsonl` wall of death. Their paths can be changed with `-host-key` and `-scores`.

Run all static checks and tests with `make check`. Run the repeatable two-client SSH smoke test with `make e2e`.

## Controls

- `a` / `d` or arrow keys: steer
- `w` / `s` or arrow keys: nudge speed up/down
- `m`: force mono rendering
- `q` or `Ctrl+C`: quit
- `r`: respawn while spectating

Damage reaches 100 rather than killing instantly. Death records the run, shows the wall of death, then leaves the player spectating the same room.

## Server flags

```text
-host string          listen host (default "0.0.0.0")
-port int             listen port (default 2222)
-host-key string      persistent SSH host key path (default "host_ed25519")
-scores string        append-only scoreboard path (default "scores.jsonl")
-max-sessions int     global active session cap (default 300)
```

Do not expose the development default on port 22 until the host's administrative SSH service has safely moved elsewhere or is reachable through a private network.

## systemd deployment

Build the binary on the target (or cross-compile it), create an unprivileged `cursedroad` user, and keep the host key and scoreboard under `/var/lib/cursedroad`:

```ini
[Unit]
Description=ssh cursed.road
After=network-online.target
Wants=network-online.target

[Service]
User=cursedroad
Group=cursedroad
WorkingDirectory=/var/lib/cursedroad
ExecStart=/usr/local/bin/cursedroad -host 0.0.0.0 -port 22 -host-key /var/lib/cursedroad/host_ed25519 -scores /var/lib/cursedroad/scores.jsonl
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/cursedroad
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

Then run `systemctl daemon-reload && systemctl enable --now cursedroad`. Back up `host_ed25519`; replacing it makes returning players see an SSH host-key warning. SIGTERM initiates a short drain, shows connected players `ROAD CLOSED FOR REPAIRS`, flushes scores, and exits.

## Architecture

Wish accepts SSH sessions and starts one Bubble Tea model per player. A single-writer goroutine owns each 20-player room at 20 ticks per second. Sessions send typed inputs and consume immutable, buffer-one snapshots; slow terminals drop old frames. The seeded Curse Director produces a shared distance-keyed timeline, and score persistence is append-only JSONL.

There is intentionally no shell, browser server, database, identity system, daily challenge, private-room routing, or player collision system in the MVP.

## Known limitations and plan deviations

- Rooms share immutable simulation snapshots, while each SSH session composes its own canvas for its terminal dimensions and color tier. The design's proposed compose-once shared canvas optimization is not implemented yet.
- The score store keeps all-time top 50 and today's top 10, but an 80×24 screen displays today's list plus only the all-time rows that fit. Larger terminals expose more rows; interactive scoreboard paging is not part of this MVP.
- The profanity filter is intentionally small and heuristic. The strict character whitelist prevents terminal injection, but the word list is not a comprehensive moderation system.
- The global admission queue is process-local and approximate rather than a durable, strictly ordered queue.
