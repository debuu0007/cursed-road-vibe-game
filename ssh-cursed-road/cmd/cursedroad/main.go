package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"cursedroad/internal/limits"
	"cursedroad/internal/rooms"
	"cursedroad/internal/score"
	gamesession "cursedroad/internal/session"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/ssh"
	"github.com/charmbracelet/wish"
	wishtea "github.com/charmbracelet/wish/bubbletea"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	host := flag.String("host", "0.0.0.0", "listen host")
	port := flag.Int("port", 2222, "listen port")
	hostKey := flag.String("host-key", "host_ed25519", "persistent SSH host key path")
	scorePath := flag.String("scores", "scores.jsonl", "append-only scoreboard path")
	maxSessions := flag.Int("max-sessions", 300, "global active session cap")
	flag.Parse()

	if err := os.MkdirAll(filepath.Dir(*hostKey), 0o700); err != nil && filepath.Dir(*hostKey) != "." {
		return fmt.Errorf("host key directory: %w", err)
	}

	serverCtx, serverCancel := context.WithCancel(context.Background())
	defer serverCancel()
	scores, err := score.Open(*scorePath)
	if err != nil {
		return err
	}
	defer scores.Close()
	manager := rooms.NewManager(serverCtx, rooms.DefaultWorldSeed, scores)
	defer manager.Close()
	draining := make(chan struct{})
	ipLimiter := limits.NewIPLimiter(3, 10)
	gate := limits.NewGate(*maxSessions)

	server, err := wish.NewServer(
		wish.WithAddress(net.JoinHostPort(*host, fmt.Sprint(*port))),
		wish.WithHostKeyPath(*hostKey),
		wish.WithMiddleware(wishtea.Middleware(func(s ssh.Session) (tea.Model, []tea.ProgramOption) {
			renderer := wishtea.MakeRenderer(s)
			model := gamesession.NewModel(manager, scores, draining, renderer)
			go func() {
				<-s.Context().Done()
				model.Close()
			}()
			return model, []tea.ProgramOption{tea.WithAltScreen()}
		}), admissionMiddleware(ipLimiter, gate)),
	)
	if err != nil {
		return fmt.Errorf("create SSH server: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		close(draining)
		timer := time.NewTimer(2 * time.Second)
		<-timer.C
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	slog.Info("the road opens", "address", server.Addr, "host_key", *hostKey)
	err = server.ListenAndServe()
	if errors.Is(err, ssh.ErrServerClosed) || errors.Is(err, net.ErrClosed) {
		return nil
	}
	return err
}

func admissionMiddleware(ipLimiter *limits.IPLimiter, gate *limits.Gate) wish.Middleware {
	return func(next ssh.Handler) ssh.Handler {
		return func(s ssh.Session) {
			defer io.WriteString(s, "\x1b[0m\x1b[?25h\x1b[?1049l\r\n")
			started := time.Now()
			ip := s.RemoteAddr().String()
			if host, _, err := net.SplitHostPort(ip); err == nil {
				ip = host
			}
			releaseIP, err := ipLimiter.Acquire(ip, time.Now())
			if err != nil {
				slog.Warn("connection rejected", "ip", ip, "reason", err)
				_, _ = io.WriteString(s, "the road is crowded — try again shortly\r\n")
				return
			}
			defer releaseIP()
			slog.Info("connection accepted", "ip", ip)
			defer func() { slog.Info("connection closed", "ip", ip, "duration", time.Since(started)) }()
			releaseSlot, err := gate.Wait(s.Context(), func(ahead int) {
				_, _ = fmt.Fprintf(s, "\x1b[2J\x1b[HQUEUE TO THE ROAD\r\n\r\n%d cars ahead of you\r\n", ahead)
			})
			if err != nil {
				return
			}
			defer releaseSlot()
			next(s)
		}
	}
}
