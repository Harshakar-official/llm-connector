package services

import "github.com/llmconnector/connector/internal/models"

// LLMClient is implemented by any local LLM backend (Ollama, OpenAI-compatible, etc.).
type LLMClient interface {
	Name() string
	CheckAlive() bool
	ListModels() ([]models.ModelInfo, error)
	Generate(model, prompt string, opts map[string]interface{}) (*OllamaResult, error)
}

// Well-known LLM backend types.
const (
	LLMTypeOllama = "ollama"
	LLMTypeOpenAI = "openai"
	LLMTypeNone   = "none"
)
