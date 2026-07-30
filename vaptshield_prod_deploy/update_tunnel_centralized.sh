#!/bin/bash
EMAIL="admin@example.com"
KEY="cfk_placeholder"
ACCOUNT_ID="placeholder_account_id"
TUNNEL_ID="placeholder_tunnel_id"

echo "Updating Tunnel Routing to Centralized System (Port 8080)..."
curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel/${TUNNEL_ID}/configurations" \
  -H "X-Auth-Email: ${EMAIL}" -H "X-Auth-Key: ${KEY}" -H "Content-Type: application/json" \
  -d '{
    "config": {
      "ingress": [
        {"hostname": "zap.secprima.in", "service": "http://localhost:8080"},
        {"hostname": "cicd.secprima.in", "service": "http://localhost:8080"},
        {"hostname": "kali.secprima.in", "service": "http://localhost:8080"},
        {"service": "http_status:404"}
      ]
    }
  }'
