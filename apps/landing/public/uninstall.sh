#!/bin/sh
# One-command uninstaller for kuberfy.
# Removes the kuberfy service, traefik, deployed applications, networks, volumes, and host CLI.
#
# Usage:
#   curl -sSL https://kuberfy.pages.dev/uninstall.sh | sh
#
# Non-interactive:
#   curl -sSL https://kuberfy.pages.dev/uninstall.sh | FORCE=1 sh

set -e

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

# Confirmation prompt if interactive
if [ "${FORCE:-0}" != "1" ]; then
  confirmed=""
  if [ -t 0 ]; then
    printf "Are you sure you want to uninstall Kuberfy and delete all associated containers and data? [y/N]: "
    read -r confirmed
  elif [ -e /dev/tty ]; then
    printf "Are you sure you want to uninstall Kuberfy and delete all associated containers and data? [y/N]: " > /dev/tty
    read -r confirmed < /dev/tty
  else
    fail "non-interactive execution requires FORCE=1 (e.g. FORCE=1 sh uninstall.sh)"
  fi

  case "$confirmed" in
    [yY]|[yY][eE][sS])
      echo "Proceeding with uninstall..."
      ;;
    *)
      echo "Uninstall cancelled."
      exit 0
      ;;
  esac
fi

echo "==> Stopping and removing Kuberfy service..."
docker service rm kuberfy 2>/dev/null || true

echo "==> Stopping and removing Traefik proxy..."
docker rm -f kuberfy-traefik 2>/dev/null || true

echo "==> Stopping any deployed application containers..."
app_containers=$(docker ps -aq -f label=kuberfy.application 2>/dev/null || true)
if [ -n "$app_containers" ]; then
  echo "$app_containers" | xargs docker rm -f 2>/dev/null || true
fi

echo "==> Removing network 'kuberfy-network'..."
docker network rm kuberfy-network 2>/dev/null || true

echo "==> Removing volumes..."
docker volume rm kuberfy-data kuberfy-traefik-certs 2>/dev/null || true

echo "==> Leaving Docker Swarm..."
docker swarm leave --force 2>/dev/null || true

echo "==> Removing host CLI wrapper (/usr/local/bin/kuberfy)..."
rm -f /usr/local/bin/kuberfy

echo ""
echo "Kuberfy has been completely uninstalled from this server."
