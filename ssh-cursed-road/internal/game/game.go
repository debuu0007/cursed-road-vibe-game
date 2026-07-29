package game

import (
	"fmt"
	"math"
	"time"
)

const (
	MaxDamage   = 100
	DefaultLane = 2
	LaneCount   = 5
)

type PlayerState string

const (
	Racing     PlayerState = "racing"
	Exploding  PlayerState = "exploding"
	Spectating PlayerState = "spectating"
)

type Player struct {
	ID              string
	Name            string
	Lane            int
	RowOffset       int
	SpeedNudge      int
	Damage          int
	Distance        float64
	State           PlayerState
	Cause           string
	Flash           string
	ReverseUntil    uint64
	SlipstreamUntil uint64
	DeathTick       uint64
	ScoreRecorded   bool
	FlashUntil      uint64
	HitUntil        uint64
}

type InputKind int

const (
	SteerLeft InputKind = iota
	SteerRight
	SpeedUp
	SpeedDown
	Respawn
)

type Input struct {
	PlayerID string
	Kind     InputKind
}

type PlayerView struct {
	ID         string
	Name       string
	Lane       int
	RowOffset  int
	SpeedNudge int
	Damage     int
	Distance   float64
	State      PlayerState
	Cause      string
	Flash      string
	Reversed   bool
	Slipstream bool
	DeathTick  uint64
	Hit        bool
}

type HazardView struct {
	ID       int
	Kind     string
	Distance float64
	Lane     int
	Length   float64
	Warning  bool
	Consumed bool
}

type Snapshot struct {
	RoomID       string
	Seed         int64
	Tick         uint64
	Distance     float64
	Players      []PlayerView
	CreatedAt    time.Time
	Hazards      []HazardView
	Shock        bool
	ShockWarning bool
}

func ViewOf(p Player, tick uint64) PlayerView {
	flash := p.Flash
	if p.FlashUntil > 0 && tick >= p.FlashUntil {
		flash = ""
	}
	return PlayerView{
		ID: p.ID, Name: p.Name, Lane: p.Lane, RowOffset: p.RowOffset,
		SpeedNudge: p.SpeedNudge, Damage: p.Damage, Distance: p.Distance,
		State: p.State, Cause: p.Cause, Flash: flash,
		Reversed: tick < p.ReverseUntil, Slipstream: tick < p.SlipstreamUntil,
		DeathTick: p.DeathTick, Hit: tick < p.HitUntil,
	}
}

func NewPlayer(id, name string) Player {
	return Player{ID: id, Name: name, Lane: DefaultLane, State: Racing}
}

func (p *Player) Steer(direction int, reversed bool) {
	if p.State != Racing {
		return
	}
	if reversed {
		direction = -direction
	}
	p.Lane = clamp(p.Lane+direction, 0, LaneCount-1)
}

func (p *Player) Nudge(direction int) {
	if p.State != Racing {
		return
	}
	p.SpeedNudge = clamp(p.SpeedNudge+direction, -1, 1)
}

func (p *Player) ApplyDamage(amount int, cause string, tick uint64) bool {
	if p.State != Racing || amount <= 0 {
		return false
	}
	p.Damage = clamp(p.Damage+amount, 0, MaxDamage)
	p.HitUntil = tick + 3
	p.Flash = fmt.Sprintf("HIT: %s (+%d)", cause, amount)
	if p.Damage >= MaxDamage {
		p.State = Exploding
		p.Cause = cause
		return true
	}
	return false
}

func (p *Player) Repair(amount int) {
	if p.State != Racing || amount <= 0 {
		return
	}
	p.Damage = clamp(p.Damage-amount, 0, MaxDamage)
	p.Flash = "FIELD REPAIR"
}

func SurvivalStatus(damage int) string {
	switch {
	case damage >= 100:
		return "Flatlined"
	case damage >= 75:
		return "Needs Hospital"
	case damage >= 50:
		return "Barely Conscious"
	case damage >= 25:
		return "Shaken But Alive"
	default:
		return "Perfectly Fine"
	}
}

func Score(distance float64, damage int) int {
	bonus := 100 - clamp(damage, 0, MaxDamage)
	return int(math.Floor(math.Max(0, distance))) + bonus
}

func BaseSpeed(distance float64) float64 {
	return math.Min(260, 110+distance/35)
}

func DisplaySpeed(distance float64, nudge int, shock bool) int {
	multiplier := 1.0 + float64(clamp(nudge, -1, 1))*0.2
	if shock {
		multiplier *= 2
	}
	return int(math.Round(BaseSpeed(distance) * multiplier))
}

func clamp(value, low, high int) int {
	if value < low {
		return low
	}
	if value > high {
		return high
	}
	return value
}
