#!/bin/sh
# One-command uninstaller for Kuberfy.
#
# Usage:
#   curl -sSL https://kuberfy.pages.dev/uninstall.sh | sudo sh

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

fail() {
  printf "${RED}${BOLD}✖ ERROR:${NC} %s\n" "$1" >&2
  exit 1
}

info() {
  printf "${CYAN}${BOLD}➜ %s${NC}\n" "$1"
}

printf "${BOLD}${RED}"
printf "┌──────────────────────────────────────────────────────────┐\n"
printf "│                                                          │\n"
printf "│   KUBERFY — Uninstalling Control Plane & All Services    │\n"
printf "│                                                          │\n"
printf "└──────────────────────────────────────────────────────────┘\n"
printf "${NC}\n"

if [ "$(id -u)" != "0" ]; then
  fail "This script must be run as root (use: curl -sSL https://kuberfy.pages.dev/uninstall.sh | sudo sh)"
fi

if [ "$(uname)" = "Darwin" ]; then
  fail "This script must run on Linux, not macOS."
fi

if [ "${FORCE:-0}" != "1" ]; then
  confirmed=""
  if [ -t 0 ]; then
    printf "${BOLD}${YELLOW}? Are you sure you want to uninstall Kuberfy and remove all containers and data? [y/N]:${NC} "
    read -r confirmed
  elif [ -e /dev/tty ]; then
    printf "${BOLD}${YELLOW}? Are you sure you want to uninstall Kuberfy and remove all containers and data? [y/N]:${NC} " > /dev/tty
    read -r confirmed < /dev/tty
  else
    fail "Non-interactive execution requires FORCE=1 (e.g. FORCE=1 sudo sh uninstall.sh)"
  fi

  case "$confirmed" in
    [yY]|[yY][eE][sS])
      info "Proceeding with complete uninstallation..."
      ;;
    *)
      printf "${YELLOW}Uninstallation cancelled.${NC}\n"
      exit 0
      ;;
  esac
fi

info "Removing Kuberfy Swarm service..."
docker service rm kuberfy 2>/dev/null || true

info "Removing Traefik proxy..."
docker rm -f kuberfy-traefik 2>/dev/null || true

info "Removing deployed application containers..."
app_containers=$(docker ps -aq -f label=kuberfy.application 2>/dev/null || true)
if [ -n "$app_containers" ]; then
  echo "$app_containers" | xargs docker rm -f 2>/dev/null || true
fi

info "Removing overlay network 'kuberfy-network'..."
docker network rm kuberfy-network 2>/dev/null || true

info "Removing data volumes..."
docker volume rm kuberfy-data kuberfy-traefik-certs 2>/dev/null || true

info "Leaving Docker Swarm..."
docker swarm leave --force 2>/dev/null || true

info "Removing host CLI wrapper..."
rm -f /usr/local/bin/kuberfy

printf "\n${GREEN}${BOLD}✔ Kuberfy has been completely uninstalled from this server.${NC}\n"
