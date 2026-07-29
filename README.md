# LLM Connector

A lightweight background agent that bridges local LLMs (Ollama, vLLM, TGI,
llama.cpp, LM Studio, or any OpenAI-compatible server) to your cloud testing
platform. Uses **outbound-only HTTPS and WebSocket** — no VPN, no port
forwarding, no inbound firewall rules.

## How it works

```
┌─────────────────┐      HTTPS / WSS       ┌──────────────────┐
│  Local Machine   │ ◄────────────────────► │  Cloud Platform  │
│                  │                        │                  │
│  ┌────────────┐  │   Register             │  ┌────────────┐ │
│  │  Connector  │──┤──────────────────────▶│  │   API      │ │
│  │  (this app) │  │   Heartbeat           │  └────────────┘ │
│  └──────┬─────┘  │──────────────────────▶│                  │
│         │        │   Upload Results      │  ┌────────────┐ │
│         │        │──────────────────────▶│  │  WebSocket │ │
│         │        │   Receive Jobs        │  └────────────┘ │
│         │        │◄──────────────────────│                  │
│  ┌──────┴─────┐  │                        └──────────────────┘
│  │  LLM       │  │
│  │ (Ollama /  │  │   Auto-detected: common ports + types
│  │  OpenAI    │  │
│  │  compat)   │  │
│  └────────────┘  │
└─────────────────┘
```

## Features

- **Secure** — outbound-only connections; no model weights or files ever leave your machine.
- **Auto-reconnect** — reconnects with backoff if the connection drops.
- **Heartbeat** — sends liveness signal every 30s with LLM status.
- **Auto-discovery** — detects Ollama and OpenAI-compatible servers (vLLM, TGI, llama.cpp server, LM Studio) by probing common ports.
- **Multi-backend** — supports Ollama natively and any OpenAI-compatible API.
- **Result retry** — retries failed uploads up to 3 times with backoff.
- **Cross-platform** — runs on Windows, Linux, and macOS.
- **Background service** — designed to run as a daemon / system service.

## Quick start

1. Clone or download the repository.
2. Copy `config.json` and set your API key:

    ```json
    {
        "api_key": "your-api-key-here",
        "server_url": "https://your-platform.example.com",
        "ollama_url": "http://localhost:11434",
        "heartbeat_interval": 30,
        "reconnect_delay": 5,
        "data_dir": "/opt/llm-connector/data"
    }
    ```

   The `ollama_url` is the **preferred address** to probe first. If the LLM
   runs elsewhere, the connector auto-discovers it by checking common ports
   (11434, 8080, 8000, 5000) for both Ollama and OpenAI-compatible APIs.

3. Build and run:

   ```bash
   go build -o connector ./cmd/connector
   ./connector
   ```

   Or set the API key via environment variable:

   ```bash
   LLM_CONNECTOR_API_KEY=your-key ./connector
   ```

## Configuration

| Field | Env Variable | Default | Description |
|---|---|---|---|---|
| `api_key` | `LLM_CONNECTOR_API_KEY` | — | API key for the cloud platform |
| `server_url` | `LLM_CONNECTOR_SERVER_URL` | `https://api.llmconnector.example.com` | Cloud platform base URL |
| `ollama_url` | `LLM_CONNECTOR_OLLAMA_URL` | `http://localhost:11434` | Preferred LLM address (auto-discovery falls back to common ports) |
| `heartbeat_interval` | — | `30` | Seconds between heartbeats |
| `reconnect_delay` | — | `5` | Seconds between reconnect attempts |
| `health_port` | — | `9199` | Local HTTP port for health endpoint (localhost only) |
| `data_dir` | — | `/opt/llm-connector/data` | Directory for persistent data (connector ID) |

## Docker

```bash
LLM_CONNECTOR_API_KEY=your-key docker compose up -d
```

## Project structure

```
cmd/connector/         Entry point
internal/
  api/                 REST API client (register, heartbeat, upload)
  config/              Configuration loader
  models/              Shared data types
  services/
    connector.go       Main orchestrator
    llm.go             LLM client interface
    discovery.go       Auto-detect LLM backend (Ollama / OpenAI)
    ollama.go          Ollama backend adapter
    openai.go          OpenAI-compatible backend adapter
    benchmark.go       Benchmark job runner
  utils/               Helper functions (ID generation)
  websocket/           WebSocket client with auto-reconnect
deploy/
  install.sh           One-command install + service setup
  llm-connector.service      systemd unit
  com.llmconnector.connector.plist   launchd plist
```

## Cloud API endpoints

The connector communicates with these endpoints on the cloud platform:

### REST (HTTPS)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | Platform health check (connector probes this) |
| POST | `/api/v1/connectors/register` | Register a new connector |
| POST | `/api/v1/connectors/heartbeat` | Send liveness signal (includes `llm_type`, `llm_status`, `active_jobs`) |
| POST | `/api/v1/connectors/results` | Upload benchmark results |

### WebSocket

| Path | Description |
|---|---|
| `/ws?connector_id=<id>` | Bidirectional job channel |

#### Server → Connector messages

```json
{"type":"list_models","payload":{"request_id":"..."}}
{"type":"run_benchmark","payload":{"job":{"job_id":"...","model":"llama3","prompt":"...","options":{}}}}
{"type":"health_check","payload":{}}
```

#### Connector → Server messages

```json
{"type":"models_list","payload":{"request_id":"...","models":[...]}}
{"type":"health_status","payload":{"status":"ok","llm":{"type":"ollama","status":"connected","models_count":5},"platform":{"reachable":true},"websocket":{"connected":true},"active_jobs":0}}
```

### Local health endpoint

The connector exposes a health endpoint on `localhost:9199/health` (configurable via
`health_port`). This is only bound to `127.0.0.1` — never exposed to the network.

```bash
curl http://localhost:9199/health
```

Example response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "connector_id": "abc-123",
  "uptime": "5m30s",
  "started_at": "2025-01-01T00:00:00Z",
  "llm": {
    "type": "ollama",
    "status": "connected",
    "models_count": 5
  },
  "platform": {
    "reachable": true,
    "status": "reachable",
    "last_heartbeat_ok": true,
    "last_heartbeat": "2025-01-01T00:00:30Z"
  },
  "websocket": {
    "connected": true,
    "status": "connected"
  },
  "active_jobs": 0
}
```

## Security

- No model weights or private files are uploaded.
- All communication is over TLS (HTTPS / WSS).
- Authentication via Bearer token (API key).
- The connector only makes outbound connections.
