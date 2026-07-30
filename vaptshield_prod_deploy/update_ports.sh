#!/bin/bash
EMAIL="admin@example.com"
KEY="cfk_placeholder"
ACCOUNT_ID="placeholder_account_id"
TUNNEL_ID="placeholder_tunnel_id"

echo "Correcting Tunnel Routing Ports..."
curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel/${TUNNEL_ID}/configurations" \
  -H "X-Auth-Email: ${EMAIL}" -H "X-Auth-Key: ${KEY}" -H "Content-Type: application/json" \
  -d '{
    "config": {
      "ingress": [
        {"hostname": "zap.secprima.in", "service": "http://localhost:8085"},
        {"hostname": "cicd.secprima.in", "service": "http://localhost:8082"},
        {"hostname": "kali.secprima.in", "service": "http://localhost:8084"},
        {"service": "http_status:404"}
      ]
    }
  }'
