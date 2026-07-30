#!/bin/bash
EMAIL="admin@example.com"
KEY="cfk_placeholder"
ZONE_ID="placeholder_zone_id"
ACCOUNT_ID="placeholder_account_id"

echo "Setting SSL to Full..."
curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/settings/ssl" \
  -H "X-Auth-Email: ${EMAIL}" -H "X-Auth-Key: ${KEY}" -H "Content-Type: application/json" \
  -d '{"value":"full"}'

echo -e "\nSetting Security Level to essentially_off..."
curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/settings/security_level" \
  -H "X-Auth-Email: ${EMAIL}" -H "X-Auth-Key: ${KEY}" -H "Content-Type: application/json" \
  -d '{"value":"essentially_off"}'

echo -e "\nGenerating Tunnel Secret..."
SECRET_STR=$(openssl rand -base64 32)
# Create tunnel
echo -e "\nCreating Tunnel..."
TUNNEL_RES=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel" \
  -H "X-Auth-Email: ${EMAIL}" -H "X-Auth-Key: ${KEY}" -H "Content-Type: application/json" \
  -d '{"name":"vaptshield_tunnel_1","tunnel_secret":"'"${SECRET_STR}"'"}')

TUNNEL_ID=$(echo $TUNNEL_RES | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "Tunnel ID: $TUNNEL_ID"

echo -e "\nConfiguring Tunnel Routing..."
curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel/${TUNNEL_ID}/configurations" \
  -H "X-Auth-Email: ${EMAIL}" -H "X-Auth-Key: ${KEY}" -H "Content-Type: application/json" \
  -d '{
    "config": {
      "ingress": [
        {"hostname": "api.secprima.in", "service": "http://localhost:8084"},
        {"service": "http_status:404"}
      ]
    }
  }'

echo -e "\nCreating DNS CNAME..."
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "X-Auth-Email: ${EMAIL}" -H "X-Auth-Key: ${KEY}" -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"api","content":"'"${TUNNEL_ID}"'.cfargotunnel.com","proxied":true}'

# Generate Token
PAYLOAD="{\"a\":\"${ACCOUNT_ID}\",\"t\":\"${TUNNEL_ID}\",\"s\":\"${SECRET_STR}\"}"
TOKEN=$(echo -n "$PAYLOAD" | base64 -w 0)
echo -e "\n\nGenerated Zero Trust Token: $TOKEN"
