BIN := connector
VERSION := $(shell git describe --tags --always 2>/dev/null || echo "dev")

.PHONY: build build-all clean

build:
	go build -ldflags="-s -w -X main.version=$(VERSION)" -o $(BIN) ./cmd/connector

build-all:
	GOOS=linux   GOARCH=amd64 go build -ldflags="-s -w" -o build/$(BIN)-linux-amd64   ./cmd/connector
	GOOS=linux   GOARCH=arm64 go build -ldflags="-s -w" -o build/$(BIN)-linux-arm64   ./cmd/connector
	GOOS=darwin  GOARCH=amd64 go build -ldflags="-s -w" -o build/$(BIN)-darwin-amd64  ./cmd/connector
	GOOS=darwin  GOARCH=arm64 go build -ldflags="-s -w" -o build/$(BIN)-darwin-arm64  ./cmd/connector
	GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o build/$(BIN)-windows-amd64.exe ./cmd/connector

clean:
	rm -rf build $(BIN)
