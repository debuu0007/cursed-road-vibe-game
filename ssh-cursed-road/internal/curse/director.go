package curse

import (
	"math/rand"
)

type Kind string

const (
	Oil        Kind = "oil"
	Fog        Kind = "fog"
	Traffic    Kind = "traffic"
	Slipstream Kind = "slipstream"
	Repair     Kind = "repair"
	Gap        Kind = "gap"
	Shock      Kind = "shock"
)

type Event struct {
	ID              int
	Kind            Kind
	Distance        float64
	WarningDistance float64
	Lane            int
	Length          float64
	Chained         bool
}

var weightedKinds = []Kind{
	Oil, Oil, Oil,
	Fog, Fog,
	Traffic, Traffic, Traffic,
	Slipstream, Slipstream,
	Repair,
	Gap, Gap,
	Shock,
}

func Generate(seed int64, maximumDistance float64) []Event {
	rng := rand.New(rand.NewSource(seed))
	events := make([]Event, 0, int(maximumDistance/90))
	distance := 85.0 + rng.Float64()*35
	for distance < maximumDistance {
		kind := weightedKinds[rng.Intn(len(weightedKinds))]
		event := newEvent(len(events)+1, kind, distance, rng.Intn(5), false)
		events = append(events, event)
		if rng.Float64() < 0.18 {
			distance += 8 + rng.Float64()*10
			chainedKind := weightedKinds[rng.Intn(len(weightedKinds))]
			events = append(events, newEvent(len(events)+1, chainedKind, distance, rng.Intn(5), true))
		}
		distance += 70 + rng.Float64()*70
	}
	return events
}

func newEvent(id int, kind Kind, distance float64, lane int, chained bool) Event {
	length := 14.0
	lead := 28.0
	switch kind {
	case Fog:
		length = 45
		lead = 20
	case Slipstream:
		length = 32
	case Shock:
		length = 120
		lead = 45
	case Traffic:
		lead = 38
	case Gap:
		length = 8
		lead = 32
	}
	return Event{ID: id, Kind: kind, Distance: distance, WarningDistance: distance - lead, Lane: lane, Length: length, Chained: chained}
}
