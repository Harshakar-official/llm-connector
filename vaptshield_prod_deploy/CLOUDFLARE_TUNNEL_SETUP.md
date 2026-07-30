# Vapti Shield: Cloudflare Tunnel & Domain Setup Guide

This document explains the end-to-end architecture and step-by-step process for setting up Cloudflare Tunnels to connect Vapti Shield's main frontend (1st Laptop/Server) to the isolated workers (2nd Laptop/Server).

---

## Architecture Overview
Instead of exposing the isolated workers directly to the public internet (which is insecure), we use **Cloudflare Tunnels (`cloudflared`)**. 
The traffic flows like this:
`Frontend (.env URLs)` ➡️ `Cloudflare Edge (WAF & SSL)` ➡️ `Cloudflare Tunnel` ➡️ `2nd Laptop Local Ports (8085, 8084, 8082)`

---

## Step 1: Initial Domain Setup in Cloudflare
If you are moving to a completely new domain (e.g., `newdomain.com`):
1. Create/Log into a Cloudflare account.
2. Click **"Add a Site"** and enter the new domain.
3. Select the **Free Plan**.
4. Cloudflare will provide **2 Nameservers** (e.g., `amy.ns.cloudflare.com`).
5. Go to your domain registrar (e.g., GoDaddy, Wix) and replace the existing Nameservers with the ones Cloudflare provided.
6. Wait for the domain status to become **Active** in the Cloudflare dashboard.

---

## Step 2: Critical Cloudflare Rules (Do Not Skip!)
By default, Cloudflare blocks automated API requests and WebSockets (Error 1020/403). You MUST apply these settings on the new domain:

1. **SSL/TLS Configuration:**
   - Go to **SSL/TLS** -> **Overview**.
   - Set the encryption mode to **Full** (Do NOT use "Strict"). 
   - *Reason: Our local workers use `http://localhost`, so Strict mode will drop the connection.*

2. **Disable Bot Fight Mode:**
   - Go to **Security** -> **Bots**.
   - Ensure **Bot Fight Mode** is turned **OFF**.
   - *Reason: Vapti Shield uses automated scanners and Terminal WebSockets (`/tty`). Bot Fight Mode will falsely flag and block this traffic.*

---

## Step 3: Zero Trust Tunnel Setup
1. On the left menu, go to **Zero Trust** -> **Networks** -> **Tunnels**.
2. Click **Add a tunnel** -> Select **Cloudflared** -> Name it (e.g., `vaptshield_workers`).
3. Under the **"Install and run a connector"** section, copy the **Token string** (the long alphanumeric string after `--token`). Save this for Step 5.

---

## Step 4: Routing Subdomains to Worker Ports
In the Zero Trust Tunnel settings, go to the **Public Hostname** tab. Here is where we connect a public URL to a specific local port on the 2nd laptop.

Add the following rules based on where your workers are running:
* **ZAP Proxy:**
  - Subdomain: `zap` | Domain: `yourdomain.com` | Service: `http://localhost:8085`
* **Kali Terminal:**
  - Subdomain: `kali` | Domain: `yourdomain.com` | Service: `http://localhost:8084`
* **CICD Worker:**
  - Subdomain: `cicd` | Domain: `yourdomain.com` | Service: `http://localhost:8082`

*(Note: Adding these rules automatically creates the required DNS CNAME records for you).*

---

## Step 5: 2nd Laptop (Worker Server) Configuration
You must update the `cloudflared` background service with the new Token.
1. SSH into the 2nd laptop.
2. Edit the systemd service file:
   ```bash
   sudo nano /etc/systemd/system/cloudflared.service
   ```
3. Find the `ExecStart` line and replace the old token with your new token. Also, ensure the `--protocol http2` flag is present to prevent WebSocket connection drops:
   ```ini
   ExecStart=/usr/bin/cloudflared --no-autoupdate tunnel run --protocol http2 --token YOUR_NEW_TOKEN_HERE
   ```
4. Reload and restart the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart cloudflared
   sudo systemctl status cloudflared
   ```

---

## Step 6: 1st Laptop (Frontend) Configuration
Now that the tunnel is running, tell the frontend codebase to use the new URLs.
1. Open your Vapti Shield codebase (e.g., `/home/prangan/vaptshield`).
2. Open the **`.env.local`** (or `.env`) file.
3. Replace all instances of the old domain URLs with the new ones. For example:
   ```env
   DOCKER_HOST_API_URL=https://kali.yourdomain.com
   NEXT_PUBLIC_WORKER_WS_URL=wss://kali.yourdomain.com
   WORKER_PUBLIC_URL=wss://kali.yourdomain.com
   ZAP_WORKER_URL="https://zap.yourdomain.com"
   CICD_WORKER_URL="https://cicd.yourdomain.com"
   ```
4. Restart your frontend server (`npm run dev`).

**Done! The entire pipeline is now successfully migrated to the new domain.**
