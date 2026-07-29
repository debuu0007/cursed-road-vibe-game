package session

import (
	"testing"
	"time"
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
