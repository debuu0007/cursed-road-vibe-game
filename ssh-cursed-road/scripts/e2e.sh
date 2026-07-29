#!/bin/sh
set -eu

PORT="${PORT:-22229}"
SERVER_BIN="${SERVER_BIN:-./cursedroad}"
STATE_DIR=".e2e/run-$$"
SCORES_PATH="$STATE_DIR/scores.jsonl"
export PORT SCORES_PATH

if nc -z 127.0.0.1 "$PORT" 2>/dev/null; then
  echo "test port $PORT is already in use" >&2
  exit 1
fi

mkdir -p "$STATE_DIR"
"$SERVER_BIN" -host 127.0.0.1 -port "$PORT" \
  -host-key "$STATE_DIR/host_ed25519" -scores "$STATE_DIR/scores.jsonl" -max-sessions 2 \
  >"$STATE_DIR/server.log" 2>&1 &
server_pid=$!
SERVER_PID=$server_pid
export SERVER_PID

cleanup() {
  if [ -n "${server_pid:-}" ]; then
    kill -TERM "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

attempt=0
while ! nc -z 127.0.0.1 "$PORT" 2>/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 50 ]; then
    echo "server did not become ready" >&2
    exit 1
  fi
  sleep 0.1
done

expect <<'EXPECT'
set timeout 12
set port $env(PORT)
set ssh_opts [list -tt -p $port -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR]
stty rows 24 columns 80
log_user 0

spawn ssh {*}$ssh_opts road@127.0.0.1
set alice $spawn_id
stty rows 24 columns 80 < $spawn_out(slave,name)
expect -i $alice "who dies today?"
send -i $alice "alice\r"
after 300
send -i $alice " "
expect -i $alice -re {SPD +[0-9]+ km/h}
send -i $alice "dddd"
after 250

spawn ssh {*}$ssh_opts road@127.0.0.1
set bob $spawn_id
stty rows 24 columns 80 < $spawn_out(slave,name)
expect -i $bob "who dies today?"
send -i $bob "bob\r"
after 300
send -i $bob " "
expect -i $bob -re {SPD +[0-9]+ km/h}
expect -i $bob "◇"

expect -i $alice "◇"

# The third same-IP connection is admitted but queued behind the global cap.
spawn ssh {*}$ssh_opts road@127.0.0.1
set charlie $spawn_id
stty rows 24 columns 80 < $spawn_out(slave,name)
expect -i $charlie "QUEUE TO THE ROAD"

# It also occupies the third per-IP allowance, so a fourth is rejected.
spawn ssh {*}$ssh_opts road@127.0.0.1
set delta $spawn_id
stty rows 24 columns 80 < $spawn_out(slave,name)
expect -i $delta "the road is crowded"
expect -i $delta eof

send -i $bob "q"
expect -i $bob eof
expect -i $charlie "who dies today?"
send -i $charlie "\003"
expect -i $charlie eof

# Reassert lane 4, where the fixed seed has traffic at 446m followed by a
# lethal gap at 1,113m. Repeated input is safe because steering clamps at the
# road edge.
# This validates the real SSH death loop without a test-only server backdoor.
send -i $alice "dddd"
log_user 0
set died 0
for {set i 0} {$i < 400} {incr i} {
  after 150
  if {[file exists $env(SCORES_PATH)]} {
    set score_file [open $env(SCORES_PATH) r]
    set score_data [read $score_file]
    close $score_file
    if {[regexp {"name":"alice".*"status":"Flatlined"} $score_data]} {
      set died 1
    }
  }
  if {$died} {
    break
  }
}
if {!$died} {
  puts stderr "did not reach the death wall within 60 seconds"
  exit 1
}

set timeout 12
expect -i $alice "SPECTATING"
send -i $alice "r"
expect -i $alice "Perfectly Fine"
send -i $alice "q"
expect -i $alice eof

# A final client verifies graceful drain messaging and server shutdown.
spawn ssh {*}$ssh_opts road@127.0.0.1
set drain $spawn_id
stty rows 24 columns 80 < $spawn_out(slave,name)
expect -i $drain "who dies today?"
send -i $drain "drain\r"
after 300
send -i $drain " "
expect -i $drain -re {SPD +[0-9]+ km/h}
exec kill -TERM $env(SERVER_PID)
expect -i $drain "ROAD CLOSED FOR REPAIRS"
catch {expect -i $drain eof}
log_user 1
puts "E2E PASS: two SSH clients raced in one room and saw each other"
puts "E2E PASS: death wall, spectator mode, respawn, and clean quit"
puts "E2E PASS: global queue, per-IP rejection, and SIGTERM drain"
EXPECT

wait "$server_pid"
server_pid=""
printf 'passed\n' >"$STATE_DIR/passed"
