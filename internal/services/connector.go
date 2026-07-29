package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"github.com/llmconnector/connector/internal/api"
	"github.com/llmconnector/connector/internal/config"
	"github.com/llmconnector/connector/internal/metrics"
	"github.com/llmconnector/connector/internal/models"
	"github.com/llmconnector/connector/internal/utils"
	"github.com/llmconnector/connector/internal/websocket"
)

const version = "1.0.0"

// Prometheus metrics
var (
	metricJobsReceived = metrics.NewCounter("llm_connector_jobs_received_total", "Benchmark jobs received from platform")
	metricJobsDone     = metrics.NewCounter("llm_connector_jobs_completed_total", "Benchmark jobs completed")
	metricJobsFailed   = metrics.NewCounter("llm_connector_jobs_failed_total", "Benchmark jobs that failed")
	metricHeartbeats   = metrics.NewCounter("llm_connector_heartbeats_total", "Heartbeats sent to platform")
	metricWSConnects   = metrics.NewCounter("llm_connector_websocket_connects_total", "WebSocket connection attempts")
	metricLLMOnline    = metrics.NewGauge("llm_connector_llm_online", "Whether the local LLM is reachable (1=online, 0=offline)")
	metricWSConnected  = metrics.NewGauge("llm_connector_websocket_connected", "Whether WebSocket is connected (1=yes, 0=no)")
	metricActiveJobs   = metrics.NewGauge("llm_connector_active_jobs", "Currently active benchmark jobs")
)

// Connector is the top-level orchestrator that wires all components together.
type Connector struct {
	cfg       *config.Config
	apiClient *api.Client
	llm       LLMClient
	llmType   string
	runner    *BenchmarkRunner
	ws        *websocket.Client

	connectorID       string
	llmOnline         atomic.Bool
	activeJobs        atomic.Int32
	cachedModelsCount atomic.Int32

	startedAt          time.Time
	lastHeartbeatOK    atomic.Bool
	lastHeartbeatTime  atomic.Value
	platformReachable  atomic.Bool
	healthServer       *http.Server

	jobWg sync.WaitGroup
}

// New creates a new Connector from the given configuration.
func New(cfg *config.Config) *Connector {
	return &Connector{cfg: cfg}
}

// Run starts the connector and blocks until the context is cancelled.
// When the context is cancelled, it drains active jobs before returning.
func (c *Connector) Run(ctx context.Context) error {
	c.startedAt = time.Now()

	tlsCfg, err := c.cfg.TLSConfig()
	if err != nil {
		return fmt.Errorf("TLS config: %w", err)
	}

	c.apiClient = api.New(c.cfg.ServerURL, c.cfg.APIKey, tlsCfg)

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
	if tlsCfg != nil {
		c.ws.SetTLSConfig(tlsCfg)
	}
	c.ws.OnConnect(func(connected bool) {
		slog.Debug("websocket state changed", "connected", connected)
	})
	go c.ws.Connect(ctx, time.Duration(c.cfg.ReconnectDelay)*time.Second)

	llmInfo := c.llmType
	if llmInfo == LLMTypeNone {
		llmInfo = "no LLM detected"
	}
	slog.Info("connector running",
		"connector_id", c.connectorID,
		"os", runtime.GOOS,
		"arch", runtime.GOARCH,
		"llm", llmInfo,
	)

	<-ctx.Done()
	slog.Info("connector shutting down, draining active jobs")

	// drain active jobs with a timeout
	drainDone := make(chan struct{})
	go func() {
		c.jobWg.Wait()
		close(drainDone)
	}()
	select {
	case <-drainDone:
		slog.Info("all jobs completed")
	case <-time.After(30 * time.Second):
		slog.Warn("drain timeout, forcing shutdown")
	}

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
		slog.Debug("loaded existing connector id", "connector_id", c.connectorID)
		return nil
	}

	if !os.IsNotExist(err) {
		return err
	}

	c.connectorID = utils.GenerateID()
	if err := os.WriteFile(idPath, []byte(c.connectorID), 0600); err != nil {
		return fmt.Errorf("save connector id: %w", err)
	}

	slog.Info("generated new connector id", "connector_id", c.connectorID)
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

	slog.Info("registered with cloud platform")
	return nil
}

func (c *Connector) initLLM() {
	baseURL, llmType := DiscoverLLM(nil, c.cfg.OllamaURL)
	c.llmType = llmType

	switch llmType {
	case LLMTypeOllama:
		c.llm = NewOllamaClient(baseURL, c.cfg.MaxResponseSize)
		slog.Info("detected LLM", "type", LLMTypeOllama, "url", baseURL)
	case LLMTypeOpenAI:
		c.llm = NewOpenAIClient(baseURL, c.cfg.MaxResponseSize)
		slog.Info("detected LLM", "type", LLMTypeOpenAI, "url", baseURL)
	default:
		slog.Warn("no local LLM detected", "probed", c.cfg.OllamaURL)
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
		slog.Warn("list models", "error", err)
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

	slog.Info("advertised models to platform", "count", len(modelsList))
}

// --- health & metrics server ---

func (c *Connector) startHealthServer(ctx context.Context) {
	addr := fmt.Sprintf("127.0.0.1:%d", c.cfg.HealthPort)
	mux := http.NewServeMux()
	mux.HandleFunc("/health", c.healthHandler)
	mux.HandleFunc("/metrics", c.metricsHandler)

	c.healthServer = &http.Server{Addr: addr, Handler: mux}

	slog.Info("health server listening", "addr", addr)
	if err := c.healthServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("health server", "error", err)
	}
}

func (c *Connector) healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c.buildHealthPayload())
}

func (c *Connector) metricsHandler(w http.ResponseWriter, r *http.Request) {
	// update live gauges before rendering
	c.updateLiveGauges()

	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	metrics.Render(w)
}

func (c *Connector) updateLiveGauges() {
	if c.llmOnline.Load() {
		metricLLMOnline.Set(1)
	} else {
		metricLLMOnline.Set(0)
	}
	if c.ws != nil && c.ws.IsConnected() {
		metricWSConnected.Set(1)
	} else {
		metricWSConnected.Set(0)
	}
	metricActiveJobs.Set(int64(c.activeJobs.Load()))
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

	payload["llm"].(map[string]interface{})["models_count"] = c.cachedModelsCount.Load()

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
					slog.Warn("heartbeat: list models", "error", err)
				} else {
					modelsCount = len(available)
					c.cachedModelsCount.Store(int32(modelsCount))
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

		metricHeartbeats.Inc()
		if err := c.apiClient.Heartbeat(req); err != nil {
			slog.Warn("heartbeat failed", "error", err)
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
		slog.Warn("unknown ws message type", "type", msg.Type)
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
		slog.Warn("list_models: invalid payload", "error", err)
		return
	}

	modelsList, err := c.llm.ListModels()
	if err != nil {
		slog.Warn("list_models: llm error", "error", err)
		return
	}

	resp := models.WSModelsResponse{
		RequestID: req.RequestID,
		Models:    modelsList,
	}
	payload, _ := json.Marshal(resp)
	out := models.WSMessage{Type: "models_list", Payload: payload}

	if err := c.ws.SendMessage(out); err != nil {
		slog.Warn("list_models: send response", "error", err)
	}
}

func (c *Connector) handleRunBenchmark(msg models.WSMessage) {
	var req models.WSRunRequest
	if err := json.Unmarshal(msg.Payload, &req); err != nil {
		slog.Warn("run_benchmark: invalid payload", "error", err)
		return
	}

	metricJobsReceived.Inc()
	c.activeJobs.Add(1)
	c.jobWg.Add(1)

	go func() {
		defer c.jobWg.Done()
		defer c.activeJobs.Add(-1)

		slog.Info("running benchmark job",
			"job_id", req.Job.JobID,
			"model", req.Job.Model,
		)

		result := c.runner.Execute(req.Job)
		result.ConnectorID = c.connectorID

		uploadReq := models.UploadResultRequest{Result: result}
		if err := c.apiClient.UploadResult(uploadReq); err != nil {
			slog.Error("upload result",
				"job_id", req.Job.JobID,
				"error", err,
			)
			metricJobsFailed.Inc()
			return
		}

		metricJobsDone.Inc()
		slog.Info("uploaded result",
			"job_id", result.JobID,
			"latency_ms", result.LatencyMs,
			"tokens_in", result.TokensIn,
			"tokens_out", result.TokensOut,
		)
	}()
}
