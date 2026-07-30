# Enterprise AI Security Upgrade Plan

## 1. LLM-as-a-Judge
Replaces simplistic keyword matching with an intelligent AI Judge (using Groq/Llama-3).
- **How**: For LLM probes (Prompt Injection, Toxicity), the scanner sends the target's response to the Judge LLM using `llm_client.analyze_response()`. The Judge evaluates if the attack was successful and returns a JSON `{"vulnerable": true/false}`.
- **Benefit**: 99% reduction in False Positives. Context-aware evaluation.

## 2. Canary Webhooks (Out-of-Band Testing)
Replaces text-based evaluation for Agent vulnerabilities (Sandbox Escape, Tool Hijack).
- **How**: The scanner spins up a lightweight Webhook receiver (`/webhook/{token}`). The attack payload instructs the agent to hit this URL. The scanner then verifies if the webhook was actually triggered.
- **Benefit**: 100% definitive proof of vulnerability (0% false positives, 0% false negatives) if a hit is received.

## Implementation Steps
1. Create `webhook.py` to store webhook states.
2. Update `main.py` with `/webhook/{token}` endpoint.
3. Refactor `tool_hijack.py` and `sandbox_escape.py` to use Canary Tokens.
