#!/bin/sh
# One-command installer for kuberfy on a fresh Linux server.
# Pattern adapted from Dokploy's install.sh (dokploy.com/install.sh): guard rails,
# Docker install, single-node Swarm init, then the app + Traefik.
#
# Usage:
#   curl -sSL https://<host>/install.sh | ADMIN_EMAIL=admin@example.com KUBERFY_REPO=<git-url> sh
#
# Required env vars (no interactive prompts, so they must be set up front):
#   ADMIN_EMAIL   email for the first admin user (bootstrapped at the end)
#   KUBERFY_REPO  git URL to clone and build the image from (no registry image published yet)
# Optional:
#   KUBERFY_DOMAIN  domain routed to kuberfy via Traefik (defaults to the server's IP, no TLS)
#   ACME_EMAIL      email for Let's Encrypt (defaults to admin@example.com)
#   ADVERTISE_ADDR  override automatic IP detection for `docker swarm init`

set -e

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

if [ "$(id -u)" != "0" ]; then
  fail "this script must be run as root"
fi

if [ "$(uname)" = "Darwin" ]; then
  fail "this script must run on Linux, not macOS. Test it inside a Linux VM (Multipass/UTM), not on the host."
fi

if [ -f /.dockerenv ]; then
  fail "this script must run on the host, not inside a container."
fi

[ -n "$ADMIN_EMAIL" ] || fail "set ADMIN_EMAIL to bootstrap the first admin user (e.g. ADMIN_EMAIL=admin@example.com)"
[ -n "$KUBERFY_REPO" ] || fail "set KUBERFY_REPO to the git URL to build kuberfy from (no published registry image yet)"

for port in 80 443 3000; do
  if ss -tulnp | grep ":${port} " >/dev/null 2>&1; then
    fail "something is already listening on port ${port}"
  fi
done

if command_exists docker; then
  echo "Docker already installed"
else
  curl -sSL https://get.docker.com | sh
fi

command_exists git || (apt-get update && apt-get install -y git)

get_private_ip() {
  # first private (RFC1918) IP on a real interface — excludes docker-created
  # interfaces (docker0/br-*/veth*), whose IPs are host-local only.
  ip -o -4 addr show scope global \
    | awk '$2 !~ /^(docker|br-|veth)/ {print $4}' \
    | cut -d/ -f1 \
    | grep -E "^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)" \
    | head -n1
}

get_public_ip() {
  curl -4s --connect-timeout 5 https://ifconfig.io 2>/dev/null \
    || curl -4s --connect-timeout 5 https://icanhazip.com 2>/dev/null
}

advertise_addr="${ADVERTISE_ADDR:-$(get_private_ip)}"
[ -n "$advertise_addr" ] || advertise_addr=$(get_public_ip)
[ -n "$advertise_addr" ] || fail "could not detect the server IP, set ADVERTISE_ADDR manually"
echo "Using advertise address: $advertise_addr"

docker swarm leave --force 2>/dev/null || true
docker swarm init --advertise-addr "$advertise_addr"

docker network rm -f kuberfy-network 2>/dev/null || true
docker network create --driver overlay --attachable kuberfy-network

if [ ! -d /opt/kuberfy/src ]; then
  git clone "$KUBERFY_REPO" /opt/kuberfy/src
fi

KUBERFY_IMAGE="${KUBERFY_IMAGE:-kuberfy:local}"
docker build -t "$KUBERFY_IMAGE" /opt/kuberfy/src

# BETTER_AUTH_SECRET goes in as a plain service env var, not a Docker secret:
# apps/api/src/lib/env.ts reads it directly (no *_FILE support), unlike Dokploy's
# Postgres image which supports POSTGRES_PASSWORD_FILE natively.
AUTH_SECRET=$(openssl rand -hex 32)

docker service create \
  --name kuberfy \
  --replicas 1 \
  --network kuberfy-network \
  --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
  --mount type=volume,source=kuberfy-data,target=/data \
  --publish published=3000,target=3000,mode=host \
  --update-parallelism 1 \
  --update-order stop-first \
  --constraint 'node.role == manager' \
  -e BETTER_AUTH_SECRET="$AUTH_SECRET" \
  --label "traefik.enable=true" \
  --label "traefik.http.routers.kuberfy.rule=Host(\`${KUBERFY_DOMAIN:-$advertise_addr}\`)" \
  --label "traefik.http.routers.kuberfy.entrypoints=web" \
  --label "traefik.http.services.kuberfy.loadbalancer.server.port=3000" \
  "$KUBERFY_IMAGE"

docker run -d \
  --name kuberfy-traefik \
  --restart always \
  --network kuberfy-network \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v kuberfy-traefik-certs:/letsencrypt \
  -p 80:80 \
  -p 443:443 \
  traefik:v3.7 \
  --providers.docker=true \
  --providers.docker.swarmMode=true \
  --providers.docker.exposedbydefault=false \
  --entrypoints.web.address=:80 \
  --entrypoints.websecure.address=:443 \
  --certificatesresolvers.le.acme.httpchallenge=true \
  --certificatesresolvers.le.acme.httpchallenge.entrypoint=web \
  --certificatesresolvers.le.acme.email="${ACME_EMAIL:-admin@example.com}" \
  --certificatesresolvers.le.acme.storage=/letsencrypt/acme.json

echo "Waiting for kuberfy to start..."
container_id=""
for _ in $(seq 1 15); do
  container_id=$(docker ps -q -f name=kuberfy | head -n1)
  [ -n "$container_id" ] && break
  sleep 2
done
[ -n "$container_id" ] || fail "kuberfy container did not start in time, check 'docker service logs kuberfy'"

echo "Bootstrapping admin user..."
docker exec "$container_id" ./create-user --email "$ADMIN_EMAIL" --role admin

echo ""
echo "Kuberfy is installed."
echo "Visit http://${advertise_addr}:3000 and log in with the admin credentials printed above."
