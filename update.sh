#!/bin/sh
# One-command updater for kuberfy.
# Pulls the latest remote image and updates the Docker Swarm service.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/JoelVeloz/kuberfy/main/update.sh | sh
#
# Optional env vars:
#   KUBERFY_IMAGE   image to pull (default: ghcr.io/joelveloz/kuberfy:latest)

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
  fail "this script must run on Linux, not macOS."
fi

if [ -f /.dockerenv ]; then
  fail "this script must run on the host, not inside a container."
fi

if ! command_exists docker; then
  fail "docker is not installed"
fi

if ! docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -q 'active'; then
  fail "docker swarm is not active on this host"
fi

if ! docker service inspect kuberfy >/dev/null 2>&1; then
  fail "kuberfy service not found in docker swarm. Is kuberfy installed?"
fi

KUBERFY_IMAGE="${KUBERFY_IMAGE:-ghcr.io/joelveloz/kuberfy:latest}"

echo "Pulling latest image: $KUBERFY_IMAGE..."
docker pull "$KUBERFY_IMAGE"

echo "Updating kuberfy service..."
docker service update --image "$KUBERFY_IMAGE" --force kuberfy

echo "Waiting for kuberfy to start..."
container_id=""
for _ in $(seq 1 30); do
  container_id=$(docker ps -q -f label=com.docker.swarm.service.name=kuberfy -f status=running | head -n1)
  [ -n "$container_id" ] && break
  sleep 2
done
[ -n "$container_id" ] || fail "kuberfy container did not start in time, check 'docker service logs kuberfy'"

# Install or refresh the host CLI wrapper
cat <<'EOF' > /usr/local/bin/kuberfy
#!/bin/sh
set -e

KUBERFY_IMAGE="${KUBERFY_IMAGE:-ghcr.io/joelveloz/kuberfy:latest}"

case "$1" in
  update)
    echo "Pulling latest image: $KUBERFY_IMAGE..."
    docker pull "$KUBERFY_IMAGE"
    echo "Updating kuberfy service..."
    docker service update --image "$KUBERFY_IMAGE" --force kuberfy
    echo "Waiting for kuberfy to start..."
    container_id=""
    for _ in $(seq 1 30); do
      container_id=$(docker ps -q -f label=com.docker.swarm.service.name=kuberfy -f status=running | head -n1)
      [ -n "$container_id" ] && break
      sleep 2
    done
    [ -n "$container_id" ] || { echo "ERROR: kuberfy container did not start in time" >&2; exit 1; }
    echo "Kuberfy updated successfully."
    ;;
  *)
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
    ;;
esac
EOF
chmod +x /usr/local/bin/kuberfy

echo ""
echo "Kuberfy has been updated to $KUBERFY_IMAGE."
echo "You can also run 'kuberfy update' directly on this host at any time."
