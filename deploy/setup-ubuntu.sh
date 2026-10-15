#!/usr/bin/env bash
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo: sudo bash deploy/setup-ubuntu.sh"; exit 1; fi
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_USER="${SUDO_USER:-ubuntu}"
WEB_PORT=3000
RELAY_PORT=19134
read -rsp "Choose a strong admin password: " ADMIN_PASSWORD
echo
[ -n "$ADMIN_PASSWORD" ] || { echo "Password cannot be empty."; exit 1; }
apt-get update -y
apt-get install -y curl ca-certificates build-essential cmake git python3
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
cd "$APP_DIR"
npm install --omit=dev
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow ${WEB_PORT}/tcp; ufw allow ${RELAY_PORT}/udp; fi
iptables -C INPUT -p tcp --dport ${WEB_PORT} -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport ${WEB_PORT} -j ACCEPT
iptables -C INPUT -p udp --dport ${RELAY_PORT} -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p udp --dport ${RELAY_PORT} -j ACCEPT
install -d -m 0750 /etc/ghost-bridge
umask 077
printf 'ADMIN_PASSWORD=%s\nPORT=%s\nRELAY_PORT=%s\n' "$ADMIN_PASSWORD" "$WEB_PORT" "$RELAY_PORT" > /etc/ghost-bridge/env
cat > /etc/systemd/system/ghost-bridge.service <<UNIT
[Unit]
Description=Ghost Bridge
After=network-online.target
Wants=network-online.target
[Service]
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=/etc/ghost-bridge/env
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now ghost-bridge
IP="$(curl -fsS https://api.ipify.org 2>/dev/null || echo '<your-vm-ip>')"
echo
echo "Ghost Bridge started. Open http://${IP}:${WEB_PORT}"
echo "IMPORTANT: also open TCP ${WEB_PORT} and UDP ${RELAY_PORT} in your cloud provider firewall/security list."
echo "Logs: journalctl -u ghost-bridge -f"
