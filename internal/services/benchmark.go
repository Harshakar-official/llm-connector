package services

import (
	"fmt"

	"github.com/llmconnector/connector/internal/models"
)

// BenchmarkRunner executes benchmark jobs against a local LLM.
type BenchmarkRunner struct {
	llm LLMClient
}

// NewBenchmarkRunner creates a runner that uses the given LLM client.
func NewBenchmarkRunner(llm LLMClient) *BenchmarkRunner {
	return &BenchmarkRunner{llm: llm}
}

// Execute runs a single benchmark job and returns the result.
func (r *BenchmarkRunner) Execute(job models.BenchmarkJob) models.BenchmarkResult {
	result := models.BenchmarkResult{
		JobID:  job.JobID,
		Model:  job.Model,
		Prompt: job.Prompt,
	}

	ollamaResult, err := r.llm.Generate(job.Model, job.Prompt, job.Options)
	if err != nil {
		result.Error = fmt.Sprintf("generation failed: %v", err)
		return result
	}

	result.Response = ollamaResult.Response
	result.LatencyMs = ollamaResult.LatencyMs
	result.TokensIn = ollamaResult.TokensIn
	result.TokensOut = ollamaResult.TokensOut

	return result
}
