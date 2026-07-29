package game

import "testing"

func TestDamageStatusAndScore(t *testing.T) {
	p := NewPlayer("p1", "driver")
	if dead := p.ApplyDamage(46, "WRONG-WAY TRAFFIC"); dead {
		t.Fatal("46 damage should not kill a fresh player")
	}
	if got := SurvivalStatus(p.Damage); got != "Shaken But Alive" {
		t.Fatalf("status = %q", got)
	}
	if got := Score(123.9, p.Damage); got != 177 {
		t.Fatalf("score = %d, want 177", got)
	}
	if dead := p.ApplyDamage(80, "ROAD GAP"); !dead {
		t.Fatal("damage should clamp and kill")
	}
	if p.Damage != 100 || SurvivalStatus(p.Damage) != "Flatlined" {
		t.Fatalf("damage/status = %d/%q", p.Damage, SurvivalStatus(p.Damage))
	}
}

func TestSteeringAndNudgeClamp(t *testing.T) {
	p := NewPlayer("p1", "driver")
	for range 10 {
		p.Steer(-1, false)
		p.Nudge(1)
	}
	if p.Lane != 0 || p.SpeedNudge != 1 {
		t.Fatalf("lane/nudge = %d/%d", p.Lane, p.SpeedNudge)
	}
	p.Steer(1, true)
	if p.Lane != 0 {
		t.Fatalf("reversed steering escaped clamp: %d", p.Lane)
	}
}
