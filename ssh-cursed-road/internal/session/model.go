package session

import (
	"context"
	"crypto/rand"
	"fmt"
	"strings"
	"sync"
	"time"
	"unicode"

	"cursedroad/internal/game"
	"cursedroad/internal/render"
	"cursedroad/internal/rooms"
	"cursedroad/internal/score"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/muesli/termenv"
)

type screen int

const (
	nameScreen screen = iota
	joinWallScreen
	racingScreen
	deathWallScreen
	spectatorScreen
	closedScreen
	reconnectScreen
)

type tickMsg time.Time
type snapshotMsg game.Snapshot
type roomClosedMsg struct{}
type joinReadyMsg struct{}
type deathWallDoneMsg struct{}
type deathWallSkippableMsg struct{}
type idleQuitMsg struct{}
type roadClosedMsg struct{}
type titleBlinkMsg struct{}
type rejoinedMsg struct{ sub rooms.Subscription }

var blockedNames = []string{"fuck", "shit", "cunt", "nigger", "nazi"}

type Model struct {
	width              int
	height             int
	screen             screen
	nameInput          []rune
	name               string
	mono               bool
	colorTier          render.ColorTier
	renderer           *lipgloss.Renderer
	renderStyles       *render.Styles
	manager            *rooms.Manager
	scores             *score.Store
	subMu              sync.Mutex
	sub                rooms.Subscription
	snapshot           game.Snapshot
	lastInput          time.Time
	inputWindow        time.Time
	inputCount         int
	lastSteer          string
	lastSteerAt        time.Time
	draining           <-chan struct{}
	closedMessage      string
	respawning         bool
	reconnectMessage   string
	deathWallSkippable bool
	cursorOn           bool
}

func NewModel(manager *rooms.Manager, scores *score.Store, draining <-chan struct{}, renderer *lipgloss.Renderer) *Model {
	tier := colorTier(renderer)
	return &Model{
		width: 80, height: 24, screen: nameScreen, colorTier: tier,
		manager: manager, scores: scores, draining: draining, renderer: renderer, cursorOn: true,
		renderStyles: render.NewStyles(renderer, tier), lastInput: time.Now(),
	}
}

func colorTier(renderer *lipgloss.Renderer) render.ColorTier {
	if renderer == nil {
		return render.Mono
	}
	switch renderer.ColorProfile() {
	case termenv.TrueColor:
		return render.TrueColor
	case termenv.Ascii:
		return render.Mono
	default:
		return render.Color256
	}
}

func (m *Model) Init() tea.Cmd { return tea.Batch(tick(), waitForDrain(m.draining), titleBlink()) }

func tick() tea.Cmd {
	return tea.Tick(5*time.Second, func(t time.Time) tea.Msg { return tickMsg(t) })
}

func titleBlink() tea.Cmd {
	return tea.Tick(500*time.Millisecond, func(time.Time) tea.Msg { return titleBlinkMsg{} })
}

func (m *Model) Update(message tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := message.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
	case tea.KeyMsg:
		m.lastInput = time.Now()
		if msg.Type == tea.KeyCtrlC || (msg.String() == "q" && m.screen != nameScreen) {
			return m, tea.Quit
		}
		if !m.allowInput(m.lastInput) {
			return m, nil
		}
		if m.screen == nameScreen {
			return m.updateName(msg)
		}
		if m.screen == joinWallScreen {
			m.screen = reconnectScreen
			return m, rejoinRoom(m.manager, m.name)
		}
		if m.screen == deathWallScreen {
			if m.deathWallSkippable {
				m.screen = spectatorScreen
			}
			return m, nil
		}
		if m.screen == spectatorScreen {
			if msg.String() == "r" {
				m.sub.Send(game.Respawn)
				m.respawning = true
			}
			return m, nil
		}
		switch msg.String() {
		case "left", "a":
			for range m.steerRepeats("left", m.lastInput) {
				m.sub.Send(game.SteerLeft)
			}
		case "right", "d":
			for range m.steerRepeats("right", m.lastInput) {
				m.sub.Send(game.SteerRight)
			}
		case "up", "w":
			m.sub.Send(game.SpeedUp)
		case "down", "s":
			m.sub.Send(game.SpeedDown)
		case "m":
			m.mono = !m.mono
		}
	case snapshotMsg:
		m.snapshot = game.Snapshot(msg)
		if m.screen == spectatorScreen && m.respawning {
			for _, player := range m.snapshot.Players {
				if player.ID == m.sub.PlayerID && player.State == game.Racing {
					m.respawning = false
					m.screen = racingScreen
					break
				}
			}
		}
		if m.screen == racingScreen {
			for _, player := range m.snapshot.Players {
				if player.ID == m.sub.PlayerID && player.State == game.Spectating {
					m.screen = deathWallScreen
					m.deathWallSkippable = false
					return m, tea.Batch(waitForSnapshot(m.sub.Updates), deathWallDelay(), deathWallSkipDelay())
				}
			}
		}
		return m, waitForSnapshot(m.sub.Updates)
	case roomClosedMsg:
		m.screen = reconnectScreen
		m.reconnectMessage = "THE ROAD ITSELF HAS DIED\n\nreconnecting…"
		return m, rejoinRoom(m.manager, m.name)
	case rejoinedMsg:
		if msg.sub.PlayerID == "" {
			return m, tea.Quit
		}
		m.subMu.Lock()
		m.sub = msg.sub
		m.subMu.Unlock()
		m.screen = racingScreen
		return m, waitForSnapshot(m.sub.Updates)
	case tickMsg:
		if time.Time(msg).Sub(m.lastInput) >= 3*time.Minute {
			m.screen = closedScreen
			m.closedMessage = "the road forgets you"
			return m, tea.Tick(2*time.Second, func(time.Time) tea.Msg { return idleQuitMsg{} })
		}
		return m, tick()
	case joinReadyMsg:
		if m.screen == joinWallScreen {
			m.screen = reconnectScreen
			return m, rejoinRoom(m.manager, m.name)
		}
	case deathWallDoneMsg:
		if m.screen == deathWallScreen {
			m.screen = spectatorScreen
		}
	case deathWallSkippableMsg:
		if m.screen == deathWallScreen {
			m.deathWallSkippable = true
		}
	case idleQuitMsg:
		return m, tea.Quit
	case roadClosedMsg:
		m.screen = closedScreen
		m.closedMessage = "ROAD CLOSED FOR REPAIRS\n\nreconnect shortly"
		return m, tea.Tick(2*time.Second, func(time.Time) tea.Msg { return idleQuitMsg{} })
	case titleBlinkMsg:
		if m.screen == nameScreen {
			m.cursorOn = !m.cursorOn
			return m, titleBlink()
		}
	}
	return m, nil
}

func (m *Model) steerRepeats(direction string, now time.Time) int {
	repeats := 1
	if direction == m.lastSteer && !m.lastSteerAt.IsZero() && now.Sub(m.lastSteerAt) <= 150*time.Millisecond {
		repeats = 2
	}
	m.lastSteer = direction
	m.lastSteerAt = now
	return repeats
}

func (m *Model) updateName(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.Type {
	case tea.KeyEnter:
		name := sanitizeName(string(m.nameInput))
		if name == "" {
			name = anonymousName()
		}
		m.name = name
		m.screen = joinWallScreen
		m.reconnectMessage = "ENTERING THE ROAD…"
		return m, joinDelay()
	case tea.KeyBackspace, tea.KeyDelete:
		if len(m.nameInput) > 0 {
			m.nameInput = m.nameInput[:len(m.nameInput)-1]
		}
	case tea.KeyRunes:
		if len(m.nameInput) < 12 {
			m.nameInput = append(m.nameInput, msg.Runes...)
			if len(m.nameInput) > 12 {
				m.nameInput = m.nameInput[:12]
			}
		}
	}
	return m, nil
}

func (m *Model) View() string {
	if m.screen == nameScreen {
		return render.Title(string(m.nameInput), m.cursorOn, m.renderOptions())
	}
	if m.screen == joinWallScreen {
		return render.Wall(m.scores.Boards(), m.name, false, false, m.renderOptions())
	}
	if m.screen == deathWallScreen {
		return render.Wall(m.scores.Boards(), m.name, true, m.deathWallSkippable, m.renderOptions())
	}
	if m.screen == closedScreen {
		return render.Card(m.closedMessage, m.renderOptions())
	}
	if m.screen == reconnectScreen {
		return render.Card(m.reconnectMessage, m.renderOptions())
	}
	if m.snapshot.Tick == 0 {
		return render.Card("ENTERING THE ROAD…", m.renderOptions())
	}
	return render.Race(m.snapshot, m.sub.PlayerID, m.renderOptions())
}

func (m *Model) renderOptions() render.Options {
	return render.Options{
		Width: m.width, Height: m.height, Tier: m.colorTier, Mono: m.mono,
		Renderer: m.renderer, Styles: m.renderStyles,
	}
}

func rejoinRoom(manager *rooms.Manager, name string) tea.Cmd {
	return func() tea.Msg {
		sub, err := manager.Join(context.Background(), name)
		if err != nil {
			return rejoinedMsg{}
		}
		return rejoinedMsg{sub: sub}
	}
}

func waitForDrain(draining <-chan struct{}) tea.Cmd {
	return func() tea.Msg {
		<-draining
		return roadClosedMsg{}
	}
}

func (m *Model) allowInput(now time.Time) bool {
	if m.inputWindow.IsZero() || now.Sub(m.inputWindow) >= time.Second {
		m.inputWindow = now
		m.inputCount = 0
	}
	m.inputCount++
	return m.inputCount <= 30
}

func joinDelay() tea.Cmd {
	return tea.Tick(2*time.Second, func(time.Time) tea.Msg { return joinReadyMsg{} })
}

func deathWallDelay() tea.Cmd {
	return tea.Tick(5*time.Second, func(time.Time) tea.Msg { return deathWallDoneMsg{} })
}

func deathWallSkipDelay() tea.Cmd {
	return tea.Tick(2*time.Second, func(time.Time) tea.Msg { return deathWallSkippableMsg{} })
}

func waitForSnapshot(updates <-chan game.Snapshot) tea.Cmd {
	return func() tea.Msg {
		snapshot, ok := <-updates
		if !ok {
			return roomClosedMsg{}
		}
		return snapshotMsg(snapshot)
	}
}

func (m *Model) Close() {
	m.subMu.Lock()
	defer m.subMu.Unlock()
	if m.sub.PlayerID != "" {
		m.sub.Close()
		m.sub = rooms.Subscription{}
	}
}

func sanitizeName(value string) string {
	var out []rune
	for _, r := range strings.ToLower(value) {
		if unicode.IsLower(r) && r <= unicode.MaxASCII || unicode.IsDigit(r) || r == '_' || r == '-' {
			out = append(out, r)
		}
		if len(out) == 12 {
			break
		}
	}
	name := string(out)
	for _, word := range blockedNames {
		if strings.Contains(name, word) {
			return ""
		}
	}
	return name
}

func anonymousName() string {
	b := []byte{0, 0}
	_, _ = rand.Read(b)
	return fmt.Sprintf("anon_%02x%02x", b[0], b[1])
}
