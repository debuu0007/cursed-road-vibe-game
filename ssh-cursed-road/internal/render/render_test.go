package render

import (
	"strings"
	"testing"

	"cursedroad/internal/game"
)

func TestRaceFitsClassicTerminalAndShowsOverlap(t *testing.T) {
	snapshot := game.Snapshot{
		Distance: 100,
		Players: []game.PlayerView{
			{ID: "self", Name: "alice", Lane: 2, State: game.Racing},
			{ID: "other", Name: "bob", Lane: 2, State: game.Racing},
		},
	}
	view := Race(snapshot, "self", Options{Width: 80, Height: 24, Tier: Mono, Mono: true})
	if lines := strings.Count(view, "\n") + 1; lines != 24 {
		t.Fatalf("line count = %d, want 24", lines)
	}
	if !strings.Contains(view, "▄██▄") || !strings.Contains(view, "[2]") {
		t.Fatalf("overlap did not preserve local car and badge:\n%s", view)
	}
	if strings.Contains(view, "\x1b[") {
		t.Fatal("mono render contains ANSI color sequences")
	}
}

func TestSmallTerminalCard(t *testing.T) {
	view := Race(game.Snapshot{}, "", Options{Width: 59, Height: 15, Mono: true})
	if !strings.Contains(view, "terminal is too small") {
		t.Fatalf("missing small terminal card: %q", view)
	}
}
