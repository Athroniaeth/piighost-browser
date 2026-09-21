#!/bin/sh
# Reconstruit l'image et remplace le conteneur derrière Traefik.
set -eu
HOST="${HOST:-piighost-wasm.athroniaeth.cloud}"
cd "$(dirname "$0")"
npm run build
docker build -t piighost-wasm:latest .
docker rm -f piighost-wasm >/dev/null 2>&1 || true
docker run -d --name piighost-wasm --restart unless-stopped --network coolify \
  --label "traefik.enable=true" \
  --label "traefik.docker.network=coolify" \
  --label "traefik.http.routers.piighost-wasm-http.entryPoints=http" \
  --label "traefik.http.routers.piighost-wasm-http.rule=Host(\`$HOST\`) && PathPrefix(\`/\`)" \
  --label "traefik.http.routers.piighost-wasm-http.middlewares=redirect-to-https" \
  --label "traefik.http.routers.piighost-wasm-http.service=piighost-wasm-svc" \
  --label "traefik.http.routers.piighost-wasm-https.entryPoints=https" \
  --label "traefik.http.routers.piighost-wasm-https.rule=Host(\`$HOST\`) && PathPrefix(\`/\`)" \
  --label "traefik.http.routers.piighost-wasm-https.tls=true" \
  --label "traefik.http.routers.piighost-wasm-https.tls.certresolver=letsencrypt" \
  --label "traefik.http.routers.piighost-wasm-https.service=piighost-wasm-svc" \
  --label "traefik.http.services.piighost-wasm-svc.loadbalancer.server.port=80" \
  piighost-wasm:latest
echo "déployé sur https://$HOST/"
