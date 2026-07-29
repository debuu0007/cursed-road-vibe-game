package score

import (
	"path/filepath"
	"testing"
	"time"
)

func TestJSONLPersistenceAndBoards(t *testing.T) {
	path := filepath.Join(t.TempDir(), "scores.jsonl")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 7, 29, 12, 0, 0, 0, time.UTC)
	store.now = func() time.Time { return now }
	if _, err := store.Record("low", 100, 100, "GAP"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Record("high", 300, 100, "TRAFFIC"); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	reloaded, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer reloaded.Close()
	reloaded.now = func() time.Time { return now }
	boards := reloaded.Boards()
	if len(boards.AllTime) != 2 || boards.AllTime[0].Name != "high" {
		t.Fatalf("unexpected all-time board: %#v", boards.AllTime)
	}
	if len(boards.Today) != 2 {
		t.Fatalf("today length = %d", len(boards.Today))
	}
}
