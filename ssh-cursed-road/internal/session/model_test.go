package session

import (
	"io"
	"strings"
	"testing"
	"time"

	"cursedroad/internal/render"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/muesli/termenv"
)

func TestSanitizeName(t *testing.T) {
	tests := map[string]string{
		"Road_King-7":      "road_king-7",
		"two words!":       "twowords",
		"abcdefghijklmnop": "abcdefghijkl",
		"shitty":           "",
	}
	for input, want := range tests {
		if got := sanitizeName(input); got != want {
			t.Errorf("sanitizeName(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestRendererColorProfileDeterminesTier(t *testing.T) {
	renderer := lipgloss.NewRenderer(io.Discard)
	renderer.SetColorProfile(termenv.TrueColor)
	if got := colorTier(renderer); got != render.TrueColor {
		t.Fatalf("truecolor profile mapped to tier %v", got)
	}
	renderer.SetColorProfile(termenv.ANSI256)
	if got := colorTier(renderer); got != render.Color256 {
		t.Fatalf("ANSI256 profile mapped to tier %v", got)
	}
	renderer.SetColorProfile(termenv.Ascii)
	if got := colorTier(renderer); got != render.Mono {
		t.Fatalf("ASCII profile mapped to tier %v", got)
	}
}

func TestTapTapSteeringDashes(t *testing.T) {
	m := &Model{}
	now := time.Date(2026, 7, 29, 0, 0, 0, 0, time.UTC)
	if got := m.steerRepeats("left", now); got != 1 {
		t.Fatalf("first tap repeats = %d", got)
	}
	if got := m.steerRepeats("left", now.Add(100*time.Millisecond)); got != 2 {
		t.Fatalf("quick same-direction tap repeats = %d", got)
	}
	if got := m.steerRepeats("right", now.Add(120*time.Millisecond)); got != 1 {
		t.Fatalf("direction change repeats = %d", got)
	}
	if got := m.steerRepeats("right", now.Add(400*time.Millisecond)); got != 1 {
		t.Fatalf("slow repeated tap repeats = %d", got)
	}
}

func TestDeathWallBecomesSkippableAfterTwoSeconds(t *testing.T) {
	m := &Model{screen: deathWallScreen}
	_, _ = m.Update(deathWallSkippableMsg{})
	if !m.deathWallSkippable {
		t.Fatal("death wall did not become skippable")
	}
	_, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'x'}})
	if m.screen != spectatorScreen {
		t.Fatalf("screen = %v, want spectator", m.screen)
	}
}

func TestTitleCursorBlinksOnlyOnNameScreen(t *testing.T) {
	m := &Model{screen: nameScreen, cursorOn: true}
	_, cmd := m.Update(titleBlinkMsg{})
	if m.cursorOn || cmd == nil {
		t.Fatal("name-screen cursor did not toggle and rearm")
	}
	m.screen = racingScreen
	_, cmd = m.Update(titleBlinkMsg{})
	if cmd != nil {
		t.Fatal("title blink rearmed outside the name screen")
	}
}

func TestFirstRaceFrameKeepsEnteringCard(t *testing.T) {
	m := &Model{width: 80, height: 24, screen: racingScreen, colorTier: render.Mono, mono: true}
	view := m.View()
	if !strings.Contains(view, "ENTERING THE ROAD") || strings.Contains(view, "SPD") {
		t.Fatalf("zero-snapshot race view was not held on entering card:\n%s", view)
	}
}

func TestInputCap(t *testing.T) {
	m := &Model{}
	now := time.Date(2026, 7, 29, 0, 0, 0, 0, time.UTC)
	for i := 0; i < 30; i++ {
		if !m.allowInput(now) {
			t.Fatalf("input %d was rejected", i+1)
		}
	}
	if m.allowInput(now) {
		t.Fatal("31st input in a second was accepted")
	}
	if !m.allowInput(now.Add(time.Second)) {
		t.Fatal("input window did not reset")
	}
}
