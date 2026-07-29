GO ?= go
PORT ?= 22229

.PHONY: fmt test vet build check e2e

fmt:
	$(GO) fmt ./...

test:
	$(GO) test ./...

vet:
	$(GO) vet ./...

build:
	$(GO) build -o cursedroad ./cmd/cursedroad

check: fmt test vet build

e2e: build
	PORT=$(PORT) SERVER_BIN=./cursedroad ./scripts/e2e.sh
