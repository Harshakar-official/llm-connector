import asyncio
from typing import Optional
from dataclasses import dataclass, field

from probes.base import ProbeResult, ScanResult
from probes.llm.prompt_injection import PromptInjectionProbe
from probes.llm.jailbreak import JailbreakProbe
from probes.llm.pii_leak import PIILeakProbe
from probes.llm.hallucination import HallucinationProbe
from probes.llm.toxicity import ToxicityProbe
from probes.llm.encoding_attacks import EncodingAttackProbe
from probes.llm.insecure_output import InsecureOutputProbe
from probes.llm.excessive_agency import ExcessiveAgencyProbe
from probes.llm.model_theft import ModelTheftProbe
from probes.agent.tool_hijack import ToolHijackProbe
from probes.agent.mcp_exploit import MCPExploitProbe
from probes.agent.autonomy_abuse import AutonomyAbuseProbe
from probes.agent.sandbox_escape import SandboxEscapeProbe
from probes.agent.memory_poison import MemoryPoisonProbe
from llm.gateway import LLMClient


LLM_PROBES = [
    PromptInjectionProbe,
    JailbreakProbe,
    PIILeakProbe,
    HallucinationProbe,
    ToxicityProbe,
    EncodingAttackProbe,
    InsecureOutputProbe,
    ExcessiveAgencyProbe,
    ModelTheftProbe,
]

AGENT_PROBES = [
    ToolHijackProbe,
    MCPExploitProbe,
    AutonomyAbuseProbe,
    SandboxEscapeProbe,
    MemoryPoisonProbe,
]


class ScanOrchestrator:
    def __init__(self, scan_id: str, target_url: str, scan_mode: str = "full", target_api_key: str = ""):
        self.scan_id = scan_id
        self.target_url = target_url
        self.scan_mode = scan_mode
        self.llm_client = LLMClient(target_api_key=target_api_key)
        self._cancelled = False
        self._progress_callback: Optional[callable] = None
        self.probes_completed = 0
        self.vulnerabilities_found = 0
        self.total_probes = 0

    def set_progress_callback(self, callback: callable):
        self._progress_callback = callback

    def cancel(self):
        self._cancelled = True

    def _get_probes(self):
        probes = []
        if self.scan_mode in ("llm_only", "full"):
            probes.extend(LLM_PROBES)
        if self.scan_mode in ("agent_only", "full"):
            probes.extend(AGENT_PROBES)
        return probes

    async def run(self) -> ScanResult:
        probes_to_run = self._get_probes()
        self.total_probes = len(probes_to_run)
        result = ScanResult(
            scan_id=self.scan_id,
            status="running",
            total_probes=self.total_probes,
        )

        semaphore = asyncio.Semaphore(5)

        async def run_single(probe_cls):
            if self._cancelled:
                return []
            async with semaphore:
                probe = probe_cls()
                findings = await probe.run(self.target_url, self.llm_client)
                self.probes_completed += 1
                result.probes_completed = self.probes_completed
                vulns = [f for f in findings if f.vulnerable]
                self.vulnerabilities_found += len(vulns)
                result.vulnerabilities_found = self.vulnerabilities_found
                result.findings.extend(vulns)
                return findings

        tasks = [run_single(p) for p in probes_to_run]
        await asyncio.gather(*tasks)

        result.status = "cancelled" if self._cancelled else "completed"
        result.summary = self._build_summary(result)
        return result

    def _build_summary(self, result: ScanResult) -> dict:
        by_severity = {"critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0}
        by_category = {}
        for f in result.findings:
            if f.vulnerable:
                by_severity[f.severity.value] = by_severity.get(f.severity.value, 0) + 1
                cat = f.owasp_category.value
                by_category[cat] = by_category.get(cat, 0) + 1

        return {
            "total_probes": result.total_probes,
            "probes_completed": result.probes_completed,
            "vulnerabilities_found": result.vulnerabilities_found,
            "by_severity": by_severity,
            "by_owasp_category": by_category,
            "scan_mode": self.scan_mode,
        }
