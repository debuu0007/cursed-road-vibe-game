package rooms

import (
	"context"
	"fmt"
	"sync"

	"cursedroad/internal/score"
)

type Manager struct {
	ctx     context.Context
	cancel  context.CancelFunc
	mu      sync.Mutex
	rooms   []*Room
	counter int64
	seed    int64
	scores  *score.Store
}

func NewManager(parent context.Context, seed int64, scores *score.Store) *Manager {
	ctx, cancel := context.WithCancel(parent)
	return &Manager{ctx: ctx, cancel: cancel, seed: seed, scores: scores}
}

func (m *Manager) Join(ctx context.Context, name string) (Subscription, error) {
	m.mu.Lock()
	active := m.rooms[:0]
	for _, room := range m.rooms {
		if !room.IsStopped() {
			active = append(active, room)
		}
	}
	m.rooms = active
	var target *Room
	for i := len(m.rooms) - 1; i >= 0; i-- {
		if m.rooms[i].PlayerCount() < MaxPlayers {
			target = m.rooms[i]
			break
		}
	}
	if target == nil {
		m.counter++
		target = NewRoom(m.ctx, fmt.Sprintf("road-%d", m.counter), m.seed+m.counter-1, m.scores)
		m.rooms = append(m.rooms, target)
	}
	m.mu.Unlock()

	subscription, err := target.Join(ctx, name)
	if err != nil {
		return Subscription{}, err
	}
	if subscription.PlayerID == "" {
		return m.Join(ctx, name)
	}
	return subscription, nil
}

func (m *Manager) RoomCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.rooms)
}

func (m *Manager) Close() {
	m.cancel()
	m.mu.Lock()
	rooms := append([]*Room(nil), m.rooms...)
	m.mu.Unlock()
	for _, room := range rooms {
		<-room.Stopped()
	}
}
