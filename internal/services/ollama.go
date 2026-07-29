package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/llmconnector/connector/internal/models"
)

// OllamaResult holds the outcome of a single generate call.
type OllamaResult struct {
	Response    string
	LatencyMs   int64
	TokensIn    int
	TokensOut   int
}

// OllamaClient interacts with a local Ollama instance.
type OllamaClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewOllamaClient creates a client pointing at the local Ollama server.
func NewOllamaClient(baseURL string) *OllamaClient {
	return &OllamaClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 5 * time.Minute,
		},
	}
}

func (o *OllamaClient) Name() string { return LLMTypeOllama }

// CheckAlive returns true if Ollama responds at the configured address.
func (o *OllamaClient) CheckAlive() bool {
	resp, err := o.httpClient.Get(o.baseURL)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// ListModels returns all models available on the local Ollama instance.
func (o *OllamaClient) ListModels() ([]models.ModelInfo, error) {
	resp, err := o.httpClient.Get(o.baseURL + "/api/tags")
	if err != nil {
		return nil, fmt.Errorf("ollama tags request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read ollama tags: %w", err)
	}

	var tagsResp struct {
		Models []models.ModelInfo `json:"models"`
	}
	if err := json.Unmarshal(body, &tagsResp); err != nil {
		return nil, fmt.Errorf("parse ollama tags: %w", err)
	}

	return tagsResp.Models, nil
}

// Generate sends a prompt to Ollama and returns the result.
func (o *OllamaClient) Generate(model, prompt string, opts map[string]interface{}) (*OllamaResult, error) {
	reqBody := map[string]interface{}{
		"model":  model,
		"prompt": prompt,
		"stream": false,
	}
	if len(opts) > 0 {
		reqBody["options"] = opts
	}

	data, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal generate request: %w", err)
	}

	start := time.Now()
	resp, err := o.httpClient.Post(o.baseURL+"/api/generate", "application/json", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("ollama generate request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read ollama generate response: %w", err)
	}

	var genResp struct {
		Response        string `json:"response"`
		TotalDuration   int64  `json:"total_duration"`
		PromptEvalCount int    `json:"prompt_eval_count"`
		EvalCount       int    `json:"eval_count"`
		Error           string `json:"error"`
	}

	if err := json.Unmarshal(body, &genResp); err != nil {
		return nil, fmt.Errorf("parse ollama generate response: %w", err)
	}

	if genResp.Error != "" {
		return nil, fmt.Errorf("ollama error: %s", genResp.Error)
	}

	elapsed := time.Since(start)
	latencyMs := elapsed.Milliseconds()

	// Use wall-clock time since it best represents the user experience.
	// Fall back to Ollama's reported duration if available.
	if genResp.TotalDuration > 0 {
		latencyMs = genResp.TotalDuration / 1_000_000
	}

	return &OllamaResult{
		Response:  genResp.Response,
		LatencyMs: latencyMs,
		TokensIn:  genResp.PromptEvalCount,
		TokensOut: genResp.EvalCount,
	}, nil
}
