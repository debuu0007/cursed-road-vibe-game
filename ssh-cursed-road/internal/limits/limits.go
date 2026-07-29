package limits

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"time"
)

var (
	ErrConcurrent = errors.New("too many concurrent sessions from this IP")
	ErrRate       = errors.New("connection rate exceeded")
)

type ipState struct {
	tokens     float64
	last       time.Time
	concurrent int
}

type IPLimiter struct {
	mu            sync.Mutex
	states        map[string]*ipState
	maxConcurrent int
	capacity      float64
	refillPerSec  float64
}

func NewIPLimiter(maxConcurrent, connectionsPerMinute int) *IPLimiter {
	return &IPLimiter{
		states: make(map[string]*ipState), maxConcurrent: maxConcurrent,
		capacity: float64(connectionsPerMinute), refillPerSec: float64(connectionsPerMinute) / 60,
	}
}

func (l *IPLimiter) Acquire(ip string, now time.Time) (func(), error) {
	l.mu.Lock()
	state := l.states[ip]
	if state == nil {
		state = &ipState{tokens: l.capacity, last: now}
		l.states[ip] = state
	}
	elapsed := now.Sub(state.last).Seconds()
	if elapsed > 0 {
		state.tokens = min(l.capacity, state.tokens+elapsed*l.refillPerSec)
		state.last = now
	}
	if state.concurrent >= l.maxConcurrent {
		l.mu.Unlock()
		return nil, ErrConcurrent
	}
	if state.tokens < 1 {
		l.mu.Unlock()
		return nil, ErrRate
	}
	state.tokens--
	state.concurrent++
	l.mu.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			l.mu.Lock()
			state.concurrent--
			l.mu.Unlock()
		})
	}, nil
}

type Gate struct {
	slots   chan struct{}
	waiting atomic.Int64
}

func NewGate(capacity int) *Gate {
	if capacity < 1 {
		capacity = 1
	}
	return &Gate{slots: make(chan struct{}, capacity)}
}

func (g *Gate) Wait(ctx context.Context, update func(ahead int)) (func(), error) {
	select {
	case g.slots <- struct{}{}:
		return g.release(), nil
	default:
	}
	g.waiting.Add(1)
	defer g.waiting.Add(-1)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		update(max(0, int(g.waiting.Load())-1))
		select {
		case g.slots <- struct{}{}:
			return g.release(), nil
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
		}
	}
}

func (g *Gate) release() func() {
	var once sync.Once
	return func() { once.Do(func() { <-g.slots }) }
}
