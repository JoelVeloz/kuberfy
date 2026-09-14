#!/bin/sh
# One-command updater for Kuberfy.
#
# Usage:
#   curl -sSL https://kuberfy.pages.dev/update.sh | sudo sh

set -e

if [ -t 1 ] || [ -e /dev/tty ]; then
  BOLD="\033[1m"
  CYAN="\033[36m"
  GREEN="\033[32m"
  YELLOW="\033[33m"
  RED="\033[31m"
  NC="\033[0m"
else
  BOLD=""
  CYAN=""
  GREEN=""
  YELLOW=""
  RED=""
  NC=""
fi

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

fail() {
  printf "${RED}${BOLD}✖ ERROR:${NC} %s\n" "$1" >&2
  exit 1
}

info() {
  printf "${CYAN}${BOLD}➜ %s${NC}\n" "$1"
}

printf "${BOLD}${CYAN}"
printf "┌──────────────────────────────────────────────────────────┐\n"
printf "│                                                          │\n"
printf "│   KUBERFY — Updating Control Plane to Latest Version    │\n"
printf "│                                                          │\n"
printf "└──────────────────────────────────────────────────────────┘\n"
printf "${NC}\n"

if [ "$(id -u)" != "0" ]; then
  fail "This script must be run as root (use: curl -sSL https://kuberfy.pages.dev/update.sh | sudo sh)"
fi

if [ "$(uname)" = "Darwin" ]; then
  fail "This script must run on Linux, not macOS."
fi

if [ -f /.dockerenv ]; then
  fail "This script must run on the host system, not inside a container."
fi

if ! command_exists docker; then
  fail "Docker is not installed."
fi

if ! docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -q 'active'; then
  fail "Docker Swarm is not active on this host."
fi

if ! docker service inspect kuberfy >/dev/null 2>&1; then
  fail "Kuberfy service not found in Docker Swarm. Is Kuberfy installed?"
fi

KUBERFY_IMAGE="${KUBERFY_IMAGE:-ghcr.io/joelveloz/kuberfy:latest}"

info "Downloading latest remote image: $KUBERFY_IMAGE..."
docker pull "$KUBERFY_IMAGE"

# An install predating the Dockerfile's non-root user still has kuberfy-data owned by root; the image only
# chowns /data on a volume's first creation, never retroactively, so the new non-root process can't write to
# it and every migration on update fails with "attempt to write a readonly database".
docker run --rm -v kuberfy-data:/data alpine:3.20 chown -R 1000:1000 /data >/dev/null

info "Updating Swarm service..."
docker service update --image "$KUBERFY_IMAGE" --force kuberfy >/dev/null

info "Waiting for new container to start..."
container_id=""
for _ in $(seq 1 30); do
  container_id=$(docker ps -q -f label=com.docker.swarm.service.name=kuberfy -f status=running | head -n1)
  [ -n "$container_id" ] && break
  sleep 2
done
[ -n "$container_id" ] || fail "Kuberfy container did not start in time. Check 'docker service logs kuberfy'."

cat <<'EOF' > /usr/local/bin/kuberfy
#!/bin/sh
set -e

CYAN="\033[36m"
BOLD="\033[1m"
NC="\033[0m"

if [ $# -eq 0 ]; then
  printf "${BOLD}${CYAN}Kuberfy${NC} — The Lightest Self-Hosted PaaS Control Plane\n\n"
  printf "${BOLD}Usage:${NC}\n"
  printf "  kuberfy <command> [options]\n\n"
  printf "${BOLD}Commands:${NC}\n"
  printf "  update              Pull latest image and restart the service\n"
  printf "  uninstall           Remove Kuberfy and all data from this server\n"
  printf "  create-user         Create a new user account\n"
  printf "  set-password        Change a user's password\n"
  printf "  logs                Show Kuberfy service logs\n"
  printf "  status              Show running containers\n\n"
  printf "${BOLD}Examples:${NC}\n"
  printf "  kuberfy status\n"
  printf "  kuberfy update\n"
  printf "  kuberfy create-user --email user@example.com\n"
  printf "  kuberfy set-password --email user@example.com --password newpass\n"
  exit 0
fi

case "$1" in
  uninstall)
    exec curl -sSL https://kuberfy.pages.dev/uninstall.sh | sudo sh
    ;;
  update)
    exec curl -sSL https://kuberfy.pages.dev/update.sh | sudo sh
    ;;
  logs)
    exec docker service logs kuberfy --tail 100 -f
    ;;
  status)
    docker service ls -f name=kuberfy
    docker ps -f label=com.docker.swarm.service.name=kuberfy
    docker ps -f name=kuberfy-traefik
    exit 0
    ;;
esac

container_id=$(docker ps -q -f label=com.docker.swarm.service.name=kuberfy -f status=running | head -n1)
if [ -z "$container_id" ]; then
  echo "ERROR: kuberfy container is not running" >&2
  exit 1
fi

if [ -t 0 ] && [ -t 1 ]; then
  exec docker exec -it "$container_id" ./kuberfy "$@"
else
  exec docker exec -i "$container_id" ./kuberfy "$@"
fi
EOF
chmod +x /usr/local/bin/kuberfy

printf "\n${GREEN}${BOLD}✔ Kuberfy has been successfully updated to $KUBERFY_IMAGE!${NC}\n"
