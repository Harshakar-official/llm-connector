#!/usr/bin/env bash
# LLM Connector — single-command install for Linux & macOS
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Harshakar-official/llm-connector/main/bootstrap.sh | bash -s -- --api-key=YOUR_KEY --server-url=https://your-platform.com

set -euo pipefail

REPO="Harshakar-official/llm-connector"
VERSION="v1.0.0"

# --- parse args ---
API_KEY=""
SERVER_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-key)     API_KEY="$2";     shift 2 ;;
    --server-url)  SERVER_URL="$2";  shift 2 ;;
    --version)     VERSION="$2";     shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

if [[ -z "$API_KEY" ]]; then
  echo "Error: --api-key is required"
  echo "Usage: curl -fsSL https://raw.githubusercontent.com/$REPO/main/bootstrap.sh | bash -s -- --api-key=YOUR_KEY --server-url=https://your-platform.com"
  exit 1
fi
if [[ -z "$SERVER_URL" ]]; then
  echo "Error: --server-url is required"
  exit 1
fi

# --- detect OS + arch ---
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

case "$OS" in
  linux)  BINARY="connector-linux-${ARCH}" ;;
  darwin) BINARY="connector-darwin-${ARCH}" ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/$BINARY"
INSTALL_DIR="/opt/llm-connector"
BIN_PATH="$INSTALL_DIR/connector"
CONFIG_PATH="$INSTALL_DIR/config.json"

echo "==> LLM Connector bootstrap $VERSION"
echo "    OS:    $OS / $ARCH"
echo "    URL:   $SERVER_URL"
echo ""

# --- install dir ---
sudo mkdir -p "$INSTALL_DIR/data"

# --- download binary ---
echo "==> Downloading $BINARY..."
sudo curl -fsSL -o "$BIN_PATH" "$DOWNLOAD_URL"
sudo chmod 755 "$BIN_PATH"

# --- write config ---
echo "==> Writing config..."
sudo tee "$CONFIG_PATH" > /dev/null <<CONFIG
{
    "api_key": "$API_KEY",
    "server_url": "$SERVER_URL",
    "ollama_url": "http://localhost:11434",
    "heartbeat_interval": 30,
    "reconnect_delay": 5,
    "health_port": 9199,
    "scan_ports": "11434,8080,8000,5000,3000",
    "data_dir": "$INSTALL_DIR/data"
}
CONFIG
sudo chmod 600 "$CONFIG_PATH"

# --- install service ---
if [[ "$OS" == "linux" ]]; then
  echo "==> Installing systemd service..."
  sudo tee /etc/systemd/system/llm-connector.service > /dev/null <<SVC
[Unit]
Description=LLM Connector – local LLM bridge to cloud testing platform
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$BIN_PATH $CONFIG_PATH
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SVC
  sudo systemctl daemon-reload
  sudo systemctl enable llm-connector
  sudo systemctl start llm-connector
  echo "==> Service started: sudo systemctl status llm-connector"

elif [[ "$OS" == "darwin" ]]; then
  echo "==> Installing launchd service..."
  sudo tee /Library/LaunchDaemons/com.llmconnector.connector.plist > /dev/null <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.llmconnector.connector</string>
    <key>ProgramArguments</key>
    <array>
        <string>$BIN_PATH</string>
        <string>$CONFIG_PATH</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$INSTALL_DIR/connector.log</string>
    <key>StandardErrorPath</key>
    <string>$INSTALL_DIR/connector.log</string>
</dict>
</plist>
PLIST
  sudo launchctl load /Library/LaunchDaemons/com.llmconnector.connector.plist
  echo "==> Service loaded: tail -f $INSTALL_DIR/connector.log"
fi

# --- verify ---
sleep 2
echo ""
echo "==> Checking health..."
if curl -sf http://127.0.0.1:9199/health > /dev/null 2>&1; then
  echo "    ✓ Connector is running!"
  curl -s http://127.0.0.1:9199/health | python3 -m json.tool 2>/dev/null || curl -s http://127.0.0.1:9199/health
else
  echo "    ⚠ Health endpoint not responding yet. Check logs:"
  echo "       sudo journalctl -u llm-connector -f  (Linux)"
  echo "       tail -f $INSTALL_DIR/connector.log    (macOS)"
fi

echo ""
echo "==> Done. Connector installed at $INSTALL_DIR"
echo "    Health: http://127.0.0.1:9199/health"
echo "    Config: $CONFIG_PATH"
