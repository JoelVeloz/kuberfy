#!/bin/sh
# One-command installer for Kuberfy on a fresh Linux server.
#
# Usage:
#   curl -sSL https://kuberfy.pages.dev/install.sh | sudo sh

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

step() {
  printf "\n${BOLD}${CYAN}[%s] %s${NC}\n" "$1" "$2"
}

success() {
  printf "${GREEN}${BOLD}✔ %s${NC}\n" "$1"
}

warn() {
  printf "${YELLOW}${BOLD}⚠ %s${NC}\n" "$1"
}

printf "${BOLD}${CYAN}"
printf "┌──────────────────────────────────────────────────────────┐\n"
printf "│                                                          │\n"
printf "│   KUBERFY — The Lightest Self-Hosted PaaS Control Plane  │\n"
printf "│                                                          │\n"
printf "└──────────────────────────────────────────────────────────┘\n"
printf "${NC}\n"

# Step 1: Guard Rails
step "1/5" "Verifying system requirements..."

if [ "$(id -u)" != "0" ]; then
  fail "This script must be run as root (use: curl -sSL https://kuberfy.pages.dev/install.sh | sudo sh)"
fi

if [ "$(uname)" = "Darwin" ]; then
  fail "This script must run on Linux, not macOS. Test it inside a Linux VM (Multipass/UTM)."
fi

if [ -f /.dockerenv ]; then
  fail "This script must run on the host system, not inside a Docker container."
fi

for port in 80 443 3000; do
  if ss -tulnp | grep ":${port} " >/dev/null 2>&1; then
    fail "Port ${port} is already in use by another process."
  fi
done

success "System requirements verified."

# Step 2: Configuration & Interactive Prompts
step "2/5" "Configuring installation settings..."

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

if [ -z "$KUBERFY_DOMAIN" ]; then
  if [ -t 0 ]; then
    printf "${BOLD}${YELLOW}? Domain name (optional, press Enter for server IP):${NC} "
    read -r KUBERFY_DOMAIN
  elif (exec 3</dev/tty) 2>/dev/null; then
    printf "${BOLD}${YELLOW}? Domain name (optional, press Enter for server IP):${NC} " > /dev/tty
    read -r KUBERFY_DOMAIN < /dev/tty
  fi
fi

# Step 3: Docker Installation
step "3/5" "Checking Docker container runtime..."

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
  success "Docker installed successfully."
fi

# Step 4: Docker Swarm & Network
step "4/5" "Initializing Docker Swarm & network..."

get_private_ip() {
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
[ -n "$advertise_addr" ] || fail "Could not detect server IP address automatically. Set ADVERTISE_ADDR manually."

info "Server IP detected: $advertise_addr"

docker swarm leave --force 2>/dev/null || true
docker swarm init --advertise-addr "$advertise_addr" >/dev/null

docker network rm -f kuberfy-network 2>/dev/null || true
docker network create --driver overlay --attachable kuberfy-network >/dev/null

success "Docker Swarm cluster and overlay network initialized."

# Step 5: Pull & Start Services
step "5/5" "Deploying Kuberfy control plane & Traefik proxy..."

KUBERFY_IMAGE="${KUBERFY_IMAGE:-ghcr.io/joelveloz/kuberfy:latest}"

if [ -n "$KUBERFY_REPO" ]; then
  command_exists git || (apt-get update -qq && apt-get install -y -qq git)
  if [ ! -d /opt/kuberfy/src ]; then
    git clone "$KUBERFY_REPO" /opt/kuberfy/src
  fi
  info "Building Kuberfy image from $KUBERFY_REPO..."
  docker build -t "$KUBERFY_IMAGE" /opt/kuberfy/src
else
  info "Pulling remote image: $KUBERFY_IMAGE..."
  docker pull "$KUBERFY_IMAGE" >/dev/null
fi

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
  -e BETTER_AUTH_URL="http://${KUBERFY_DOMAIN:-$advertise_addr}:3000" \
  --label "traefik.enable=true" \
  --label "traefik.http.routers.kuberfy.rule=Host(\`${KUBERFY_DOMAIN:-$advertise_addr}\`)" \
  --label "traefik.http.routers.kuberfy.entrypoints=web" \
  --label "traefik.http.services.kuberfy.loadbalancer.server.port=3000" \
  "$KUBERFY_IMAGE" >/dev/null

docker run -d \
  --name kuberfy-traefik \
  --restart always \
  --network kuberfy-network \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v kuberfy-traefik-certs:/letsencrypt \
  -p 80:80 \
  -p 443:443 \
  traefik:v3.7 \
  --providers.swarm=true \
  --providers.swarm.exposedbydefault=false \
  --entrypoints.web.address=:80 \
  --entrypoints.websecure.address=:443 \
  --certificatesresolvers.le.acme.httpchallenge=true \
  --certificatesresolvers.le.acme.httpchallenge.entrypoint=web \
  --certificatesresolvers.le.acme.email="${ACME_EMAIL:-$ADMIN_EMAIL}" \
  --certificatesresolvers.le.acme.storage=/letsencrypt/acme.json >/dev/null

info "Waiting for Kuberfy container to start..."
container_id=""
for _ in $(seq 1 30); do
  container_id=$(docker ps -q -f label=com.docker.swarm.service.name=kuberfy -f status=running | head -n1)
  [ -n "$container_id" ] && break
  sleep 2
done
[ -n "$container_id" ] || fail "Kuberfy container did not start in time. Check 'docker service logs kuberfy'."

info "Bootstrapping initial admin account ($ADMIN_EMAIL)..."
docker exec "$container_id" ./kuberfy create-user --email "$ADMIN_EMAIL" --role admin >/dev/null

cat <<'EOF' > /usr/local/bin/kuberfy
#!/bin/sh
set -e

if [ "$1" = "uninstall" ]; then
  exec curl -sSL https://kuberfy.pages.dev/uninstall.sh | sudo sh
fi

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

target_url="http://${KUBERFY_DOMAIN:-$advertise_addr}:3000"

printf "\n${GREEN}${BOLD}==========================================================${NC}\n"
printf "${GREEN}${BOLD}  ✔ Kuberfy is successfully installed!${NC}\n"
printf "${GREEN}${BOLD}==========================================================${NC}\n\n"
printf "${BOLD}  ➜ Dashboard URL :${NC} ${CYAN}%s${NC}\n" "$target_url"
printf "${BOLD}  ➜ Admin Email   :${NC} %s\n" "$ADMIN_EMAIL"
printf "${BOLD}  ➜ Host CLI      :${NC} Run ${CYAN}'kuberfy'${NC} or ${CYAN}'kuberfy update'${NC} anywhere\n\n"
