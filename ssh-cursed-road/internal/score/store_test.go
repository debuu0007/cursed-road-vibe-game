package score

import (
	"path/filepath"
	"sync"
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
	if !store.Record("low", 100, 100, "GAP") {
		t.Fatal("low score was not queued")
	}
	if !store.Record("high", 300, 100, "TRAFFIC") {
		t.Fatal("high score was not queued")
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

func TestRecordDoesNotBlockWhenPersistenceIsSlow(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "scores.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	started := make(chan struct{})
	release := make(chan struct{})
	var once sync.Once
	store.writeHook = func() {
		once.Do(func() { close(started) })
		<-release
	}
	if !store.Record("first", 100, 100, "TRAFFIC") {
		t.Fatal("first record was not queued")
	}
	<-started
	for i := 0; i < cap(store.records); i++ {
		if !store.Record("queued", float64(101+i), 100, "TRAFFIC") {
			t.Fatalf("record %d was dropped before the queue filled", i)
		}
	}
	start := time.Now()
	if store.Record("overflow", 999, 100, "TRAFFIC") {
		t.Fatal("overflow record was accepted")
	}
	if elapsed := time.Since(start); elapsed > 20*time.Millisecond {
		t.Fatalf("full-queue Record blocked for %s", elapsed)
	}
	close(release)
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
}
