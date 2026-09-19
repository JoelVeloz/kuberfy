#!/bin/sh
# One-command installer for Kuberfy on a fresh Linux server.
#
# Usage:
#   curl -sSL https://kuberfy.pages.dev/install.sh | sudo sh

set -e

if [ -t 1 ] || [ -e /dev/tty ]; then
  IS_TTY=1
  BOLD="\033[1m"
  CYAN="\033[36m"
  GREEN="\033[32m"
  YELLOW="\033[33m"
  RED="\033[31m"
  NC="\033[0m"
else
  IS_TTY=0
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

step() {
  printf "\n${BOLD}${CYAN}[%s] %s${NC}\n" "$1" "$2"
}

success() {
  printf "${GREEN}${BOLD}✔ %s${NC}\n" "$1"
}

warn() {
  printf "${YELLOW}${BOLD}⚠ %s${NC}\n" "$1"
}

run_with_elapsed() {
  msg="$1"; shift
  log="$(mktemp)"
  "$@" >"$log" 2>&1 &
  pid=$!
  start=$(date +%s)
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$IS_TTY" = "1" ]; then
      printf "\r${CYAN}➜ %s (%ss)${NC}" "$msg" "$(($(date +%s) - start))"
    fi
    sleep 1
  done
  wait "$pid"
  status=$?
  [ "$IS_TTY" = "1" ] && printf "\r\033[K"
  [ $status -ne 0 ] && cat "$log" >&2
  rm -f "$log"
  return $status
}

printf "${BOLD}${CYAN}"
printf "┌──────────────────────────────────────────────────────────┐\n"
printf "│                                                          │\n"
printf "│   KUBERFY — The Lightest Self-Hosted PaaS Control Plane  │\n"
printf "│                                                          │\n"
printf "└──────────────────────────────────────────────────────────┘\n"
printf "${NC}\n"

# Step 1: Guard Rails & Host Firewall
step "1/6" "Verifying system requirements & host firewall..."

if [ "$(id -u)" != "0" ]; then
  fail "This script must be run as root (use: curl -sSL https://kuberfy.pages.dev/install.sh | sudo sh)"
fi

if [ "$(uname)" = "Darwin" ]; then
  fail "This script must run on Linux, not macOS. Test it inside a Linux VM (Multipass/UTM)."
fi

if [ -f /.dockerenv ]; then
  fail "This script must run on the host system, not inside a Docker container."
fi

if command_exists iptables; then
  iptables -I INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
  iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
  # Docker Swarm's own cluster-management ports — only needed for communication between multiple nodes, which
  # this single-node install never has. Blocked explicitly since `docker swarm init` below listens on all
  # interfaces by default, regardless of whether anything else ever gets published on these ports.
  iptables -I INPUT -p tcp --dport 2377 -j DROP 2>/dev/null || true
  iptables -I INPUT -p tcp --dport 7946 -j DROP 2>/dev/null || true
  iptables -I INPUT -p udp --dport 7946 -j DROP 2>/dev/null || true
  iptables -I INPUT -p udp --dport 4789 -j DROP 2>/dev/null || true
fi
if command_exists ufw && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw deny 2377/tcp >/dev/null 2>&1 || true
  ufw deny 7946/tcp >/dev/null 2>&1 || true
  ufw deny 7946/udp >/dev/null 2>&1 || true
  ufw deny 4789/udp >/dev/null 2>&1 || true
fi

for port in 80 443; do
  if ss -tulnp | grep ":${port} " >/dev/null 2>&1; then
    if command_exists docker && docker ps 2>/dev/null | grep -E "(kuberfy|traefik)" >/dev/null; then
      fail "Kuberfy is already installed and running (Port ${port} in use). To update, run 'kuberfy update'. To uninstall first, run 'sudo kuberfy uninstall'."
    else
      fail "Port ${port} is already in use by another process."
    fi
  fi
done

success "System requirements & host firewall configured."

# Step 2: Configuration & Interactive Prompts
step "2/6" "Configuring installation settings..."

if [ -z "$ADMIN_EMAIL" ]; then
  if [ -t 0 ]; then
    while [ -z "$ADMIN_EMAIL" ]; do
      printf "${BOLD}${YELLOW}? Admin Email:${NC} "
      read -r ADMIN_EMAIL
    done
  elif (exec 3</dev/tty) 2>/dev/null; then
    while [ -z "$ADMIN_EMAIL" ]; do
      printf "${BOLD}${YELLOW}? Admin Email:${NC} " > /dev/tty
      read -r ADMIN_EMAIL < /dev/tty
    done
  else
    fail "Missing ADMIN_EMAIL environment variable for non-interactive installation."
  fi
fi

# Step 3: Docker Installation
step "3/6" "Checking Docker container runtime..."

if command_exists docker; then
  success "Docker is already installed."
else
  info "Installing Docker..."
  if ! curl -sSL https://get.docker.com | sh; then
    warn "Official Docker script encountered an issue; using system package manager..."
    if command_exists apt-get; then
      apt-get update -qq && (apt-get install -y -qq docker.io docker-buildx-plugin docker-compose-plugin || apt-get install -y -qq docker.io)
    elif command_exists dnf; then
      dnf install -y docker
    elif command_exists yum; then
      yum install -y docker
    else
      fail "Could not install Docker automatically."
    fi
  fi
  systemctl enable --now docker 2>/dev/null || service docker start 2>/dev/null || true
  if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
    usermod -aG docker "$SUDO_USER" 2>/dev/null || true
  fi
  success "Docker installed successfully."
fi

# Step 4: Docker Swarm & Network
step "4/6" "Initializing Docker Swarm & network..."

get_local_ip() {
  ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' \
    || ip -o -4 addr show scope global | awk '$2 !~ /^(docker|br-|veth)/ {print $4}' | cut -d/ -f1 | head -n1
}

get_public_ip() {
  curl -4s --connect-timeout 4 https://ifconfig.me 2>/dev/null \
    || curl -4s --connect-timeout 4 https://api.ipify.org 2>/dev/null \
    || curl -4s --connect-timeout 4 https://icanhazip.com 2>/dev/null \
    || curl -4s --connect-timeout 4 https://ifconfig.io 2>/dev/null
}

public_ip=$(get_public_ip)
local_ip=$(get_local_ip)

advertise_addr="${ADVERTISE_ADDR:-$local_ip}"
[ -n "$advertise_addr" ] || advertise_addr="$public_ip"
[ -n "$advertise_addr" ] || fail "Could not detect server IP address automatically. Set ADVERTISE_ADDR manually."

server_host="${public_ip:-$advertise_addr}"

info "Public IP: ${public_ip:-None} | Local IP: ${local_ip:-None}"

docker swarm leave --force 2>/dev/null || true
docker swarm init --advertise-addr "$advertise_addr" >/dev/null

docker network rm -f kuberfy-network 2>/dev/null || true
docker network create --driver overlay --attachable kuberfy-network >/dev/null

# Deployed application containers join this network instead of kuberfy-network — isolated from kuberfy's own
# dashboard/API and its Docker-socket access. Only Traefik (below) is attached to both, to route to everything.
docker network rm -f kuberfy-apps-network 2>/dev/null || true
docker network create --driver overlay --attachable kuberfy-apps-network >/dev/null

success "Docker Swarm cluster and overlay networks initialized."

# Step 5: Pull & Start Services
step "5/6" "Deploying Kuberfy control plane & Traefik proxy..."

KUBERFY_IMAGE="${KUBERFY_IMAGE:-ghcr.io/joelveloz/kuberfy:latest}"

if [ -n "$KUBERFY_REPO" ]; then
  command_exists git || (apt-get update -qq && apt-get install -y -qq git)
  if [ ! -d /opt/kuberfy/src ]; then
    git clone "$KUBERFY_REPO" /opt/kuberfy/src
  fi
  run_with_elapsed "Building Kuberfy image from $KUBERFY_REPO..." docker build -t "$KUBERFY_IMAGE" /opt/kuberfy/src
else
  run_with_elapsed "Pulling remote image: $KUBERFY_IMAGE..." docker pull "$KUBERFY_IMAGE"
fi

AUTH_SECRET=$(openssl rand -hex 32)

# --group, not --group-add (that's docker run's flag name; docker service create has no --group-add)
DOCKER_SOCK_GID=$(stat -c '%g' /var/run/docker.sock)

docker service create \
  --name kuberfy \
  --replicas 1 \
  --network kuberfy-network \
  --limit-memory 256m \
  --reserve-cpu 0.25 \
  --group "$DOCKER_SOCK_GID" \
  --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
  --mount type=volume,source=kuberfy-data,target=/data \
  --mount type=bind,source=/proc,target=/host/proc,readonly \
  --update-parallelism 1 \
  --update-order stop-first \
  --constraint 'node.role == manager' \
  -e BETTER_AUTH_SECRET="$AUTH_SECRET" \
  ${public_ip:+-e SERVER_PUBLIC_IP="$public_ip"} \
  --label "traefik.enable=true" \
  --label "traefik.http.routers.kuberfy.rule=Host(\`${server_host}\`)" \
  --label "traefik.http.routers.kuberfy.entrypoints=web" \
  --label "traefik.http.services.kuberfy.loadbalancer.server.port=3000" \
  "$KUBERFY_IMAGE" >/dev/null

docker run -d \
  --name kuberfy-traefik \
  --restart always \
  --network kuberfy-network \
  --memory 256m \
  --memory-swap 256m \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v kuberfy-traefik-certs:/letsencrypt \
  -p 80:80 \
  -p 443:443 \
  traefik:v3.7 \
  --providers.swarm=true \
  --providers.swarm.exposedbydefault=false \
  --accesslog=true \
  --accesslog.format=json \
  --accesslog.fields.headers.names.User-Agent=keep \
  --entrypoints.web.address=:80 \
  --entrypoints.websecure.address=:443 \
  --certificatesresolvers.le.acme.httpchallenge=true \
  --certificatesresolvers.le.acme.httpchallenge.entrypoint=web \
  --certificatesresolvers.le.acme.email="${ACME_EMAIL:-$ADMIN_EMAIL}" \
  --certificatesresolvers.le.acme.storage=/letsencrypt/acme.json >/dev/null

docker network connect kuberfy-apps-network kuberfy-traefik

info "Waiting for Kuberfy service to be ready..."
container_id=""
for _ in $(seq 1 30); do
  container_id=$(docker ps -q -f label=com.docker.swarm.service.name=kuberfy -f status=running | head -n1)
  [ -n "$container_id" ] && break
  sleep 2
done
[ -n "$container_id" ] || fail "Kuberfy container did not start in time. Check 'docker service logs kuberfy'."

success "Kuberfy control plane & Traefik proxy deployed."

# Step 6: Admin Account & Host CLI
step "6/6" "Configuring admin account & host CLI..."

admin_password=""
user_out=$(docker exec "$container_id" ./kuberfy create-user --email "$ADMIN_EMAIL" --role admin 2>&1) || true
if echo "$user_out" | grep -iq "already exists"; then
  info "Admin account ($ADMIN_EMAIL) is already configured."
else
  admin_password=$(echo "$user_out" | grep -i "temporary password:" | sed -n 's/.*temporary password: *\([^ ]*\).*/\1/p')
fi

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
success "Host CLI installed to /usr/local/bin/kuberfy."

target_url="http://${server_host}"

if [ -t 1 ] || [ -e /dev/tty ]; then
  clickable_url=$(printf "\033]8;;%s\033\\%s\033]8;;\033\\" "$target_url" "$target_url")
else
  clickable_url="$target_url"
fi

printf "\n${GREEN}${BOLD}┌──────────────────────────────────────────────────────────┐${NC}\n"
printf "${GREEN}${BOLD}│            ✔ KUBERFY INSTALLED SUCCESSFULLY              │${NC}\n"
printf "${GREEN}${BOLD}└──────────────────────────────────────────────────────────┘${NC}\n\n"
printf "${BOLD}  ➜ Dashboard URL  :${NC} ${CYAN}%s${NC}\n" "$clickable_url"
printf "${BOLD}  ➜ Admin Email    :${NC} %s\n" "$ADMIN_EMAIL"
if [ -n "$admin_password" ]; then
  printf "${BOLD}  ➜ Admin Password :${NC} ${YELLOW}${BOLD}%s${NC}\n" "$admin_password"
fi
printf "\n${BOLD}  ➜ CLI Management :${NC} Run ${CYAN}'kuberfy'${NC} or ${CYAN}'kuberfy logs'${NC} anytime\n"
printf "${GREEN}${BOLD}────────────────────────────────────────────────────────────${NC}\n\n"
