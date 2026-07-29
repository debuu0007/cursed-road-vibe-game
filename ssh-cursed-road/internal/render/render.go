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
	Styles   *Styles
}

type styleClass uint8

const (
	styleRoad styleClass = iota
	styleHUD
	styleHazardRed
	styleOil
	styleBenefit
	styleShockStreak
	styleOtherPlayer
	styleCarWhite
	styleCarYellow
	styleCarRed
	styleCarDarkRed
	styleCarHit
	styleExplosion
	styleClassCount
)

// Styles contains the complete per-color-tier palette. A session constructs it
// once and passes it through Options; rendering only applies cached styles to
// contiguous spans and never builds styles or searches strings per frame.
type Styles struct {
	spans       [styleClassCount]lipgloss.Style
	spanPrefix  [styleClassCount]string
	spanSuffix  [styleClassCount]string
	header      lipgloss.Style
	headerShock lipgloss.Style
	footer      lipgloss.Style
	footerShock lipgloss.Style
	border      lipgloss.Style
	borderShock lipgloss.Style
	title       lipgloss.Style
	selected    lipgloss.Style
	locked      lipgloss.Style
	faint       lipgloss.Style
	card        lipgloss.Style
	ranks       [3]lipgloss.Style
	current     lipgloss.Style
}

func NewStyles(renderer *lipgloss.Renderer, tier ColorTier) *Styles {
	style := func() lipgloss.Style {
		if renderer != nil {
			return renderer.NewStyle()
		}
		return lipgloss.NewStyle()
	}
	styles := &Styles{}
	styles.spans[styleRoad] = style().Foreground(tierColor(tier, "240", "#585858"))
	styles.spans[styleHUD] = style().Bold(true).Foreground(tierColor(tier, "252", "#e8e8e8"))
	styles.spans[styleHazardRed] = style().Bold(true).Foreground(tierColor(tier, "196", "#ff3030"))
	styles.spans[styleOil] = style().Bold(true).Foreground(tierColor(tier, "214", "#ffaf00"))
	styles.spans[styleBenefit] = style().Bold(true).Foreground(tierColor(tier, "48", "#00ff87"))
	styles.spans[styleShockStreak] = style().Bold(true).Foreground(tierColor(tier, "203", "#ff5f5f"))
	styles.spans[styleOtherPlayer] = style().Faint(true).Foreground(tierColor(tier, "44", "#00d7d7"))
	styles.spans[styleCarWhite] = style().Bold(true).Foreground(tierColor(tier, "255", "#ffffff"))
	styles.spans[styleCarYellow] = style().Bold(true).Foreground(tierColor(tier, "226", "#ffff00"))
	styles.spans[styleCarRed] = style().Bold(true).Foreground(tierColor(tier, "196", "#ff0000"))
	styles.spans[styleCarDarkRed] = style().Bold(true).Foreground(tierColor(tier, "88", "#870000"))
	styles.spans[styleCarHit] = style().Bold(true).Reverse(true).Foreground(tierColor(tier, "196", "#ff0000"))
	styles.spans[styleExplosion] = styles.spans[styleHazardRed]
	styles.header = style().Bold(true).Foreground(tierColor(tier, "252", "#e8e8e8"))
	styles.headerShock = style().Bold(true).Reverse(true).Foreground(tierColor(tier, "252", "#e8e8e8"))
	styles.footer = style().Foreground(tierColor(tier, "203", "#ff5f5f"))
	styles.footerShock = style().Bold(true).Reverse(true).Foreground(tierColor(tier, "203", "#ff5f5f"))
	styles.border = style().Faint(true).Foreground(tierColor(tier, "220", "#ffd700"))
	styles.borderShock = style().Bold(true).Foreground(tierColor(tier, "196", "#ff3030"))
	styles.title = style().Bold(true).Foreground(tierColor(tier, "203", "#ff5f5f"))
	styles.selected = style().Bold(true).Foreground(tierColor(tier, "196", "#ff3030"))
	styles.locked = style().Faint(true).Foreground(tierColor(tier, "244", "#808080"))
	styles.faint = style().Faint(true).Foreground(tierColor(tier, "244", "#808080"))
	styles.card = style().Faint(true).Foreground(tierColor(tier, "252", "#e8e8e8"))
	styles.ranks[0] = style().Bold(true).Foreground(tierColor(tier, "220", "#ffd700"))
	styles.ranks[1] = style().Bold(true).Foreground(tierColor(tier, "250", "#bcbcbc"))
	styles.ranks[2] = style().Bold(true).Foreground(tierColor(tier, "208", "#ff8700"))
	styles.current = style().Bold(true).Reverse(true).Foreground(tierColor(tier, "203", "#ff5f5f"))
	for class := styleRoad; class < styleClassCount; class++ {
		styles.spanPrefix[class], styles.spanSuffix[class] = compiledStyle(styles.spans[class])
	}
	return styles
}

func compiledStyle(style lipgloss.Style) (string, string) {
	const marker = "§"
	rendered := style.Render(marker)
	index := strings.Index(rendered, marker)
	if index < 0 {
		return "", ""
	}
	return rendered[:index], rendered[index+len(marker):]
}

type styledCell struct {
	rune  rune
	style styleClass
}

func Title(name string, cursor bool, opts Options) string {
	styles := opts.Styles
	if styles == nil {
		styles = NewStyles(opts.Renderer, opts.Tier)
	}
	cursorGlyph := " "
	if cursor {
		cursorGlyph = "█"
	}
	logo := "▄██▄\n▀██▀\nCURSED ROAD"
	selected := "> THE ROAD"
	locked := "POTHOLE GAUNTLET — LOCKED · soon\nSPEED SHOCK — LOCKED · soon"
	prompt := "The road is not built for you.\n\nwho dies today? " + name + cursorGlyph + "\n\nenter to race · ctrl+c to flee"
	if !opts.Mono && opts.Tier != Mono {
		logo = styles.title.Render(logo)
		selected = styles.selected.Render(selected)
		locked = styles.locked.Render(locked)
		prompt = styles.faint.Render(prompt)
	}
	content := logo + "\n\nPICK A CURSE\n\n" + selected + "\n" + locked + "\n\n" + prompt
	return lipgloss.Place(opts.Width, opts.Height, lipgloss.Center, lipgloss.Center, content)
}

func Card(content string, opts Options) string {
	styles := opts.Styles
	if styles == nil {
		styles = NewStyles(opts.Renderer, opts.Tier)
	}
	lines := strings.Split(content, "\n")
	innerWidth := 0
	for _, line := range lines {
		innerWidth = max(innerWidth, len([]rune(line)))
	}
	innerWidth = min(max(innerWidth+4, 28), max(1, opts.Width-4))
	card := []string{"╭" + strings.Repeat("─", innerWidth) + "╮"}
	for _, line := range lines {
		line = fit(line, innerWidth-2)
		card = append(card, "│ "+line+strings.Repeat(" ", max(0, innerWidth-2-len([]rune(line))))+" │")
	}
	card = append(card, "╰"+strings.Repeat("─", innerWidth)+"╯")
	result := strings.Join(card, "\n")
	if !opts.Mono && opts.Tier != Mono {
		result = styles.card.Render(result)
	}
	return lipgloss.Place(opts.Width, opts.Height, lipgloss.Center, lipgloss.Center, result)
}

type wallLine struct {
	text    string
	rank    int
	current bool
	kind    string
}

func Wall(boards score.Boards, currentName string, death, skippable bool, opts Options) string {
	width, height := opts.Width, opts.Height
	if width < 4 || height < 4 {
		return fit("WALL OF DEATH", width)
	}
	styles := opts.Styles
	if styles == nil {
		styles = NewStyles(opts.Renderer, opts.Tier)
	}
	title := "WALL OF DEATH"
	if death {
		title = "YOU FLATLINED — WALL OF DEATH"
	}
	innerHeight := height - 2
	footer := []wallLine{{text: "share: asciinema + \"ssh cursed.road\"", kind: "faint"}}
	if death {
		if skippable {
			footer = append(footer, wallLine{text: "any key: spectate now", kind: "faint"})
		} else {
			footer = append(footer, wallLine{text: "spectating shortly…", kind: "faint"})
		}
	} else {
		footer = append(footer, wallLine{text: "any key skips · THE ROAD is the only curse unlocked", kind: "faint"})
	}
	// Always reserve the frame, both section headings, one all-time row, and
	// both footer lines. Today's board receives the remaining space first.
	availableToday := max(1, innerHeight-11)
	today := scoreWallLines(boards.Today, min(10, availableToday), currentName)
	lines := []wallLine{
		{text: title, kind: "title"}, {text: "THE ROAD IS NOT BUILT FOR YOU", kind: "faint"}, {},
		{text: "TODAY'S TOP 10", kind: "heading"}, {text: " #  NAME          DIST     SCORE  STATUS / CAUSE", kind: "faint"},
	}
	lines = append(lines, today...)
	lines = append(lines, wallLine{}, wallLine{text: "ALL-TIME TOP 50", kind: "heading"}, wallLine{text: " #  NAME          DIST     SCORE  STATUS / CAUSE", kind: "faint"})
	availableAll := max(1, innerHeight-len(lines)-len(footer))
	lines = append(lines, scoreWallLines(boards.AllTime, availableAll, currentName)...)
	if len(lines)+len(footer) > innerHeight {
		lines = lines[:max(0, innerHeight-len(footer))]
	}
	for len(lines)+len(footer) < innerHeight {
		lines = append(lines, wallLine{})
	}
	lines = append(lines, footer...)

	innerWidth := width - 2
	borderStyle := styles.border
	top := "┌" + strings.Repeat("─", innerWidth) + "┐"
	bottom := "└" + strings.Repeat("─", innerWidth) + "┘"
	if !opts.Mono && opts.Tier != Mono {
		top, bottom = borderStyle.Render(top), borderStyle.Render(bottom)
	}
	result := make([]string, 0, height)
	result = append(result, top)
	for _, line := range lines {
		text := fit(line.text, innerWidth)
		text += strings.Repeat(" ", max(0, innerWidth-len([]rune(text))))
		if !opts.Mono && opts.Tier != Mono {
			text = styleWallText(text, line, styles)
			result = append(result, borderStyle.Render("│")+text+borderStyle.Render("│"))
		} else {
			result = append(result, "│"+text+"│")
		}
	}
	result = append(result, bottom)
	return strings.Join(result, "\n")
}

func scoreWallLines(entries []score.Entry, maximum int, currentName string) []wallLine {
	if len(entries) == 0 {
		return []wallLine{{text: " —  no bodies yet", kind: "faint"}}
	}
	if len(entries) > maximum {
		entries = entries[:maximum]
	}
	lines := make([]wallLine, 0, len(entries))
	for i, entry := range entries {
		cause := fmt.Sprintf("%s · %s at %dm", entry.Status, entry.Cause, entry.Distance)
		if entry.Status == "Flatlined" {
			cause = fmt.Sprintf("%s · FLATLINED by %s at %dm", entry.Status, entry.Cause, entry.Distance)
		}
		lines = append(lines, wallLine{
			text: fmt.Sprintf("%2d  %-12s %6dm  %6d  %s", i+1, entry.Name, entry.Distance, entry.Score, cause),
			rank: i + 1, current: entry.Name == currentName,
		})
	}
	return lines
}

func styleWallText(text string, line wallLine, styles *Styles) string {
	switch {
	case line.current:
		return styles.current.Render(text)
	case line.rank >= 1 && line.rank <= 3:
		return styles.ranks[line.rank-1].Render(text)
	case line.kind == "title":
		return styles.title.Render(text)
	case line.kind == "heading":
		return styles.selected.Render(text)
	case line.kind == "faint":
		return styles.faint.Render(text)
	default:
		return styles.card.Render(text)
	}
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
	header = pad(header, opts.Width)

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
	styles := opts.Styles
	if styles == nil {
		styles = NewStyles(opts.Renderer, opts.Tier)
	}
	var self game.PlayerView
	racingCount, ghostCount := 0, 0
	for _, player := range snapshot.Players {
		if player.ID == selfID {
			self = player
		}
		if player.State == game.Racing {
			racingCount++
		} else {
			ghostCount++
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
	displaySpeed += (int(snapshot.Tick%3) - 1) * 2
	headerBefore := fmt.Sprintf(" SPD %3d  DIST %5.0fm  DMG ", displaySpeed, self.Distance)
	headerBar := DamageBar(self.Damage)
	headerAfter := fmt.Sprintf(" %3d  %-16s %2d racing · %d ghosts", self.Damage, game.SurvivalStatus(self.Damage), racingCount, ghostCount)
	header := pad(headerBefore+headerBar+headerAfter, opts.Width)

	canvas := make([][]styledCell, height)
	for y := range canvas {
		canvas[y] = make([]styledCell, insideWidth)
		for x := range canvas[y] {
			canvas[y][x] = styledCell{rune: ' ', style: styleRoad}
		}
		for lane := 1; lane < game.LaneCount; lane++ {
			x := lane * laneWidth
			if (y+dashPhase(self.Distance, displaySpeed))%2 == 0 && x < insideWidth {
				canvas[y][x].rune = '·'
			}
		}
		if snapshot.Shock || self.Slipstream {
			for _, x := range []int{1, insideWidth - 2} {
				if (x*7+y*13+int(snapshot.Tick))%4 == 0 && canvas[y][x].rune == ' ' {
					class := styleBenefit
					if snapshot.Shock {
						class = styleShockStreak
					}
					canvas[y][x] = styledCell{rune: '¦', style: class}
				}
			}
		}
	}

	fogRows := make(map[int]bool)
	for _, hazard := range snapshot.Hazards {
		row := carBaseRow - int((hazard.Distance-self.Distance)/4)
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
		if hazard.Kind == "fog" {
			continue
		}
		row := carBaseRow - int((hazard.Distance-self.Distance)/4)
		lengthRows := max(1, int(hazard.Length/4))
		if row < 0 || row >= height {
			continue
		}
		if fogRows[row] && row < carBaseRow-3 {
			continue
		}
		x := hazard.Lane*laneWidth + laneWidth/2
		glyph := hazardGlyph(hazard.Kind, hazard.Warning)
		hazardStyle := styleForHazard(hazard.Kind, hazard.Warning)
		if hazard.Kind == "repair" && hazard.Consumed {
			glyph = "[ ]"
			hazardStyle = styleOtherPlayer
		}
		putStyled(canvas[row], x-len([]rune(glyph))/2, glyph, hazardStyle)
		if hazard.Kind == "traffic" && hazard.Warning {
			for y := row + 1; y <= min(height-1, row+2); y++ {
				putStyled(canvas[y], x-1, "!!!", styleHazardRed)
			}
		}
		if hazard.Kind == "slipstream" || hazard.Kind == "oil" {
			for y := max(0, row-lengthRows); y < row; y++ {
				putStyled(canvas[y], x-1, glyph, hazardStyle)
			}
		}
		if hazard.Kind == "gap" {
			top := max(0, row-lengthRows)
			for y := top; y <= row; y++ {
				for laneX := hazard.Lane * laneWidth; laneX < (hazard.Lane+1)*laneWidth && laneX < len(canvas[y]); laneX++ {
					if y == top || y == row {
						canvas[y][laneX] = styledCell{rune: []rune("▚▞")[(laneX+y)%2], style: styleHazardRed}
					} else {
						canvas[y][laneX] = styledCell{rune: ' ', style: styleRoad}
					}
				}
			}
		}
	}
	for y := range fogRows {
		for x := range canvas[y] {
			if canvas[y][x].style == styleRoad && (canvas[y][x].rune == ' ' || canvas[y][x].rune == '·') {
				canvas[y][x].rune = []rune("░▒▓")[(x+y+int(snapshot.Tick/3))%3]
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
		if fogRows[pos.row] && player.ID != selfID {
			continue
		}
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
				frame := explosionFrame(snapshot.Tick-player.DeathTick, opts.Mono || opts.Tier == Mono)
				putStyled(canvas[pos.row], x-len([]rune(frame))/2, frame, styleExplosion)
			}
		}
		if len(players) > 1 {
			badgeX := x - 1
			if hasSelf {
				badgeX = x + 3
			}
			putStyled(canvas[pos.row], badgeX, fmt.Sprintf("[%d]", len(players)), styleOtherPlayer)
		}
		for _, player := range players {
			if player.ID == selfID {
				if player.State == game.Exploding {
					break
				}
				carStyle := styleForDamage(player.Damage)
				if player.Hit {
					carStyle = styleCarHit
				}
				top, bottom := "▄██▄", "▀██▀"
				if player.Hit && (opts.Mono || opts.Tier == Mono) {
					top, bottom = "████", "▓██▓"
				}
				putStyled(canvas[pos.row], x-2, top, carStyle)
				if pos.row+1 < height {
					putStyled(canvas[pos.row+1], x-2, bottom, carStyle)
				}
				if player.Slipstream {
					for trailRow := pos.row + 2; trailRow <= min(height-1, pos.row+3); trailRow++ {
						putStyled(canvas[trailRow], x, "^", styleBenefit)
					}
				}
				break
			}
		}
		if len(players) == 1 && players[0].ID != selfID && players[0].State != game.Exploding {
			putStyled(canvas[pos.row], x-1, "◇", styleOtherPlayer)
			available := max(0, (pos.lane+1)*laneWidth-(x+1))
			putStyled(canvas[pos.row], x+1, clip(" "+players[0].Name, available), styleOtherPlayer)
		}
	}

	if snapshot.Shock && snapshot.Tick%2 == 0 && len(canvas) > 1 {
		blank := make([]styledCell, insideWidth)
		for x := range blank {
			blank[x] = styledCell{rune: ' ', style: styleRoad}
		}
		canvas = append(canvas[1:], blank)
	}
	if snapshot.Shock && snapshot.Tick%2 == 0 {
		leftPad++
	}
	rows := make([]string, 0, height)
	for _, row := range canvas {
		if opts.Mono || opts.Tier == Mono {
			rows = append(rows, strings.Repeat(" ", leftPad)+"║"+plainRow(row)+"║")
		} else {
			border := styles.border
			if snapshot.Shock {
				border = styles.borderShock
			}
			rows = append(rows, strings.Repeat(" ", leftPad)+border.Render("║")+renderStyledRow(row, styles)+border.Render("║"))
		}
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
		if shockFlash {
			header = styles.headerShock.Render(header)
			footer = styles.footerShock.Render(footer)
		} else {
			header = renderHUD(headerBefore, headerBar, headerAfter, opts.Width, self.Damage, styles)
			if snapshot.Shock || snapshot.ShockWarning {
				footer = styles.footerShock.Render(footer)
			} else {
				footer = styles.footer.Render(footer)
			}
		}
	}
	return header + "\n" + strings.Join(rows, "\n") + "\n" + footer
}

func explosionFrame(age uint64, mono bool) string {
	phase := min(int(age/10), 3)
	if mono {
		return []string{"*", "***", "* *", ". ."}[phase]
	}
	return []string{"✷", "✹✷✹", "* ✹ *", "·  ·  ·"}[phase]
}

func dashPhase(distance float64, speed int) int {
	ratio := min(1.0, max(0.0, float64(speed-110)/150))
	divisor := 2 + ratio*3
	return int(distance / divisor)
}

func renderHUD(before, bar, after string, width, damage int, styles *Styles) string {
	runes := []rune(before + bar + after)
	if len(runes) > width {
		runes = runes[:width]
	}
	for len(runes) < width {
		runes = append(runes, ' ')
	}
	cells := make([]styledCell, len(runes))
	for i, r := range runes {
		cells[i] = styledCell{rune: r, style: styleHUD}
	}
	barStart := len([]rune(before))
	barEnd := min(len(cells), barStart+len([]rune(bar)))
	barStyle := styleBenefit
	if damage >= 75 {
		barStyle = styleCarDarkRed
	} else if damage >= 50 {
		barStyle = styleCarRed
	} else if damage >= 25 {
		barStyle = styleCarYellow
	}
	for i := barStart; i < barEnd; i++ {
		cells[i].style = barStyle
	}
	return renderStyledRow(cells, styles)
}

func clip(value string, maximum int) string {
	if maximum <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) > maximum {
		runes = runes[:maximum]
	}
	return string(runes)
}

func tierColor(tier ColorTier, ansi256, truecolor string) lipgloss.Color {
	if tier == TrueColor {
		return lipgloss.Color(truecolor)
	}
	return lipgloss.Color(ansi256)
}

func styleForHazard(kind string, warning bool) styleClass {
	if warning || kind == "traffic" || kind == "shock" {
		return styleHazardRed
	}
	switch kind {
	case "oil":
		return styleOil
	case "slipstream", "repair":
		return styleBenefit
	default:
		return styleRoad
	}
}

func styleForDamage(damage int) styleClass {
	switch {
	case damage >= 75:
		return styleCarDarkRed
	case damage >= 50:
		return styleCarRed
	case damage >= 25:
		return styleCarYellow
	default:
		return styleCarWhite
	}
}

func plainRow(row []styledCell) string {
	runes := make([]rune, len(row))
	for i, cell := range row {
		runes[i] = cell.rune
	}
	return string(runes)
}

func renderStyledRow(row []styledCell, styles *Styles) string {
	if len(row) == 0 {
		return ""
	}
	var out strings.Builder
	start := 0
	for start < len(row) {
		class := row[start].style
		end := start + 1
		for end < len(row) && row[end].style == class {
			end++
		}
		out.WriteString(styles.spanPrefix[class])
		for i := start; i < end; i++ {
			out.WriteRune(row[i].rune)
		}
		out.WriteString(styles.spanSuffix[class])
		start = end
	}
	return out.String()
}

func putStyled(row []styledCell, start int, text string, class styleClass) {
	for i, r := range []rune(text) {
		if start+i >= 0 && start+i < len(row) {
			row[start+i] = styledCell{rune: r, style: class}
		}
	}
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
	return s
}

func pad(s string, width int) string {
	s = fit(s, width)
	return s + strings.Repeat(" ", max(0, width-len([]rune(s))))
}

func put(row []rune, start int, text string) {
	for i, r := range []rune(text) {
		if start+i >= 0 && start+i < len(row) {
			row[start+i] = r
		}
	}
}
