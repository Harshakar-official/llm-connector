package config

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strconv"
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
	LogFormat         string `json:"log_format"`
	LogLevel          string `json:"log_level"`
	TLSInsecure       bool   `json:"tls_insecure"`
	CACertPath        string `json:"ca_cert_path"`
	MaxResponseSize   int    `json:"max_response_size"`
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
		LogFormat:         "text",
		LogLevel:          "info",
		TLSInsecure:       false,
		CACertPath:        "",
		MaxResponseSize:   0, // 0 = unlimited
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
	if v := os.Getenv("LLM_CONNECTOR_LOG_FORMAT"); v != "" {
		cfg.LogFormat = v
	}
	if v := os.Getenv("LLM_CONNECTOR_LOG_LEVEL"); v != "" {
		cfg.LogLevel = v
	}
	if v := os.Getenv("LLM_CONNECTOR_TLS_INSECURE"); v != "" {
		cfg.TLSInsecure, _ = strconv.ParseBool(v)
	}
	if v := os.Getenv("LLM_CONNECTOR_MAX_RESPONSE_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.MaxResponseSize = n
		}
	}

	return cfg, nil
}

// Validate checks the configuration for obvious errors and returns all
// problems found. Returns nil when the config is usable.
func (cfg *Config) Validate() []error {
	var errs []error

	if cfg.APIKey == "" {
		errs = append(errs, fmt.Errorf("api_key is required — set in config.json or LLM_CONNECTOR_API_KEY env var"))
	}

	if cfg.ServerURL != "" {
		if _, err := url.Parse(cfg.ServerURL); err != nil {
			errs = append(errs, fmt.Errorf("server_url: %w", err))
		}
	} else {
		errs = append(errs, fmt.Errorf("server_url is required"))
	}

	if cfg.OllamaURL != "" {
		if _, err := url.Parse(cfg.OllamaURL); err != nil {
			errs = append(errs, fmt.Errorf("ollama_url: %w", err))
		}
	}

	if cfg.HeartbeatInterval < 5 {
		errs = append(errs, fmt.Errorf("heartbeat_interval must be >= 5 seconds"))
	}
	if cfg.ReconnectDelay < 1 {
		errs = append(errs, fmt.Errorf("reconnect_delay must be >= 1 second"))
	}
	if cfg.HealthPort < 1 || cfg.HealthPort > 65535 {
		errs = append(errs, fmt.Errorf("health_port must be between 1 and 65535"))
	}
	switch cfg.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		errs = append(errs, fmt.Errorf("log_level must be one of: debug, info, warn, error"))
	}
	switch cfg.LogFormat {
	case "text", "json":
	default:
		errs = append(errs, fmt.Errorf("log_format must be 'text' or 'json'"))
	}

	if cfg.CACertPath != "" {
		if _, err := os.Stat(cfg.CACertPath); err != nil {
			errs = append(errs, fmt.Errorf("ca_cert_path: %w", err))
		}
	}

	return errs
}

// TLSConfig builds a *tls.Config from the CA cert path and insecure flag.
// Returns nil when no custom TLS is needed.
func (cfg *Config) TLSConfig() (*tls.Config, error) {
	if !cfg.TLSInsecure && cfg.CACertPath == "" {
		return nil, nil
	}

	tc := &tls.Config{
		InsecureSkipVerify: cfg.TLSInsecure,
	}

	if cfg.CACertPath != "" {
		caCert, err := os.ReadFile(cfg.CACertPath)
		if err != nil {
			return nil, fmt.Errorf("read CA cert: %w", err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(caCert) {
			return nil, fmt.Errorf("no valid CA certificate found in %s", cfg.CACertPath)
		}
		tc.RootCAs = pool
	}

	return tc, nil
}
