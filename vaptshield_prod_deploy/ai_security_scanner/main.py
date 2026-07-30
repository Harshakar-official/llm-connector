from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from dotenv import load_dotenv
import os, re, time, hmac

from orchestrator import ScanOrchestrator
import webhook

load_dotenv()

app = FastAPI(title="VAPTShield AI Security Scanner", version="1.0.0")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,https://vaptshield.secprima.in").split(",")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["GET","POST"], allow_headers=["Authorization","Content-Type"], max_age=3600)

WORKER_KEY = os.getenv("DOCKER_HOST_API_KEY", "")
_rate_limits: dict[str, list[float]] = {}

def _check_rate(ip: str) -> bool:
    now = time.time()
    _rate_limits.setdefault(ip, [])
    _rate_limits[ip] = [t for t in _rate_limits[ip] if now - t < 60]
    if len(_rate_limits[ip]) >= 30: return False
    _rate_limits[ip].append(now)
    return True

@app.middleware("http")
async def security(request: Request, call_next):
    if request.url.path == "/health": return await call_next(request)
    auth = request.headers.get("Authorization","")
    if not auth or not hmac.compare_digest(auth, f"Bearer {WORKER_KEY}"):
        return JSONResponse({"error":"Unauthorized"}, 401)
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    if not _check_rate(ip): return JSONResponse({"error":"Rate limit"}, 429)
    if request.method in ("POST","PUT"):
        body = await request.body()
        if len(body) > 50_000: return JSONResponse({"error":"Body too large"}, 413)
    return await call_next(request)

URL_RE = re.compile(r'^https?://[^\s/$.?#].[^\s]*$', re.I)
BLOCKED = re.compile(r'(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|fc00:|fd00:|fe80:|169\.254|metadata\.google)', re.I)

_active: dict[str, ScanOrchestrator] = {}
_results: dict[str, dict] = {}

class ScanRequest(BaseModel):
    scan_id: str
    target_url: str
    target_api_key: str = ""
    scan_mode: str = "full"

    @field_validator("scan_id")
    @classmethod
    def vid(cls, v): 
        if not re.match(r'^[a-f0-9-]{36}$', v): raise ValueError("bad id")
        return v
    @field_validator("target_url")
    @classmethod
    def vurl(cls, v):
        if not URL_RE.match(v): raise ValueError("bad url")
        return v[:2000]
    @field_validator("scan_mode")
    @classmethod
    def vmode(cls, v):
        if v not in ("llm_only","agent_only","full"): raise ValueError("bad mode")
        return v

@app.get("/health")
async def health(): return {"status":"ok","service":"ai-security-scanner"}

@app.post("/scan/start")
async def start(req: ScanRequest, bg: BackgroundTasks):
    if req.scan_id in _active: raise HTTPException(409, "already running")
    orch = ScanOrchestrator(req.scan_id, req.target_url, req.scan_mode, target_api_key=req.target_api_key)
    _active[req.scan_id] = orch
    async def run():
        try:
            result = await orch.run()
            _results[req.scan_id] = {
                "status": result.status, "total_probes": result.total_probes,
                "probes_completed": result.probes_completed, "vulnerabilities_found": result.vulnerabilities_found,
                "findings": [{"probe_name":f.probe_name,"category":f.category,"owasp_category":f.owasp_category.value,
                "payload":f.payload[:500],"response":f.response[:1000],"vulnerable":f.vulnerable,
                "severity":f.severity.value,"evidence":f.evidence[:500],"description":f.description,"remediation":f.remediation} for f in result.findings],
                "summary": result.summary
            }
        except Exception as e:
            _results[req.scan_id] = {"status":"failed","error":str(e)[:500]}
        finally:
            _active.pop(req.scan_id, None)
    bg.add_task(run)
    return {"success":True,"scan_id":req.scan_id}

@app.get("/scan/status/{scan_id}")
async def status(scan_id: str):
    if not re.match(r'^[a-f0-9-]{36}$', scan_id): raise HTTPException(400)
    o = _active.get(scan_id)
    if o: return {"scan_id":scan_id,"status":"running","total_probes":o.total_probes,"probes_completed":o.probes_completed,"vulnerabilities_found":o.vulnerabilities_found}
    r = _results.get(scan_id)
    if r: return {"scan_id":scan_id,**r}
    return {"scan_id":scan_id,"status":"unknown"}

@app.get("/scan/results/{scan_id}")
async def results(scan_id: str):
    if not re.match(r'^[a-f0-9-]{36}$', scan_id): raise HTTPException(400)
    r = _results.get(scan_id)
    if r: return {"scan_id":scan_id,**r}
    raise HTTPException(404, "not found")

@app.post("/scan/cancel/{scan_id}")
async def cancel(scan_id: str):
    if not re.match(r'^[a-f0-9-]{36}$', scan_id): raise HTTPException(400)
    o = _active.get(scan_id)
    if not o: raise HTTPException(404)
    o.cancel()
    return {"success":True}

@app.get("/webhook/{token}")
@app.post("/webhook/{token}")
async def webhook_receiver(token: str):
    webhook.record_hit(token)
    return {"success": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("SCANNER_PORT","8090")))
