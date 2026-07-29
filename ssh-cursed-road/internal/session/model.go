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
type idleQuitMsg struct{}
type roadClosedMsg struct{}
type rejoinedMsg struct{ sub rooms.Subscription }

type Model struct {
	width            int
	height           int
	screen           screen
	nameInput        []rune
	name             string
	mono             bool
	colorTier        render.ColorTier
	renderer         *lipgloss.Renderer
	renderStyles     *render.Styles
	manager          *rooms.Manager
	scores           *score.Store
	subMu            sync.Mutex
	sub              rooms.Subscription
	snapshot         game.Snapshot
	lastInput        time.Time
	inputWindow      time.Time
	inputCount       int
	draining         <-chan struct{}
	closedMessage    string
	respawning       bool
	reconnectMessage string
}

func NewModel(manager *rooms.Manager, scores *score.Store, draining <-chan struct{}, renderer *lipgloss.Renderer, term string, trueColor bool) *Model {
	termLower := strings.ToLower(term)
	tier := render.Mono
	if strings.Contains(termLower, "256color") {
		tier = render.Color256
	}
	if trueColor || strings.Contains(termLower, "direct") || strings.Contains(termLower, "truecolor") || strings.Contains(termLower, "kitty") {
		tier = render.TrueColor
	}
	if term == "" || strings.EqualFold(term, "dumb") {
		tier = render.Mono
	}
	return &Model{
		width: 80, height: 24, screen: nameScreen, colorTier: tier,
		manager: manager, scores: scores, draining: draining, renderer: renderer,
		renderStyles: render.NewStyles(renderer, tier), lastInput: time.Now(),
	}
}

func (m *Model) Init() tea.Cmd { return tea.Batch(tick(), waitForDrain(m.draining)) }

func tick() tea.Cmd {
	return tea.Tick(50*time.Millisecond, func(t time.Time) tea.Msg { return tickMsg(t) })
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
			m.sub.Send(game.SteerLeft)
		case "right", "d":
			m.sub.Send(game.SteerRight)
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
					return m, tea.Batch(waitForSnapshot(m.sub.Updates), deathWallDelay())
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
	case idleQuitMsg:
		return m, tea.Quit
	case roadClosedMsg:
		m.screen = closedScreen
		m.closedMessage = "ROAD CLOSED FOR REPAIRS\n\nreconnect shortly"
		return m, tea.Tick(2*time.Second, func(time.Time) tea.Msg { return idleQuitMsg{} })
	}
	return m, nil
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
		card := "ssh cursed.road\n\nPICK A CURSE\n\n> THE ROAD\n  POTHOLE GAUNTLET — LOCKED · soon\n  SPEED SHOCK — LOCKED · soon\n\nThe road is not built for you.\n\nwho dies today? " + string(m.nameInput) + "█\n\nenter to race · ctrl+c to flee"
		return center(m.width, m.height, card)
	}
	if m.screen == joinWallScreen {
		return render.Wall(m.scores.Boards(), m.width, m.height, false)
	}
	if m.screen == deathWallScreen {
		return render.Wall(m.scores.Boards(), m.width, m.height, true)
	}
	if m.screen == closedScreen {
		return center(m.width, m.height, m.closedMessage)
	}
	if m.screen == reconnectScreen {
		return center(m.width, m.height, m.reconnectMessage)
	}
	return render.Race(m.snapshot, m.sub.PlayerID, render.Options{
		Width: m.width, Height: m.height, Tier: m.colorTier, Mono: m.mono,
		Renderer: m.renderer, Styles: m.renderStyles,
	})
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
	blocked := []string{"fuck", "shit", "cunt", "nigger", "nazi"}
	for _, word := range blocked {
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

func center(width, height int, content string) string {
	lines := strings.Split(content, "\n")
	padTop := max(0, (height-len(lines))/2)
	var result []string
	for range padTop {
		result = append(result, "")
	}
	for _, line := range lines {
		padding := max(0, (width-len([]rune(line)))/2)
		result = append(result, strings.Repeat(" ", padding)+line)
	}
	return strings.Join(result, "\n")
}
