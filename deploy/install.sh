#!/usr/bin/env bash
set -euo pipefail

# Usage: ./install.sh <path-to-connector-binary>
# Run this on the client machine that has Ollama installed.

BIN_SRC="${1:-./connector}"
INSTALL_DIR="/opt/llm-connector"
BIN_DST="$INSTALL_DIR/connector"
CONFIG_DST="$INSTALL_DIR/config.json"
ENV_DST="/etc/llm-connector.env"

echo "==> Installing LLM Connector to $INSTALL_DIR"

# Install dir
sudo mkdir -p "$INSTALL_DIR"
sudo mkdir -p "$INSTALL_DIR/data"

# Copy binary
sudo cp "$BIN_SRC" "$BIN_DST"
sudo chmod 755 "$BIN_DST"

# Write default config
if [ ! -f "$CONFIG_DST" ]; then
  sudo tee "$CONFIG_DST" > /dev/null <<'EOF'
{
    "api_key": "",
    "server_url": "https://api.llmconnector.example.com",
    "ollama_url": "http://localhost:11434",
    "heartbeat_interval": 30,
    "reconnect_delay": 5,
    "data_dir": "/opt/llm-connector/data"
}
EOF
  echo "==> Edit $CONFIG_DST and set your api_key and server_url"
  echo "    Alternatively set LLM_CONNECTOR_API_KEY in $ENV_DST"
fi

# --- platform-specific service setup ---

if [[ "$(uname)" == "Linux" ]]; then
  echo "==> Installing systemd service"
  sudo tee /etc/systemd/system/llm-connector.service > /dev/null <<'SVC'
[Unit]
Description=LLM Connector – local Ollama bridge to cloud testing platform
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/llm-connector
EnvironmentFile=-/etc/llm-connector.env
ExecStart=/opt/llm-connector/connector /opt/llm-connector/config.json
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SVC
  sudo systemctl daemon-reload
  sudo systemctl enable llm-connector
  sudo systemctl start llm-connector
  echo "==> Service started. Status: sudo systemctl status llm-connector"

elif [[ "$(uname)" == "Darwin" ]]; then
  echo "==> Installing launchd service"
  PLIST="/Library/LaunchDaemons/com.llmconnector.connector.plist"
  sudo tee "$PLIST" > /dev/null <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.llmconnector.connector</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/llm-connector/connector</string>
        <string>/opt/llm-connector/config.json</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/opt/llm-connector</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/opt/llm-connector/connector.log</string>
    <key>StandardErrorPath</key>
    <string>/opt/llm-connector/connector.log</string>
</dict>
</plist>
PLIST
  sudo launchctl load "$PLIST"
  echo "==> Service loaded. Logs: tail -f /opt/llm-connector/connector.log"

elif [[ "$(uname)" =~ MINGW|MSYS|CYGWIN ]]; then
  echo "==> Windows detected. Register as a service with NSSM:"
  echo "    nssm install LLMConnector \"$BIN_DST\" \"$CONFIG_DST\""
  echo "    Or run manually: $BIN_DST $CONFIG_DST"
fi

echo "==> Done. Connector installed at $INSTALL_DIR"
