#!/bin/bash
EMAIL="admin@example.com"
KEY="cfk_placeholder"
ZONE_ID="placeholder_zone_id"
ACCOUNT_ID="placeholder_account_id"
TUNNEL_ID="placeholder_tunnel_id"

echo "Updating Tunnel Routing for 3 distinct tools..."
curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel/${TUNNEL_ID}/configurations" \
  -H "X-Auth-Email: ${EMAIL}" -H "X-Auth-Key: ${KEY}" -H "Content-Type: application/json" \
  -d '{
    "config": {
      "ingress": [
        {"hostname": "zap.secprima.in", "service": "http://localhost:8085"},
        {"hostname": "cicd.secprima.in", "service": "http://localhost:8086"},
        {"hostname": "kali.secprima.in", "service": "http://localhost:8087"},
        {"service": "http_status:404"}
      ]
    }
  }'

echo -e "\n\nCreating CNAME for zap..."
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "X-Auth-Email: ${EMAIL}" -H "X-Auth-Key: ${KEY}" -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"zap","content":"'"${TUNNEL_ID}"'.cfargotunnel.com","proxied":true}'

echo -e "\n\nCreating CNAME for cicd..."
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "X-Auth-Email: ${EMAIL}" -H "X-Auth-Key: ${KEY}" -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"cicd","content":"'"${TUNNEL_ID}"'.cfargotunnel.com","proxied":true}'

echo -e "\n\nCreating CNAME for kali..."
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "X-Auth-Email: ${EMAIL}" -H "X-Auth-Key: ${KEY}" -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"kali","content":"'"${TUNNEL_ID}"'.cfargotunnel.com","proxied":true}'
