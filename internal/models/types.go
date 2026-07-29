package models

import "encoding/json"

// Connector registration request sent to the cloud platform.
type RegisterRequest struct {
	ConnectorID string `json:"connector_id"`
	Version     string `json:"version"`
	Platform    string `json:"platform"`
	Hostname    string `json:"hostname"`
}

// RegisterResponse from the cloud platform.
type RegisterResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

// HeartbeatRequest sent periodically to signal the connector is alive.
type HeartbeatRequest struct {
	ConnectorID string `json:"connector_id"`
	Status      string `json:"status"`       // "online" / "degraded"
	ModelsCount int    `json:"models_count"`
	LLMType     string `json:"llm_type"`     // "ollama" / "openai" / "none"
	LLMStatus   string `json:"llm_status"`   // "connected" / "disconnected"
	ActiveJobs  int    `json:"active_jobs"`
}

// HeartbeatResponse from the cloud platform.
type HeartbeatResponse struct {
	Status string `json:"status"`
}

// ModelInfo describes a model available on the local LLM instance.
type ModelInfo struct {
	Name       string `json:"name"`
	Size       int64  `json:"size,omitempty"`
	ModifiedAt string `json:"modified_at,omitempty"`
}

// BenchmarkJob represents a prompt execution request sent by the platform.
type BenchmarkJob struct {
	JobID   string                 `json:"job_id"`
	Model   string                 `json:"model"`
	Prompt  string                 `json:"prompt"`
	Options map[string]interface{} `json:"options,omitempty"`
}

// BenchmarkResult is sent back to the platform after a job completes.
type BenchmarkResult struct {
	JobID       string `json:"job_id"`
	ConnectorID string `json:"connector_id"`
	Model       string `json:"model"`
	Prompt      string `json:"prompt"`
	Response    string `json:"response"`
	LatencyMs   int64  `json:"latency_ms"`
	TokensIn    int    `json:"tokens_in"`
	TokensOut   int    `json:"tokens_out"`
	Error       string `json:"error,omitempty"`
}

// UploadResultRequest wraps a result for the upload API.
type UploadResultRequest struct {
	Result BenchmarkResult `json:"result"`
}

// UploadResultResponse from the cloud platform.
type UploadResultResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

// WSMessage is the envelope for all WebSocket messages.
type WSMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// WSModelsRequest is sent by the server to request the model list.
type WSModelsRequest struct {
	RequestID string `json:"request_id"`
}

// WSModelsResponse is sent by the connector with the model list.
type WSModelsResponse struct {
	RequestID string      `json:"request_id"`
	Models    []ModelInfo `json:"models"`
}

// WSRunRequest is sent by the server to trigger a benchmark.
type WSRunRequest struct {
	Job BenchmarkJob `json:"job"`
}
