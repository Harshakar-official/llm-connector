package services

import (
	"net/http"
	"strings"
	"time"
)

// candidate describes an LLM endpoint to probe during auto-discovery.
type candidate struct {
	baseURL string
	llmType string
	probe   string
}

// commonEndpoints lists well-known local LLM addresses ordered by likelihood.
var commonEndpoints = []candidate{
	{baseURL: "http://localhost:11434", llmType: LLMTypeOllama, probe: "/api/tags"},
	{baseURL: "http://127.0.0.1:11434", llmType: LLMTypeOllama, probe: "/api/tags"},
	{baseURL: "http://localhost:8080", llmType: LLMTypeOpenAI, probe: "/v1/models"},
	{baseURL: "http://localhost:8000", llmType: LLMTypeOpenAI, probe: "/v1/models"},
	{baseURL: "http://localhost:5000", llmType: LLMTypeOpenAI, probe: "/v1/models"},
	{baseURL: "http://localhost:8080", llmType: LLMTypeOllama, probe: "/api/tags"},
	{baseURL: "http://localhost:8000", llmType: LLMTypeOllama, probe: "/api/tags"},
	{baseURL: "http://localhost:3000", llmType: LLMTypeOpenAI, probe: "/v1/models"},
}

// DiscoverLLM probes common endpoints to find a running LLM backend.
// configuredURL is tried first (with type detection). Returns the base URL
// and detected type, or ("", "none") if nothing responds.
func DiscoverLLM(httpClient *http.Client, configuredURL string) (string, string) {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 2 * time.Second}
	}

	candidates := []candidate{}

	// user-configured URL gets first priority — probe for both types
	if configuredURL != "" {
		base := strings.TrimRight(configuredURL, "/")
		candidates = append(candidates,
			candidate{baseURL: base, llmType: LLMTypeOllama, probe: "/api/tags"},
			candidate{baseURL: base, llmType: LLMTypeOpenAI, probe: "/v1/models"},
		)
	}

	candidates = append(candidates, commonEndpoints...)

	seen := map[string]bool{}
	for _, c := range candidates {
		key := c.baseURL + "|" + c.llmType
		if seen[key] {
			continue
		}
		seen[key] = true

		probeURL := c.baseURL
		if c.probe != "" {
			probeURL += c.probe
		}

		resp, err := httpClient.Get(probeURL)
		if err != nil {
			continue
		}
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			return c.baseURL, c.llmType
		}
	}

	return "", LLMTypeNone
}
