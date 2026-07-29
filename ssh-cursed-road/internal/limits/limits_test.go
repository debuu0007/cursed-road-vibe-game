package limits

import (
	"errors"
	"testing"
	"time"
)

func TestIPLimiterConcurrentAndRate(t *testing.T) {
	limiter := NewIPLimiter(3, 10)
	now := time.Date(2026, 7, 29, 0, 0, 0, 0, time.UTC)
	var releases []func()
	for i := 0; i < 3; i++ {
		release, err := limiter.Acquire("127.0.0.1", now)
		if err != nil {
			t.Fatal(err)
		}
		releases = append(releases, release)
	}
	if _, err := limiter.Acquire("127.0.0.1", now); !errors.Is(err, ErrConcurrent) {
		t.Fatalf("fourth concurrent acquire error = %v", err)
	}
	for _, release := range releases {
		release()
	}
	for i := 0; i < 7; i++ {
		release, err := limiter.Acquire("127.0.0.1", now)
		if err != nil {
			t.Fatal(err)
		}
		release()
	}
	if _, err := limiter.Acquire("127.0.0.1", now); !errors.Is(err, ErrRate) {
		t.Fatalf("eleventh connection error = %v", err)
	}
	release, err := limiter.Acquire("127.0.0.1", now.Add(6*time.Second))
	if err != nil {
		t.Fatalf("one token should refill after 6s: %v", err)
	}
	release()
}
