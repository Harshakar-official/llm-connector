package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sync/atomic"
	"time"

	"github.com/llmconnector/connector/internal/api"
	"github.com/llmconnector/connector/internal/config"
	"github.com/llmconnector/connector/internal/models"
	"github.com/llmconnector/connector/internal/utils"
	"github.com/llmconnector/connector/internal/websocket"
)

const version = "1.0.0"

// Connector is the top-level orchestrator that wires all components together.
type Connector struct {
	cfg       *config.Config
	apiClient *api.Client
	llm       LLMClient
	llmType   string
	runner    *BenchmarkRunner
	ws        *websocket.Client

	connectorID string
	llmOnline   atomic.Bool
	activeJobs  atomic.Int32

	startedAt          time.Time
	lastHeartbeatOK    atomic.Bool
	lastHeartbeatTime  atomic.Value // time.Time
	platformReachable  atomic.Bool
	healthServer       *http.Server
}

// New creates a new Connector from the given configuration.
func New(cfg *config.Config) *Connector {
	return &Connector{cfg: cfg}
}

// Run starts the connector and blocks until the context is cancelled.
func (c *Connector) Run(ctx context.Context) error {
	c.startedAt = time.Now()
	c.apiClient = api.New(c.cfg.ServerURL, c.cfg.APIKey)

	if err := c.loadOrCreateID(); err != nil {
		return fmt.Errorf("connector id: %w", err)
	}

	if err := c.register(ctx); err != nil {
		return fmt.Errorf("register: %w", err)
	}

	c.initLLM()
	c.reportModels()

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	go c.heartbeatLoop(ctx)
	go c.startHealthServer(ctx)

	c.ws = websocket.New(c.cfg.ServerURL, c.cfg.APIKey, c.connectorID, c.handleWSMessage)
	go c.ws.Connect(ctx, time.Duration(c.cfg.ReconnectDelay)*time.Second)

	llmInfo := c.llmType
	if llmInfo == LLMTypeNone {
		llmInfo = "no LLM detected"
	}
	log.Printf("connector %s running on %s/%s [llm: %s]", c.connectorID, runtime.GOOS, runtime.GOARCH, llmInfo)

	<-ctx.Done()
	log.Println("connector shutting down")
	if c.healthServer != nil {
		c.healthServer.Shutdown(context.Background())
	}
	return nil
}

func (c *Connector) loadOrCreateID() error {
	if err := os.MkdirAll(c.cfg.DataDir, 0750); err != nil {
		return fmt.Errorf("create data dir: %w", err)
	}

	idPath := filepath.Join(c.cfg.DataDir, "connector.id")
	data, err := os.ReadFile(idPath)
	if err == nil {
		c.connectorID = string(data)
		return nil
	}

	if !os.IsNotExist(err) {
		return err
	}

	c.connectorID = utils.GenerateID()
	if err := os.WriteFile(idPath, []byte(c.connectorID), 0600); err != nil {
		return fmt.Errorf("save connector id: %w", err)
	}

	log.Printf("generated new connector id: %s", c.connectorID)
	return nil
}

func (c *Connector) register(ctx context.Context) error {
	hostname, _ := os.Hostname()
	req := models.RegisterRequest{
		ConnectorID: c.connectorID,
		Version:     version,
		Platform:    runtime.GOOS,
		Hostname:    hostname,
	}

	if err := c.apiClient.Register(req); err != nil {
		return fmt.Errorf("register request: %w", err)
	}

	log.Println("registered with cloud platform")
	return nil
}

func (c *Connector) initLLM() {
	baseURL, llmType := DiscoverLLM(nil, c.cfg.OllamaURL)
	c.llmType = llmType

	switch llmType {
	case LLMTypeOllama:
		c.llm = NewOllamaClient(baseURL)
		log.Printf("detected Ollama at %s", baseURL)
	case LLMTypeOpenAI:
		c.llm = NewOpenAIClient(baseURL)
		log.Printf("detected OpenAI-compatible server at %s", baseURL)
	default:
		log.Printf("no local LLM detected (probed: %s)", c.cfg.OllamaURL)
		return
	}

	c.llmOnline.Store(c.llm.CheckAlive())
	c.runner = NewBenchmarkRunner(c.llm)
}

func (c *Connector) reportModels() {
	if c.llm == nil {
		return
	}

	modelsList, err := c.llm.ListModels()
	if err != nil {
		log.Printf("list models: %v", err)
		return
	}

	resp := models.WSModelsResponse{
		RequestID: "startup",
		Models:    modelsList,
	}
	payload, _ := json.Marshal(resp)
	msg := models.WSMessage{Type: "models_list", Payload: payload}

	if c.ws != nil {
		_ = c.ws.SendMessage(msg)
	}

	log.Printf("advertised %d models to platform", len(modelsList))
}

// --- health server ---

func (c *Connector) startHealthServer(ctx context.Context) {
	addr := fmt.Sprintf("127.0.0.1:%d", c.cfg.HealthPort)
	mux := http.NewServeMux()
	mux.HandleFunc("/health", c.healthHandler)

	c.healthServer = &http.Server{Addr: addr, Handler: mux}

	log.Printf("health server listening on http://%s/health", addr)
	if err := c.healthServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Printf("health server error: %v", err)
	}
}

func (c *Connector) healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c.buildHealthPayload())
}

func (c *Connector) buildHealthPayload() map[string]interface{} {
	status := "ok"
	llmConnected := c.llmOnline.Load()
	platformOK := c.platformReachable.Load()
	wsConnected := c.ws != nil && c.ws.IsConnected()

	if !llmConnected || !platformOK {
		status = "degraded"
	}
	if c.llm == nil && !platformOK {
		status = "error"
	}

	lastHB := c.lastHeartbeatTime.Load()
	lastHBStr := ""
	if t, ok := lastHB.(time.Time); ok && !t.IsZero() {
		lastHBStr = t.Format(time.RFC3339)
	}

	llmType := c.llmType
	if llmType == "" {
		llmType = LLMTypeNone
	}
	llmStatus := "disconnected"
	if llmConnected {
		llmStatus = "connected"
	}

	platformStatus := "unreachable"
	if platformOK {
		platformStatus = "reachable"
	}

	wsStatus := "disconnected"
	if wsConnected {
		wsStatus = "connected"
	}

	payload := map[string]interface{}{
		"status":       status,
		"version":      version,
		"connector_id": c.connectorID,
		"uptime":       time.Since(c.startedAt).String(),
		"started_at":   c.startedAt.Format(time.RFC3339),
		"llm": map[string]interface{}{
			"type":         llmType,
			"status":       llmStatus,
			"models_count": 0,
		},
		"platform": map[string]interface{}{
			"reachable":         platformOK,
			"status":            platformStatus,
			"last_heartbeat_ok": c.lastHeartbeatOK.Load(),
			"last_heartbeat":    lastHBStr,
		},
		"websocket": map[string]interface{}{
			"connected": wsConnected,
			"status":    wsStatus,
		},
		"active_jobs": c.activeJobs.Load(),
	}

	modelsCount := 0
	if c.llm != nil && llmConnected {
		models, err := c.llm.ListModels()
		if err == nil {
			modelsCount = len(models)
		}
	}
	payload["llm"].(map[string]interface{})["models_count"] = modelsCount

	return payload
}

// --- heartbeat ---

func (c *Connector) heartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(time.Duration(c.cfg.HeartbeatInterval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}

		// platform health check
		ph, err := c.apiClient.HealthCheck()
		c.platformReachable.Store(err == nil && ph != nil && ph.Reachable)
		c.lastHeartbeatTime.Store(time.Now())

		status := "online"
		llmConnected := false
		modelsCount := 0
		llmType := c.llmType

		if c.llm != nil {
			llmConnected = c.llm.CheckAlive()
			c.llmOnline.Store(llmConnected)
			if llmConnected {
				available, err := c.llm.ListModels()
				if err != nil {
					log.Printf("heartbeat: list models: %v", err)
				} else {
					modelsCount = len(available)
				}
			}
		}

		if !llmConnected || !c.platformReachable.Load() {
			status = "degraded"
		}

		llmStatus := "disconnected"
		if llmConnected {
			llmStatus = "connected"
		}

		req := models.HeartbeatRequest{
			ConnectorID: c.connectorID,
			Status:      status,
			ModelsCount: modelsCount,
			LLMType:     llmType,
			LLMStatus:   llmStatus,
			ActiveJobs:  int(c.activeJobs.Load()),
		}

		if err := c.apiClient.Heartbeat(req); err != nil {
			log.Printf("heartbeat failed: %v", err)
			c.lastHeartbeatOK.Store(false)
		} else {
			c.lastHeartbeatOK.Store(true)
		}
	}
}

// --- websocket handlers ---

func (c *Connector) handleWSMessage(msg models.WSMessage) {
	switch msg.Type {
	case "ping":
		_ = c.ws.SendMessage(models.WSMessage{Type: "pong"})
	case "health_check":
		c.handleHealthCheck()
	case "list_models":
		c.handleListModels(msg)
	case "run_benchmark":
		c.handleRunBenchmark(msg)
	default:
		log.Printf("unknown ws message type: %s", msg.Type)
	}
}

func (c *Connector) handleHealthCheck() {
	payload, _ := json.Marshal(c.buildHealthPayload())
	msg := models.WSMessage{Type: "health_status", Payload: payload}
	_ = c.ws.SendMessage(msg)
}

func (c *Connector) handleListModels(msg models.WSMessage) {
	var req models.WSModelsRequest
	if err := json.Unmarshal(msg.Payload, &req); err != nil {
		log.Printf("list_models: invalid payload: %v", err)
		return
	}

	modelsList, err := c.llm.ListModels()
	if err != nil {
		log.Printf("list_models: llm error: %v", err)
		return
	}

	resp := models.WSModelsResponse{
		RequestID: req.RequestID,
		Models:    modelsList,
	}
	payload, _ := json.Marshal(resp)
	out := models.WSMessage{Type: "models_list", Payload: payload}

	if err := c.ws.SendMessage(out); err != nil {
		log.Printf("list_models: send response: %v", err)
	}
}

func (c *Connector) handleRunBenchmark(msg models.WSMessage) {
	var req models.WSRunRequest
	if err := json.Unmarshal(msg.Payload, &req); err != nil {
		log.Printf("run_benchmark: invalid payload: %v", err)
		return
	}

	c.activeJobs.Add(1)
	defer c.activeJobs.Add(-1)

	log.Printf("running benchmark job %s on model %s", req.Job.JobID, req.Job.Model)
	result := c.runner.Execute(req.Job)
	result.ConnectorID = c.connectorID

	uploadReq := models.UploadResultRequest{Result: result}
	if err := c.apiClient.UploadResult(uploadReq); err != nil {
		log.Printf("upload result for job %s after retries: %v", req.Job.JobID, err)
		return
	}

	log.Printf("uploaded result for job %s (latency=%dms tokens=%d/%d)",
		result.JobID, result.LatencyMs, result.TokensIn, result.TokensOut)
}
