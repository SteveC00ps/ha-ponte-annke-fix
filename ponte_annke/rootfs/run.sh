#!/usr/bin/with-contenv bashio
# shellcheck shell=bash
set -e

OPTS=/data/options.json
CHANNELS=$(jq -r '.channels' "$OPTS")

# config.json per il ponte (stessa forma usata sul PC)
jq '{host: .host, port: .port, user: .user, password: .password}' "$OPTS" > /app/config.json

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
bashio::log.info "Node.js $(node --version), go2rtc $(go2rtc -version 2>/dev/null | head -n1)"
if [ "$NODE_MAJOR" -lt 22 ]; then
  bashio::log.error "Serve Node.js 22 o piu recente (trovato $NODE_MAJOR)"
  exit 1
fi

# configurazione go2rtc: porte diverse da quelle del go2rtc interno di Home Assistant
{
  echo "streams:"
  for i in $(seq 1 "$CHANNELS"); do
    echo "  cam${i}: exec:node /app/ponte-annke.js ${i} sub"
    echo "  cam${i}_hd: exec:node /app/ponte-annke.js ${i} main"
  done
  echo "api:"
  echo "  listen: \":1994\""
  echo "rtsp:"
  echo "  listen: \":8654\""
  echo "webrtc:"
  echo "  listen: \"\""
  echo "log:"
  echo "  exec: debug"
} > /app/go2rtc.yaml

bashio::log.info "NVR $(jq -r .host "$OPTS"), ${CHANNELS} telecamere -> rtsp://127.0.0.1:8654/cam1 ... cam${CHANNELS} (e camN_hd)"
cd /app
exec go2rtc -config /app/go2rtc.yaml
