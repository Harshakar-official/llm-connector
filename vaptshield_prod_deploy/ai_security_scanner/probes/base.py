from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFORMATIONAL = "informational"


class OwaspLLMCategory(str, Enum):
    LLM01 = "LLM01: Prompt Injection"
    LLM02 = "LLM02: Insecure Output Handling"
    LLM03 = "LLM03: Training Data Poisoning"
    LLM04 = "LLM04: Model Denial of Service"
    LLM05 = "LLM05: Supply Chain Vulnerabilities"
    LLM06 = "LLM06: Sensitive Information Disclosure"
    LLM07 = "LLM07: Insecure Plugin Design"
    LLM08 = "LLM08: Excessive Agency"
    LLM09 = "LLM09: Overreliance"
    LLM10 = "LLM10: Model Theft"


@dataclass
class ProbeResult:
    probe_name: str
    category: str
    owasp_category: OwaspLLMCategory
    payload: str
    response: str
    vulnerable: bool
    severity: Severity
    evidence: str = ""
    description: str = ""
    remediation: str = ""


@dataclass
class ScanResult:
    scan_id: str
    status: str
    total_probes: int = 0
    probes_completed: int = 0
    vulnerabilities_found: int = 0
    findings: list[ProbeResult] = field(default_factory=list)
    summary: dict = field(default_factory=dict)


class BaseProbe(ABC):
    category: str = "base"
    owasp_category: OwaspLLMCategory = OwaspLLMCategory.LLM01
    name: str = "base_probe"
    severity: Severity = Severity.MEDIUM
    description: str = ""
    remediation: str = ""

    @abstractmethod
    async def run(self, target_url: str, llm_client) -> list[ProbeResult]:
        ...

    def _build_result(
        self,
        payload: str,
        response: str,
        vulnerable: bool,
        evidence: str = "",
    ) -> ProbeResult:
        return ProbeResult(
            probe_name=self.name,
            category=self.category,
            owasp_category=self.owasp_category,
            payload=payload,
            response=response[:2000],
            vulnerable=vulnerable,
            severity=self.severity,
            evidence=evidence[:1000],
            description=self.description,
            remediation=self.remediation,
        )
