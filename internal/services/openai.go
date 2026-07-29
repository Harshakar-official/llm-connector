package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/llmconnector/connector/internal/models"
)

// OpenAIClient communicates with any OpenAI-compatible API
// (vLLM, TGI, llama.cpp server, LM Studio, etc.).
type OpenAIClient struct {
	baseURL       string
	httpClient    *http.Client
	maxBodySize   int64
}

// NewOpenAIClient creates a client for an OpenAI-compatible endpoint.
func NewOpenAIClient(baseURL string, maxResponseSize int) *OpenAIClient {
	base := strings.TrimRight(baseURL, "/")
	if !strings.HasSuffix(base, "/v1") {
		base += "/v1"
	}
	return &OpenAIClient{
		baseURL: base,
		httpClient: &http.Client{
			Timeout: 5 * time.Minute,
		},
		maxBodySize: int64(maxResponseSize),
	}
}

func (o *OpenAIClient) Name() string { return LLMTypeOpenAI }

func (o *OpenAIClient) CheckAlive() bool {
	resp, err := o.httpClient.Get(o.baseURL + "/models")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func (o *OpenAIClient) ListModels() ([]models.ModelInfo, error) {
	resp, err := o.httpClient.Get(o.baseURL + "/models")
	if err != nil {
		return nil, fmt.Errorf("list models request: %w", err)
	}
	defer resp.Body.Close()

	reader := io.ReadCloser(resp.Body)
	if o.maxBodySize > 0 {
		reader = http.MaxBytesReader(nil, resp.Body, o.maxBodySize)
	}

	body, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("read models response: %w", err)
	}

	var list struct {
		Data []struct {
			ID      string `json:"id"`
			Created int64  `json:"created"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &list); err != nil {
		return nil, fmt.Errorf("parse models response: %w", err)
	}

	result := make([]models.ModelInfo, len(list.Data))
	for i, m := range list.Data {
		result[i] = models.ModelInfo{Name: m.ID}
	}
	return result, nil
}

func (o *OpenAIClient) Generate(model, prompt string, opts map[string]interface{}) (*OllamaResult, error) {
	maxTokens := 2048
	if v, ok := opts["max_tokens"]; ok {
		if vt, ok := v.(float64); ok {
			maxTokens = int(vt)
		}
	}

	reqBody := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"stream":    false,
		"max_tokens": maxTokens,
	}

	data, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	start := time.Now()
	resp, err := o.httpClient.Post(o.baseURL+"/chat/completions", "application/json", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("generate request: %w", err)
	}
	defer resp.Body.Close()

	reader := io.ReadCloser(resp.Body)
	if o.maxBodySize > 0 {
		reader = http.MaxBytesReader(nil, resp.Body, o.maxBodySize)
	}

	body, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("generate failed (status %d): %s", resp.StatusCode, string(body))
	}

	var genResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage *struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := json.Unmarshal(body, &genResp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	if genResp.Error != nil && genResp.Error.Message != "" {
		return nil, fmt.Errorf("API error: %s", genResp.Error.Message)
	}

	content := ""
	if len(genResp.Choices) > 0 {
		content = genResp.Choices[0].Message.Content
	}

	tokensIn := 0
	tokensOut := 0
	if genResp.Usage != nil {
		tokensIn = genResp.Usage.PromptTokens
		tokensOut = genResp.Usage.CompletionTokens
	}

	return &OllamaResult{
		Response:  content,
		LatencyMs: time.Since(start).Milliseconds(),
		TokensIn:  tokensIn,
		TokensOut: tokensOut,
	}, nil
}
