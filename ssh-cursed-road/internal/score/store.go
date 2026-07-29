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
	writeHook func()
}

type recordRequest struct {
	name     string
	distance float64
	damage   int
	cause    string
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
	store.records = make(chan recordRequest, 256)
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

func (s *Store) Record(name string, distance float64, damage int, cause string) bool {
	if s.closed.Load() {
		return false
	}
	select {
	case s.records <- recordRequest{name: name, distance: distance, damage: damage, cause: cause}:
		return true
	case <-s.done:
		return false
	default:
		slog.Warn("score queue full; dropping record", "name", name, "distance", int(distance), "cause", cause)
		return false
	}
}

func (s *Store) run() {
	defer close(s.done)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	dirty := false
	var asyncErr error
	for {
		select {
		case request := <-s.records:
			if _, err := s.write(request.name, request.distance, request.damage, request.cause); err != nil {
				asyncErr = err
				slog.Error("persist score", "error", err, "name", request.name)
			} else {
				dirty = true
			}
		case <-ticker.C:
			if dirty {
				if err := s.file.Sync(); err != nil {
					asyncErr = err
					slog.Error("sync scoreboard", "error", err)
				} else {
					dirty = false
				}
			}
		case reply := <-s.closing:
			for {
				select {
				case request := <-s.records:
					if _, err := s.write(request.name, request.distance, request.damage, request.cause); err != nil {
						asyncErr = err
						slog.Error("persist score while closing", "error", err, "name", request.name)
					}
				default:
					goto drained
				}
			}
		drained:
			err := asyncErr
			if syncErr := s.file.Sync(); err == nil {
				err = syncErr
			}
			if closeErr := s.file.Close(); err == nil {
				err = closeErr
			}
			reply <- err
			return
		}
	}
}

func (s *Store) write(name string, distance float64, damage int, cause string) (Entry, error) {
	if s.writeHook != nil {
		s.writeHook()
	}
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
