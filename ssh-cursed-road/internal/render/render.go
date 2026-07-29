package render

import (
	"fmt"
	"strings"

	"cursedroad/internal/game"
	"cursedroad/internal/score"
	"github.com/charmbracelet/lipgloss"
)

type ColorTier int

const (
	Mono ColorTier = iota
	Color256
	TrueColor
)

type Options struct {
	Width    int
	Height   int
	Tier     ColorTier
	Mono     bool
	Renderer *lipgloss.Renderer
}

func Wall(boards score.Boards, width, height int, death bool) string {
	title := "WALL OF DEATH"
	if death {
		title = "YOU FLATLINED — WALL OF DEATH"
	}
	lines := []string{title, "THE ROAD IS NOT BUILT FOR YOU", "", "TODAY'S TOP 10", " #  NAME          DIST     SCORE  STATUS / CAUSE"}
	lines = append(lines, scoreLines(boards.Today, 10)...)
	lines = append(lines, "", "ALL-TIME TOP 50", " #  NAME          DIST     SCORE  STATUS / CAUSE")
	remaining := height - len(lines) - 3
	if remaining < 1 {
		remaining = 1
	}
	lines = append(lines, scoreLines(boards.AllTime, remaining)...)
	lines = append(lines, "", "share: asciinema + \"ssh cursed.road\"")
	if death {
		lines = append(lines, "spectating shortly…")
	} else {
		lines = append(lines, "any key skips · THE ROAD is the only curse unlocked")
	}
	for i, line := range lines {
		lines[i] = fit(line, width)
	}
	if len(lines) > height {
		lines = lines[:height]
	}
	return strings.Join(lines, "\n")
}

func scoreLines(entries []score.Entry, maximum int) []string {
	if len(entries) == 0 {
		return []string{" —  no bodies yet"}
	}
	if len(entries) > maximum {
		entries = entries[:maximum]
	}
	lines := make([]string, 0, len(entries))
	for i, entry := range entries {
		cause := fmt.Sprintf("%s · %s at %dm", entry.Status, entry.Cause, entry.Distance)
		if entry.Status == "Flatlined" {
			cause = fmt.Sprintf("%s · FLATLINED by %s at %dm", entry.Status, entry.Cause, entry.Distance)
		}
		lines = append(lines, fmt.Sprintf("%2d  %-12s %6dm  %6d  %s", i+1, entry.Name, entry.Distance, entry.Score, cause))
	}
	return lines
}

func TooSmall(width, height int) bool { return width < 60 || height < 16 }

func SmallCard(width, height int) string {
	message := "your terminal is too small — the road pities you\nminimum: 60×16"
	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, message)
}

func DamageBar(damage int) string {
	filled := damage / 10
	if filled > 10 {
		filled = 10
	}
	if filled < 0 {
		filled = 0
	}
	return strings.Repeat("█", filled) + strings.Repeat("░", 10-filled)
}

func Solo(p game.Player, distance float64, opts Options) string {
	if TooSmall(opts.Width, opts.Height) {
		return SmallCard(opts.Width, opts.Height)
	}
	height := opts.Height - 2
	roadWidth := min(opts.Width-2, 60)
	laneWidth := max(5, (roadWidth-2)/game.LaneCount)
	actualRoadWidth := laneWidth*game.LaneCount + 2
	leftPad := max(0, (opts.Width-actualRoadWidth)/2)
	carRow := height - 5 + p.RowOffset
	if carRow < 2 {
		carRow = 2
	}
	if carRow >= height {
		carRow = height - 1
	}

	header := fmt.Sprintf(" SPD %3d km/h   DIST %6.0fm   DMG %s %3d   %-20s",
		game.DisplaySpeed(distance, p.SpeedNudge, false), distance, DamageBar(p.Damage), p.Damage, game.SurvivalStatus(p.Damage))
	header = fit(header, opts.Width)

	rows := make([]string, 0, height)
	for y := 0; y < height; y++ {
		inside := make([]rune, laneWidth*game.LaneCount)
		for i := range inside {
			inside[i] = ' '
		}
		for lane := 1; lane < game.LaneCount; lane++ {
			x := lane * laneWidth
			if (y+int(distance/3))%2 == 0 && x < len(inside) {
				inside[x] = '·'
			}
		}
		if y == carRow {
			x := p.Lane*laneWidth + laneWidth/2
			put(inside, x-2, "▄██▄")
		} else if y == carRow+1 {
			x := p.Lane*laneWidth + laneWidth/2
			put(inside, x-2, "▀██▀")
		}
		// A deterministic static obstacle makes the first milestone playable.
		obstacleRow := int(12 - int(distance/6)%max(13, height+8))
		if y == obstacleRow {
			put(inside, laneWidth+laneWidth/2-1, "##")
		}
		rows = append(rows, strings.Repeat(" ", leftPad)+"║"+string(inside)+"║")
	}

	flash := p.Flash
	if flash == "" {
		flash = "THE ROAD IS NOT BUILT FOR YOU"
	}
	footer := fit(fmt.Sprintf(" %-36s [a/d] steer  [w/s] speed  [q] quit", flash), opts.Width)
	return header + "\n" + strings.Join(rows, "\n") + "\n" + footer
}

func Race(snapshot game.Snapshot, selfID string, opts Options) string {
	if TooSmall(opts.Width, opts.Height) {
		return SmallCard(opts.Width, opts.Height)
	}
	var self game.PlayerView
	for _, player := range snapshot.Players {
		if player.ID == selfID {
			self = player
			break
		}
	}
	height := opts.Height - 2
	roadWidth := min(opts.Width-2, 60)
	laneWidth := max(5, (roadWidth-2)/game.LaneCount)
	insideWidth := laneWidth * game.LaneCount
	leftPad := max(0, (opts.Width-insideWidth-2)/2)
	carBaseRow := height - 5

	displaySpeed := game.DisplaySpeed(snapshot.Distance, self.SpeedNudge, snapshot.Shock)
	if self.Slipstream {
		displaySpeed = displaySpeed * 3 / 2
	}
	header := fit(fmt.Sprintf(" SPD %3d km/h   DIST %6.0fm   DMG %s %3d   %-19s %2d racing",
		displaySpeed, self.Distance,
		DamageBar(self.Damage), self.Damage, game.SurvivalStatus(self.Damage), len(snapshot.Players)), opts.Width)

	canvas := make([][]rune, height)
	for y := range canvas {
		canvas[y] = make([]rune, insideWidth)
		for x := range canvas[y] {
			canvas[y][x] = ' '
		}
		for lane := 1; lane < game.LaneCount; lane++ {
			x := lane * laneWidth
			if (y+int(snapshot.Distance/3))%2 == 0 && x < insideWidth {
				canvas[y][x] = '·'
			}
		}
	}

	fogRows := make(map[int]bool)
	for _, hazard := range snapshot.Hazards {
		row := carBaseRow - int((hazard.Distance-snapshot.Distance)/4)
		lengthRows := max(1, int(hazard.Length/4))
		if hazard.Kind == "fog" {
			for y := row - lengthRows; y <= row; y++ {
				if y >= 0 && y < height {
					fogRows[y] = true
				}
			}
		}
	}
	for _, hazard := range snapshot.Hazards {
		if (hazard.Consumed && hazard.Kind == "repair") || hazard.Kind == "fog" {
			continue
		}
		row := carBaseRow - int((hazard.Distance-snapshot.Distance)/4)
		lengthRows := max(1, int(hazard.Length/4))
		if row < 0 || row >= height {
			continue
		}
		if fogRows[row] && row < carBaseRow-3 {
			continue
		}
		x := hazard.Lane*laneWidth + laneWidth/2
		glyph := hazardGlyph(hazard.Kind, hazard.Warning)
		put(canvas[row], x-len([]rune(glyph))/2, glyph)
		if hazard.Kind == "traffic" && hazard.Warning {
			for y := row + 1; y <= min(height-1, row+2); y++ {
				put(canvas[y], x-1, "!!!")
			}
		}
		if hazard.Kind == "slipstream" || hazard.Kind == "oil" {
			for y := max(0, row-lengthRows); y < row; y++ {
				put(canvas[y], x-1, glyph)
			}
		}
		if hazard.Kind == "gap" {
			for y := max(0, row-lengthRows); y <= row; y++ {
				for laneX := hazard.Lane * laneWidth; laneX < (hazard.Lane+1)*laneWidth && laneX < len(canvas[y]); laneX++ {
					canvas[y][laneX] = ' '
				}
			}
		}
	}
	for y := range fogRows {
		for x := range canvas[y] {
			if canvas[y][x] == ' ' || canvas[y][x] == '·' {
				canvas[y][x] = []rune("░▒▓")[(x+y)%3]
			}
		}
	}

	type position struct{ lane, row int }
	groups := make(map[position][]game.PlayerView)
	for _, player := range snapshot.Players {
		if player.State == game.Spectating {
			continue
		}
		pos := position{lane: player.Lane, row: carBaseRow + player.RowOffset}
		groups[pos] = append(groups[pos], player)
	}
	for pos, players := range groups {
		if pos.row < 0 || pos.row >= height {
			continue
		}
		x := pos.lane*laneWidth + laneWidth/2
		hasSelf := false
		for _, player := range players {
			if player.ID == selfID {
				hasSelf = true
			}
			if player.State == game.Exploding {
				put(canvas[pos.row], x-3, "*BOOM*")
			}
		}
		if len(players) > 1 {
			badgeX := x - 1
			if hasSelf {
				badgeX = x + 3
			}
			put(canvas[pos.row], badgeX, fmt.Sprintf("[%d]", len(players)))
		}
		for _, player := range players {
			if player.ID == selfID {
				if player.State == game.Exploding {
					break
				}
				put(canvas[pos.row], x-2, "▄██▄")
				if pos.row+1 < height {
					put(canvas[pos.row+1], x-2, "▀██▀")
				}
				break
			}
		}
		if len(players) == 1 && players[0].ID != selfID && players[0].State != game.Exploding {
			put(canvas[pos.row], x-1, "◇")
			put(canvas[pos.row], x+1, " "+players[0].Name)
		}
	}

	if snapshot.Shock && snapshot.Tick%2 == 0 {
		leftPad++
	}
	rows := make([]string, 0, height)
	for _, row := range canvas {
		rows = append(rows, strings.Repeat(" ", leftPad)+"║"+string(row)+"║")
	}
	flash := self.Flash
	if snapshot.ShockWarning {
		flash = "!! SHOCK INCOMING !!"
	} else if snapshot.Shock {
		flash = "!! SHOCK !!"
	} else if flash == "" {
		flash = "THE ROAD IS NOT BUILT FOR YOU"
	}
	footer := fit(fmt.Sprintf(" %-36s [a/d] steer  [w/s] speed  [q] quit", flash), opts.Width)
	if self.State == game.Spectating {
		footer = fit(" SPECTATING — [r] to respawn, [q] to quit", opts.Width)
	}
	if !opts.Mono && opts.Tier != Mono {
		shockFlash := snapshot.Shock && snapshot.Tick%10 == 0
		header = newStyle(opts).Bold(true).Reverse(shockFlash).Foreground(tierColor(opts.Tier, "252", "#e8e8e8")).Render(header)
		footer = newStyle(opts).Bold(snapshot.Shock || snapshot.ShockWarning).Reverse(shockFlash).Foreground(tierColor(opts.Tier, "203", "#ff5f5f")).Render(footer)
		for i, row := range rows {
			rows[i] = colorizeRoad(row, opts, self.Damage)
		}
	}
	return header + "\n" + strings.Join(rows, "\n") + "\n" + footer
}

func tierColor(tier ColorTier, ansi256, truecolor string) lipgloss.Color {
	if tier == TrueColor {
		return lipgloss.Color(truecolor)
	}
	return lipgloss.Color(ansi256)
}

func newStyle(opts Options) lipgloss.Style {
	if opts.Renderer != nil {
		return opts.Renderer.NewStyle()
	}
	return lipgloss.NewStyle()
}

func colorizeRoad(row string, opts Options, damage int) string {
	tier := opts.Tier
	row = newStyle(opts).Foreground(tierColor(tier, "240", "#585858")).Render(row)
	hazards := map[string]lipgloss.Color{
		"!!!": tierColor(tier, "196", "#ff3030"),
		"≈≈≈": tierColor(tier, "214", "#ffaf00"),
		"[+]": tierColor(tier, "48", "#00ff87"),
		"^^^": tierColor(tier, "48", "#00ff87"),
		"▼▼":  tierColor(tier, "196", "#ff3030"),
	}
	for glyph, color := range hazards {
		row = strings.ReplaceAll(row, glyph, newStyle(opts).Bold(true).Foreground(color).Render(glyph))
	}
	row = strings.ReplaceAll(row, "◇", newStyle(opts).Faint(true).Foreground(tierColor(tier, "44", "#00d7d7")).Render("◇"))
	carColor := tierColor(tier, "255", "#ffffff")
	if damage >= 75 {
		carColor = tierColor(tier, "88", "#870000")
	} else if damage >= 50 {
		carColor = tierColor(tier, "196", "#ff0000")
	} else if damage >= 25 {
		carColor = tierColor(tier, "226", "#ffff00")
	}
	for _, glyph := range []string{"▄██▄", "▀██▀"} {
		row = strings.ReplaceAll(row, glyph, newStyle(opts).Bold(true).Foreground(carColor).Render(glyph))
	}
	return row
}

func hazardGlyph(kind string, warning bool) string {
	if warning && kind == "traffic" {
		return "!!!"
	}
	switch kind {
	case "oil":
		return "≈≈≈"
	case "traffic":
		return "▼▼"
	case "slipstream":
		return "^^^"
	case "repair":
		return "[+]"
	case "gap":
		return "     "
	case "shock":
		return "!!!"
	default:
		return "?"
	}
}

func fit(s string, width int) string {
	r := []rune(s)
	if len(r) > width {
		return string(r[:width])
	}
	return s + strings.Repeat(" ", width-len(r))
}

func put(row []rune, start int, text string) {
	for i, r := range []rune(text) {
		if start+i >= 0 && start+i < len(row) {
			row[start+i] = r
		}
	}
}
