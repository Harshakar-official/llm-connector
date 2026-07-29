package config

import (
	"encoding/json"
	"fmt"
	"os"
)

// Config holds all configuration for the connector.
type Config struct {
	APIKey            string `json:"api_key"`
	ServerURL         string `json:"server_url"`
	OllamaURL         string `json:"ollama_url"`
	HeartbeatInterval int    `json:"heartbeat_interval"`
	ReconnectDelay    int    `json:"reconnect_delay"`
	DataDir           string `json:"data_dir"`
	HealthPort        int    `json:"health_port"`
}

// Default returns a Config populated with sensible defaults.
func Default() *Config {
	return &Config{
		ServerURL:         "https://api.llmconnector.example.com",
		OllamaURL:         "http://localhost:11434",
		HeartbeatInterval: 30,
		ReconnectDelay:    5,
		DataDir:           "./data",
		HealthPort:        9199,
	}
}

// Load reads configuration from a JSON file and overlays environment
// variables. Environment variables take precedence.
func Load(path string) (*Config, error) {
	cfg := Default()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, fmt.Errorf("read config file: %w", err)
	}

	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parse config file: %w", err)
	}

	if v := os.Getenv("LLM_CONNECTOR_API_KEY"); v != "" {
		cfg.APIKey = v
	}
	if v := os.Getenv("LLM_CONNECTOR_SERVER_URL"); v != "" {
		cfg.ServerURL = v
	}
	if v := os.Getenv("LLM_CONNECTOR_OLLAMA_URL"); v != "" {
		cfg.OllamaURL = v
	}

	return cfg, nil
}
