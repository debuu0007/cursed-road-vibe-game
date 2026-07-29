package render

import (
	"io"
	"strings"
	"testing"

	"cursedroad/internal/game"
	"github.com/charmbracelet/lipgloss"
	"github.com/muesli/termenv"
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

func TestHazardsRenderAgainstLocalPersonalDistance(t *testing.T) {
	snapshot := game.Snapshot{
		Distance: 0,
		Players:  []game.PlayerView{{ID: "self", Name: "alice", Lane: 2, State: game.Racing, Distance: 100}},
		Hazards:  []game.HazardView{{ID: 1, Kind: "oil", Distance: 140, Lane: 2, Length: 14}},
	}
	view := Race(snapshot, "self", Options{Width: 80, Height: 24, Tier: Mono, Mono: true})
	if !strings.Contains(view, "≈≈≈") {
		t.Fatalf("personal-distance hazard was not visible:\n%s", view)
	}
}

func BenchmarkLegacyColorizeRoad(b *testing.B) {
	renderer := trueColorRenderer()
	opts := Options{Width: 80, Height: 24, Tier: TrueColor, Renderer: renderer}
	row := "    ║ · · · │ ≈≈≈ │ [+] │ !!! │ ▄██▄ ◇ bob ║"
	b.ReportAllocs()
	for b.Loop() {
		_ = legacyColorizeRoad(row, opts, 58)
	}
}

func BenchmarkSpanColorizeRoad(b *testing.B) {
	styles := NewStyles(trueColorRenderer(), TrueColor)
	row := make([]styledCell, 52)
	for i := range row {
		row[i] = styledCell{rune: ' ', style: styleRoad}
	}
	putStyled(row, 4, "· · · │ ", styleRoad)
	putStyled(row, 12, "≈≈≈", styleOil)
	putStyled(row, 20, "[+]", styleBenefit)
	putStyled(row, 28, "!!!", styleHazardRed)
	putStyled(row, 36, "▄██▄", styleCarRed)
	putStyled(row, 42, "◇ bob", styleOtherPlayer)
	b.ReportAllocs()
	for b.Loop() {
		_ = renderStyledRow(row, styles)
	}
}

func TestStyledRowReopensRoadGrayAfterHazard(t *testing.T) {
	styles := NewStyles(trueColorRenderer(), TrueColor)
	row := []styledCell{
		{rune: 'a', style: styleRoad},
		{rune: '!', style: styleHazardRed},
		{rune: 'b', style: styleRoad},
	}
	got := renderStyledRow(row, styles)
	gray := styles.spans[styleRoad].Render("b")
	if !strings.HasSuffix(got, gray) {
		t.Fatalf("road-gray style was not reopened after hazard:\n%q\nwant suffix %q", got, gray)
	}
}

func trueColorRenderer() *lipgloss.Renderer {
	renderer := lipgloss.NewRenderer(io.Discard)
	renderer.SetColorProfile(termenv.TrueColor)
	return renderer
}

func legacyColorizeRoad(row string, opts Options, damage int) string {
	style := func() lipgloss.Style { return opts.Renderer.NewStyle() }
	tier := opts.Tier
	row = style().Foreground(tierColor(tier, "240", "#585858")).Render(row)
	hazards := map[string]lipgloss.Color{
		"!!!": tierColor(tier, "196", "#ff3030"),
		"≈≈≈": tierColor(tier, "214", "#ffaf00"),
		"[+]": tierColor(tier, "48", "#00ff87"),
		"^^^": tierColor(tier, "48", "#00ff87"),
		"▼▼":  tierColor(tier, "196", "#ff3030"),
	}
	for glyph, color := range hazards {
		row = strings.ReplaceAll(row, glyph, style().Bold(true).Foreground(color).Render(glyph))
	}
	row = strings.ReplaceAll(row, "◇", style().Faint(true).Foreground(tierColor(tier, "44", "#00d7d7")).Render("◇"))
	carColor := tierColor(tier, "255", "#ffffff")
	if damage >= 75 {
		carColor = tierColor(tier, "88", "#870000")
	} else if damage >= 50 {
		carColor = tierColor(tier, "196", "#ff0000")
	} else if damage >= 25 {
		carColor = tierColor(tier, "226", "#ffff00")
	}
	for _, glyph := range []string{"▄██▄", "▀██▀"} {
		row = strings.ReplaceAll(row, glyph, style().Bold(true).Foreground(carColor).Render(glyph))
	}
	return row
}
