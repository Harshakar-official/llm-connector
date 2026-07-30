package services

import (
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/llmconnector/connector/internal/utils"
)

// Default common LLM ports in priority order.
var defaultPorts = []int{11434, 8080, 8000, 5000, 3000, 8090, 9000, 8188, 7860, 8888, 1234, 5555}

// DiscoverLLM probes the network to find a running LLM backend.
// configuredURL is tried first (with type detection).
// scanPorts specifies custom ports to scan (empty = use defaults).
// Returns the base URL and detected type, or ("", "none") if nothing responds.
func DiscoverLLM(httpClient *http.Client, configuredURL string, scanPorts string) (string, string) {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 3 * time.Second}
	}

	// ── 1. Try user-configured URL first ──────────────────────────
	if configuredURL != "" {
		base := strings.TrimRight(configuredURL, "/")
		if probeEndpoint(httpClient, base+"/api/tags") {
			return base, LLMTypeOllama
		}
		if probeEndpoint(httpClient, base+"/v1/models") {
			return base, LLMTypeOpenAI
		}
		slog.Warn("configured ollama_url not responding, falling back to port scan",
			"url", configuredURL)
	}

	// ── 2. Build port list ────────────────────────────────────────
	ports := defaultPorts
	if scanPorts != "" {
		parsed, err := utils.ParsePorts(scanPorts)
		if err != nil {
			slog.Warn("invalid scan_ports, using defaults", "error", err)
		} else if len(parsed) > 0 {
			ports = parsed
		}
	}

	// extract host from configured URL if available, else use localhost
	host := "127.0.0.1"
	if configuredURL != "" {
		if h, _, err := net.SplitHostPort(strings.TrimPrefix(
			strings.TrimPrefix(configuredURL, "http://"), "https://")); err == nil {
			host = h
		}
	}

	// ── 3. TCP pre-check (fast) then HTTP probe each port ─────────
	tt := time.Now()
	openPorts := scanOpenTCP(host, ports, 500*time.Millisecond)
	slog.Debug("port scan complete", "host", host, "open", len(openPorts), "elapsed", time.Since(tt))

	for _, port := range openPorts {
		base := fmt.Sprintf("http://%s:%d", host, port)
		// try Ollama first (more likely on custom ports)
		if probeEndpoint(httpClient, base+"/api/tags") {
			slog.Info("discovered LLM", "type", LLMTypeOllama, "url", base)
			return base, LLMTypeOllama
		}
		if probeEndpoint(httpClient, base+"/v1/models") {
			slog.Info("discovered LLM", "type", LLMTypeOpenAI, "url", base)
			return base, LLMTypeOpenAI
		}
	}

	return "", LLMTypeNone
}

// scanOpenTCP performs a fast TCP connect scan on the given ports.
func scanOpenTCP(host string, ports []int, timeout time.Duration) []int {
	var open []int
	for _, port := range ports {
		if utils.TCPPortOpen(host, port, timeout) {
			open = append(open, port)
		}
	}
	return open
}

// probeEndpoint sends a GET request and returns true on 200 OK.
func probeEndpoint(client *http.Client, url string) bool {
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}
