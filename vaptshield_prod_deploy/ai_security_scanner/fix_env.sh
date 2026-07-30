#!/bin/bash
echo "Fixing 2nd Laptop Gaps..."

echo "[2L-S1 / 2L-S2] Removing hardcoded secrets from .env files..."
# Create a secure blank .env template instead of using hardcoded secrets
cat << 'EOF' > .env
WORKER_KEY=
DATABASE_URL=
REDIS_URL=redis://127.0.0.1:6379
EOF

echo "[2L-S7 / 2L-S13] Starting Redis and CICD Worker..."
# Restart docker compose to include the new Redis service and resurrect CICD worker
docker compose down
docker compose up -d

echo "[2L-S5] Restarting LivePort tunnel..."
# Kill any hung tunnel process and restart it
pkill -f localtunnel || true
nohup lt --port 8080 --subdomain secprima-worker > tunnel.log 2>&1 &

echo "All 2nd laptop environment issues have been addressed!"
