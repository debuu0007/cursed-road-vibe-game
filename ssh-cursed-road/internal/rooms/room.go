package rooms

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"sync/atomic"
	"time"

	"cursedroad/internal/curse"
	"cursedroad/internal/game"
	"cursedroad/internal/score"
)

const (
	MaxPlayers       = 20
	TickRate         = 20
	DefaultWorldSeed = int64(0xC012ED)
	trafficLead      = 80.0
	trafficSpeed     = 1.6
)

type Subscription struct {
	PlayerID string
	Updates  <-chan game.Snapshot
	room     *Room
}

func (s Subscription) Send(kind game.InputKind) bool {
	select {
	case s.room.inbox <- inputMessage{input: game.Input{PlayerID: s.PlayerID, Kind: kind}}:
		return true
	default:
		return false
	}
}

func (s Subscription) Close() {
	select {
	case s.room.inbox <- leaveMessage{playerID: s.PlayerID}:
	default:
		go func() {
			select {
			case s.room.inbox <- leaveMessage{playerID: s.PlayerID}:
			case <-s.room.stopped:
			}
		}()
	}
}

type subscriber struct {
	player *game.Player
	frames chan game.Snapshot
}

type joinMessage struct {
	name  string
	reply chan Subscription
}

type leaveMessage struct{ playerID string }
type inputMessage struct{ input game.Input }

type Room struct {
	id      string
	seed    int64
	inbox   chan any
	count   atomic.Int32
	stopped chan struct{}
	scores  *score.Store
}

func NewRoom(ctx context.Context, id string, seed int64, scores *score.Store) *Room {
	r := &Room{id: id, seed: seed, inbox: make(chan any, 256), stopped: make(chan struct{}), scores: scores}
	slog.Info("room born", "room", id, "seed", seed)
	go r.run(ctx)
	return r
}

func (r *Room) ID() string               { return r.id }
func (r *Room) Seed() int64              { return r.seed }
func (r *Room) PlayerCount() int         { return int(r.count.Load()) }
func (r *Room) Stopped() <-chan struct{} { return r.stopped }

func (r *Room) IsStopped() bool {
	select {
	case <-r.stopped:
		return true
	default:
		return false
	}
}

func (r *Room) Join(ctx context.Context, name string) (Subscription, error) {
	reply := make(chan Subscription, 1)
	select {
	case r.inbox <- joinMessage{name: name, reply: reply}:
	case <-ctx.Done():
		return Subscription{}, ctx.Err()
	case <-r.stopped:
		return Subscription{}, fmt.Errorf("room stopped")
	}
	select {
	case subscription := <-reply:
		return subscription, nil
	case <-ctx.Done():
		return Subscription{}, ctx.Err()
	case <-r.stopped:
		return Subscription{}, fmt.Errorf("room stopped")
	}
}

func (r *Room) run(ctx context.Context) {
	defer func() {
		close(r.stopped)
		slog.Info("room closed", "room", r.id)
	}()
	ticker := time.NewTicker(time.Second / TickRate)
	defer ticker.Stop()
	players := make(map[string]*subscriber)
	defer func() {
		if recovered := recover(); recovered != nil {
			slog.Error("room crashed", "room", r.id, "panic", recovered)
		}
		for _, sub := range players {
			close(sub.frames)
		}
	}()
	timeline := curse.Generate(r.seed, 1_000_000)
	resolved := make(map[int]map[string]bool)
	consumed := make(map[int]bool)
	distance := 0.0
	var tick uint64
	var nextID uint64
	var shockUntil uint64
	var timelineCursor int
	emptySince := time.Now()

	for {
		select {
		case <-ctx.Done():
			return
		case raw := <-r.inbox:
			switch msg := raw.(type) {
			case joinMessage:
				if len(players) >= MaxPlayers {
					msg.reply <- Subscription{}
					continue
				}
				nextID++
				id := fmt.Sprintf("%s-p%d", r.id, nextID)
				p := game.NewPlayer(id, msg.name)
				frames := make(chan game.Snapshot, 1)
				players[id] = &subscriber{player: &p, frames: frames}
				r.count.Store(int32(len(players)))
				msg.reply <- Subscription{PlayerID: id, Updates: frames, room: r}
			case leaveMessage:
				if sub, ok := players[msg.playerID]; ok {
					if sub.player.State == game.Racing && !sub.player.ScoreRecorded && r.scores != nil {
						sub.player.Cause = "LEFT THE ROAD"
						r.scores.Record(sub.player.Name, sub.player.Distance, sub.player.Damage, sub.player.Cause)
						sub.player.ScoreRecorded = true
					}
					delete(players, msg.playerID)
					close(sub.frames)
					r.count.Store(int32(len(players)))
				}
			case inputMessage:
				applyInput(players[msg.input.PlayerID], msg.input, tick)
			}
		case now := <-ticker.C:
			if len(players) == 0 {
				if now.Sub(emptySince) >= 60*time.Second {
					return
				}
			} else {
				emptySince = now
			}
			tick++
			shock := tick < shockUntil
			speedMultiplier := 1.0
			if shock {
				speedMultiplier = 2
			}
			distance += game.BaseSpeed(distance) * speedMultiplier / 3.6 / TickRate
			_, shockWarning := activeHazards(timeline, distance, consumed)
			timelineCursor, shockUntil, shock = advanceTimeline(timeline, timelineCursor, distance, consumed, tick, shockUntil)
			ids := make([]string, 0, len(players))
			for id := range players {
				ids = append(ids, id)
			}
			sort.Strings(ids)
			for _, id := range ids {
				p := players[id].player
				advancePlayer(p, timeline, resolved, consumed, distance, speedMultiplier, tick)
				if p.State == game.Exploding && p.DeathTick == 0 {
					p.DeathTick = tick
				}
				if p.State == game.Exploding && tick-p.DeathTick >= 2*TickRate {
					p.State = game.Spectating
				}
				if p.State != game.Racing && !p.ScoreRecorded && r.scores != nil {
					r.scores.Record(p.Name, p.Distance, p.Damage, p.Cause)
					p.ScoreRecorded = true
				}
			}
			views := make([]game.PlayerView, 0, len(players))
			for _, sub := range players {
				p := sub.player
				views = append(views, game.ViewOf(*p, tick))
			}
			sort.Slice(views, func(i, j int) bool { return views[i].ID < views[j].ID })
			for _, sub := range players {
				personalHazards := activePlayerHazards(timeline, sub.player.Distance, consumed)
				snapshot := game.Snapshot{
					RoomID: r.id, Seed: r.seed, Tick: tick, Distance: distance, Players: views,
					CreatedAt: now, Hazards: personalHazards, Shock: shock, ShockWarning: shockWarning,
				}
				PublishLatest(sub.frames, snapshot)
			}
		}
	}
}

func activePlayerHazards(timeline []curse.Event, distance float64, consumed map[int]bool) []game.HazardView {
	hazards, _ := activeHazards(timeline, distance, consumed)
	visible := hazards[:0]
	for _, hazard := range hazards {
		if hazard.Kind != string(curse.Shock) {
			if hazard.Kind == string(curse.Traffic) {
				if distance < hazard.Distance-trafficLead {
					hazard.Warning = true
					hazard.Distance = distance + 60
				} else {
					hazard.Warning = false
					hazard.Distance = trafficPosition(hazard.Distance, distance)
				}
			}
			visible = append(visible, hazard)
		}
	}
	return visible
}

func trafficPosition(eventDistance, playerDistance float64) float64 {
	progress := playerDistance - (eventDistance - trafficLead)
	if progress <= 0 {
		return eventDistance
	}
	return eventDistance - progress*trafficSpeed
}

func advancePlayer(player *game.Player, timeline []curse.Event, resolved map[int]map[string]bool, consumed map[int]bool, roomDistance, speedMultiplier float64, tick uint64) {
	if player.State != game.Racing {
		return
	}
	personalSpeed := 1.0 + float64(player.SpeedNudge)*0.2
	if tick < player.SlipstreamUntil {
		personalSpeed *= 1.5
	}
	player.Distance += game.BaseSpeed(roomDistance) * speedMultiplier * personalSpeed / 3.6 / TickRate
	player.RowOffset = -player.SpeedNudge * 2
	resolveHazards(player, timeline, resolved, consumed, player.Distance, tick)
}

func advanceTimeline(timeline []curse.Event, cursor int, distance float64, consumed map[int]bool, tick, shockUntil uint64) (int, uint64, bool) {
	shock := tick < shockUntil
	for cursor < len(timeline) && timeline[cursor].Distance <= distance {
		event := timeline[cursor]
		if event.Kind == curse.Shock && !consumed[event.ID] {
			shockUntil = tick + 4*TickRate
			shock = true
			consumed[event.ID] = true
		}
		cursor++
	}
	return cursor, shockUntil, shock
}

func applyInput(sub *subscriber, input game.Input, tick uint64) {
	if sub == nil {
		return
	}
	switch input.Kind {
	case game.SteerLeft:
		sub.player.Steer(-1, tick < sub.player.ReverseUntil)
	case game.SteerRight:
		sub.player.Steer(1, tick < sub.player.ReverseUntil)
	case game.SpeedUp:
		sub.player.Nudge(1)
	case game.SpeedDown:
		sub.player.Nudge(-1)
	case game.Respawn:
		if sub.player.State == game.Spectating {
			fresh := game.NewPlayer(sub.player.ID, sub.player.Name)
			*sub.player = fresh
		}
	}
}

func activeHazards(timeline []curse.Event, distance float64, consumed map[int]bool) ([]game.HazardView, bool) {
	hazards := make([]game.HazardView, 0, 8)
	shockWarning := false
	start := sort.Search(len(timeline), func(i int) bool { return timeline[i].Distance >= distance-130 })
	for _, event := range timeline[start:] {
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

func resolveHazards(player *game.Player, timeline []curse.Event, resolved map[int]map[string]bool, consumed map[int]bool, distance float64, tick uint64) {
	if player.State != game.Racing {
		return
	}
	start := sort.Search(len(timeline), func(i int) bool { return timeline[i].Distance >= distance-120 })
	for _, event := range timeline[start:] {
		if event.Distance > distance+90 {
			break
		}
		collisionDistance := event.Distance
		if event.Kind == curse.Traffic {
			collisionDistance = trafficPosition(event.Distance, distance)
		}
		if collisionDistance > distance+2 || distance > collisionDistance+event.Length {
			continue
		}
		if event.Kind == curse.Fog || event.Kind == curse.Shock {
			continue
		}
		if player.Lane != event.Lane {
			continue
		}
		if resolved[event.ID] == nil {
			resolved[event.ID] = make(map[string]bool)
		}
		if resolved[event.ID][player.ID] {
			continue
		}
		resolved[event.ID][player.ID] = true
		switch event.Kind {
		case curse.Oil:
			player.ReverseUntil = tick + 4*TickRate
			player.Flash = "CONTROLS REVERSED"
			player.FlashUntil = player.ReverseUntil
		case curse.Traffic:
			player.ApplyDamage(46, "WRONG-WAY TRAFFIC", tick)
			player.FlashUntil = tick + 2*TickRate
		case curse.Slipstream:
			player.SlipstreamUntil = tick + 2*TickRate
			player.Flash = "SLIPSTREAM +50%"
			player.FlashUntil = player.SlipstreamUntil
		case curse.Repair:
			if !consumed[event.ID] {
				consumed[event.ID] = true
				player.Repair(16)
				player.FlashUntil = tick + 2*TickRate
			}
		case curse.Gap:
			player.ApplyDamage(58, "ROAD GAP", tick)
			player.FlashUntil = tick + 2*TickRate
			player.Lane = (player.Lane + 2) % game.LaneCount
		}
	}
}

func PublishLatest(channel chan game.Snapshot, snapshot game.Snapshot) {
	select {
	case channel <- snapshot:
		return
	default:
	}
	select {
	case <-channel:
	default:
	}
	select {
	case channel <- snapshot:
	default:
	}
}
