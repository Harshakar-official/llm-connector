import time

# A simple in-memory store for webhook hits.
# Keys are tokens (UUIDs), values are timestamps.
_webhook_hits: dict[str, float] = {}

def record_hit(token: str):
    _webhook_hits[token] = time.time()

def check_hit(token: str) -> bool:
    return token in _webhook_hits
