package api

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"time"

	"github.com/llmconnector/connector/internal/models"
)

const (
	requestTimeout    = 15 * time.Second
	maxResponseBytes  = 10 << 20 // 10 MB limit on cloud API responses
	maxErrorBodyBytes = 1 << 10  // 1 KB limit on error response bodies
)

// Client communicates with the cloud platform over HTTPS.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// New creates a new API client. tlsConfig can be nil for default Go TLS.
func New(baseURL, apiKey string, tlsConfig *tls.Config) *Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if tlsConfig != nil {
		transport.TLSClientConfig = tlsConfig
	}

	return &Client{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout:   requestTimeout,
			Transport: transport,
		},
	}
}

func (c *Client) do(method, path string, body, out interface{}) error {
	url := c.baseURL + path

	var reqBody []byte
	if body != nil {
		var err error
		reqBody, err = json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}
	}

	req, err := http.NewRequest(method, url, bytes.NewReader(reqBody))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		limited := io.LimitReader(resp.Body, maxErrorBodyBytes)
		bodyBytes, _ := io.ReadAll(limited)
		return fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	// enforce response body size limit
	reader := io.ReadCloser(resp.Body)
	if maxResponseBytes > 0 {
		reader = http.MaxBytesReader(nil, resp.Body, maxResponseBytes)
	}

	if out != nil {
		if err := json.NewDecoder(reader).Decode(out); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}

	return nil
}

// Register sends a registration request to the cloud platform.
func (c *Client) Register(req models.RegisterRequest) error {
	var resp models.RegisterResponse
	return c.do(http.MethodPost, "/api/v1/connectors/register", req, &resp)
}

// Heartbeat sends a liveness signal to the cloud platform.
func (c *Client) Heartbeat(req models.HeartbeatRequest) error {
	var resp models.HeartbeatResponse
	return c.do(http.MethodPost, "/api/v1/connectors/heartbeat", req, &resp)
}

// PlatformHealth describes the reachability of the cloud platform.
type PlatformHealth struct {
	Reachable      bool   `json:"reachable"`
	StatusCode     int    `json:"status_code,omitempty"`
	LatencyMs      int64  `json:"latency_ms"`
}

// HealthCheck probes the cloud platform's health endpoint.
func (c *Client) HealthCheck() (*PlatformHealth, error) {
	start := time.Now()
	resp, err := c.httpClient.Get(c.baseURL + "/api/v1/health")
	elapsed := time.Since(start).Milliseconds()

	ph := &PlatformHealth{LatencyMs: elapsed}
	if err != nil {
		return ph, fmt.Errorf("health check failed: %w", err)
	}
	defer resp.Body.Close()

	ph.StatusCode = resp.StatusCode
	ph.Reachable = resp.StatusCode == http.StatusOK
	return ph, nil
}

// UploadResult sends a benchmark result to the cloud platform with retries.
func (c *Client) UploadResult(req models.UploadResultRequest) error {
	var resp models.UploadResultResponse
	var lastErr error

	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(math.Pow(2, float64(attempt))) * time.Second)
		}
		lastErr = c.do(http.MethodPost, "/api/v1/connectors/results", req, &resp)
		if lastErr == nil {
			return nil
		}
	}
	return fmt.Errorf("upload result after 3 attempts: %w", lastErr)
}
