package rooms

import (
	"context"
	"fmt"
	"reflect"
	"testing"
	"time"

	"cursedroad/internal/curse"
	"cursedroad/internal/game"
)

func TestPublishLatestDropsOldSnapshot(t *testing.T) {
	frames := make(chan game.Snapshot, 1)
	PublishLatest(frames, game.Snapshot{Tick: 1})
	PublishLatest(frames, game.Snapshot{Tick: 2})
	if got := (<-frames).Tick; got != 2 {
		t.Fatalf("got tick %d, want latest tick 2", got)
	}
}

func TestTimelineCursorMatchesFullScanOnFixedSeed(t *testing.T) {
	timeline := curse.Generate(DefaultWorldSeed, 20_000)
	cursorConsumed := make(map[int]bool)
	legacyConsumed := make(map[int]bool)
	var cursor int
	var cursorShockUntil, legacyShockUntil uint64
	for tick, distance := uint64(1), 0.0; distance < 20_000; tick, distance = tick+1, distance+7.25 {
		var cursorShock bool
		cursor, cursorShockUntil, cursorShock = advanceTimeline(timeline, cursor, distance, cursorConsumed, tick, cursorShockUntil)
		var legacyShock bool
		legacyShockUntil, legacyShock = legacyFullShockScan(timeline, distance, legacyConsumed, tick, legacyShockUntil)
		if cursorShock != legacyShock || cursorShockUntil != legacyShockUntil {
			t.Fatalf("shock mismatch at %.2fm: cursor=%v/%d legacy=%v/%d", distance, cursorShock, cursorShockUntil, legacyShock, legacyShockUntil)
		}
		gotHazards, gotWarning := activeHazards(timeline, distance, cursorConsumed)
		wantHazards, wantWarning := legacyFullActiveHazards(timeline, distance, cursorConsumed)
		if !reflect.DeepEqual(gotHazards, wantHazards) || gotWarning != wantWarning {
			t.Fatalf("hazard mismatch at %.2fm", distance)
		}
	}
}

func legacyFullShockScan(timeline []curse.Event, distance float64, consumed map[int]bool, tick, shockUntil uint64) (uint64, bool) {
	shock := tick < shockUntil
	for _, event := range timeline {
		if event.Distance > distance {
			break
		}
		if event.Kind == curse.Shock && !consumed[event.ID] {
			shockUntil = tick + 4*TickRate
			shock = true
			consumed[event.ID] = true
		}
	}
	return shockUntil, shock
}

func legacyFullActiveHazards(timeline []curse.Event, distance float64, consumed map[int]bool) ([]game.HazardView, bool) {
	hazards := make([]game.HazardView, 0, 8)
	shockWarning := false
	for _, event := range timeline {
		if event.Distance < distance-130 {
			continue
		}
		if event.Distance > distance+125 {
			break
		}
		if distance > event.Distance+event.Length+8 {
			continue
		}
		if event.Kind == curse.Shock && distance >= event.WarningDistance && distance < event.Distance {
			shockWarning = true
		}
		if event.Distance >= distance-8 && event.Distance <= distance+90 {
			hazards = append(hazards, game.HazardView{
				ID: event.ID, Kind: string(event.Kind), Distance: event.Distance,
				Lane: event.Lane, Length: event.Length,
				Warning:  distance >= event.WarningDistance && distance < event.Distance,
				Consumed: consumed[event.ID],
			})
		}
	}
	return hazards, shockWarning
}

func TestHazardResolutionAndContestedRepair(t *testing.T) {
	traffic := curse.Event{ID: 1, Kind: curse.Traffic, Distance: 100, Lane: 2, Length: 10}
	resolved := make(map[int]map[string]bool)
	consumed := make(map[int]bool)
	p := game.NewPlayer("p1", "alice")
	resolveHazards(&p, []curse.Event{traffic}, resolved, consumed, 100, 10)
	if p.Damage != 46 {
		t.Fatalf("traffic damage = %d, want 46", p.Damage)
	}

	repair := curse.Event{ID: 2, Kind: curse.Repair, Distance: 110, Lane: 2, Length: 10}
	first := game.NewPlayer("p2", "first")
	second := game.NewPlayer("p3", "second")
	first.Damage, second.Damage = 50, 50
	resolveHazards(&first, []curse.Event{repair}, resolved, consumed, 110, 20)
	resolveHazards(&second, []curse.Event{repair}, resolved, consumed, 110, 20)
	if first.Damage != 34 || second.Damage != 50 {
		t.Fatalf("repair result first/second = %d/%d", first.Damage, second.Damage)
	}
}

func TestMatchmakingFillsNewestRoomThenCreates(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	m := NewManager(ctx, DefaultWorldSeed, nil)
	defer m.Close()
	joinCtx, joinCancel := context.WithTimeout(ctx, 2*time.Second)
	defer joinCancel()
	var subscriptions []Subscription
	for i := 0; i < MaxPlayers+1; i++ {
		sub, err := m.Join(joinCtx, fmt.Sprintf("p%d", i))
		if err != nil {
			t.Fatal(err)
		}
		subscriptions = append(subscriptions, sub)
	}
	if got := m.RoomCount(); got != 2 {
		t.Fatalf("room count = %d, want 2", got)
	}
	for _, sub := range subscriptions {
		sub.Close()
	}
}
