package score

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"cursedroad/internal/game"
)

type Entry struct {
	Name     string    `json:"name"`
	Distance int       `json:"distance"`
	Score    int       `json:"score"`
	Status   string    `json:"status"`
	Cause    string    `json:"cause"`
	DiedAt   time.Time `json:"died_at"`
}

type Boards struct {
	AllTime []Entry
	Today   []Entry
}

type Store struct {
	mu        sync.RWMutex
	file      *os.File
	entries   []Entry
	now       func() time.Time
	records   chan recordRequest
	closing   chan chan error
	done      chan struct{}
	closed    atomic.Bool
	closeOnce sync.Once
}

type recordRequest struct {
	name     string
	distance float64
	damage   int
	cause    string
	reply    chan recordResult
}

type recordResult struct {
	entry Entry
	err   error
}

func Open(path string) (*Store, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR|os.O_APPEND, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open scoreboard: %w", err)
	}
	store := &Store{file: file, now: time.Now}
	if err := store.load(file); err != nil {
		_ = file.Close()
		return nil, err
	}
	store.records = make(chan recordRequest)
	store.closing = make(chan chan error)
	store.done = make(chan struct{})
	go store.run()
	return store, nil
}

func (s *Store) load(reader io.ReadSeeker) error {
	if _, err := reader.Seek(0, io.SeekStart); err != nil {
		return err
	}
	scanner := bufio.NewScanner(reader)
	line := 0
	for scanner.Scan() {
		line++
		var entry Entry
		if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil {
			return fmt.Errorf("scoreboard line %d: %w", line, err)
		}
		s.entries = append(s.entries, entry)
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read scoreboard: %w", err)
	}
	_, err := reader.Seek(0, io.SeekEnd)
	return err
}

func (s *Store) Record(name string, distance float64, damage int, cause string) (Entry, error) {
	if s.closed.Load() {
		return Entry{}, fmt.Errorf("scoreboard is closed")
	}
	reply := make(chan recordResult, 1)
	select {
	case s.records <- recordRequest{name: name, distance: distance, damage: damage, cause: cause, reply: reply}:
	case <-s.done:
		return Entry{}, fmt.Errorf("scoreboard is closed")
	}
	result := <-reply
	return result.entry, result.err
}

func (s *Store) run() {
	defer close(s.done)
	for {
		select {
		case request := <-s.records:
			entry, err := s.write(request.name, request.distance, request.damage, request.cause)
			request.reply <- recordResult{entry: entry, err: err}
		case reply := <-s.closing:
			err := s.file.Sync()
			if closeErr := s.file.Close(); err == nil {
				err = closeErr
			}
			reply <- err
			return
		}
	}
}

func (s *Store) write(name string, distance float64, damage int, cause string) (Entry, error) {
	entry := Entry{
		Name: name, Distance: int(distance), Score: game.Score(distance, damage),
		Status: game.SurvivalStatus(damage), Cause: cause, DiedAt: s.now().UTC(),
	}
	data, err := json.Marshal(entry)
	if err != nil {
		return Entry{}, err
	}
	if _, err := s.file.Write(append(data, '\n')); err != nil {
		return Entry{}, fmt.Errorf("append score: %w", err)
	}
	if err := s.file.Sync(); err != nil {
		return Entry{}, fmt.Errorf("flush score: %w", err)
	}
	s.mu.Lock()
	s.entries = append(s.entries, entry)
	s.mu.Unlock()
	slog.Info("score recorded", "name", entry.Name, "distance", entry.Distance, "score", entry.Score, "cause", entry.Cause)
	return entry, nil
}

func (s *Store) Boards() Boards {
	s.mu.RLock()
	defer s.mu.RUnlock()
	all := append([]Entry(nil), s.entries...)
	sortEntries(all)
	if len(all) > 50 {
		all = all[:50]
	}
	todayKey := s.now().UTC().Format("2006-01-02")
	today := make([]Entry, 0, 10)
	for _, entry := range s.entries {
		if entry.DiedAt.UTC().Format("2006-01-02") == todayKey {
			today = append(today, entry)
		}
	}
	sortEntries(today)
	if len(today) > 10 {
		today = today[:10]
	}
	return Boards{AllTime: all, Today: today}
}

func sortEntries(entries []Entry) {
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].Score == entries[j].Score {
			if entries[i].Distance == entries[j].Distance {
				return entries[i].DiedAt.Before(entries[j].DiedAt)
			}
			return entries[i].Distance > entries[j].Distance
		}
		return entries[i].Score > entries[j].Score
	})
}

func (s *Store) Close() error {
	var result error
	s.closeOnce.Do(func() {
		s.closed.Store(true)
		reply := make(chan error, 1)
		s.closing <- reply
		result = <-reply
	})
	return result
}
