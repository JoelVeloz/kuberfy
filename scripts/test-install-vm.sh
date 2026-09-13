#!/bin/bash
# Runs install.sh end-to-end inside a disposable Multipass VM, from the Mac.
# One unit test today; the same shape (launch -> run -> assert -> teardown)
# is what a future CI/mass-test loop would repeat per run, so keep it self-contained.
#
# Usage: bash scripts/test-install-vm.sh
# Env overrides: VM_NAME, VM_CPUS, VM_MEM, VM_DISK, ADMIN_EMAIL
# KEEP=1 bash scripts/test-install-vm.sh   # skip teardown, to poke around after

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

VM_NAME="${VM_NAME:-kuberfy-install-test}"
VM_CPUS="${VM_CPUS:-2}"
VM_MEM="${VM_MEM:-4G}"
VM_DISK="${VM_DISK:-20G}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@kuberfy.test}"
MOUNT_POINT="/home/ubuntu/kuberfy"

command -v multipass >/dev/null 2>&1 || {
  echo "Multipass isn't installed. Run: brew install --cask multipass" >&2
  exit 1
}

echo "==> Removing any previous '$VM_NAME' VM (clean-room run)"
multipass delete "$VM_NAME" --purge >/dev/null 2>&1 || true

echo "==> Launching fresh Ubuntu 24.04 VM ($VM_CPUS CPU / $VM_MEM RAM / $VM_DISK disk)"
multipass launch 24.04 --name "$VM_NAME" --cpus "$VM_CPUS" --memory "$VM_MEM" --disk "$VM_DISK"

cleanup() {
  if [ "${KEEP:-0}" = "1" ]; then
    echo "==> KEEP=1: leaving '$VM_NAME' running for inspection (multipass shell $VM_NAME)"
  else
    echo "==> Tearing down '$VM_NAME'"
    multipass delete "$VM_NAME" --purge >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "==> Mounting repo into the VM"
multipass mount "$REPO_ROOT" "$VM_NAME:$MOUNT_POINT"

echo "==> Running install.sh as root inside the VM"
multipass exec "$VM_NAME" -- sudo sh -c \
  "ADMIN_EMAIL='$ADMIN_EMAIL' KUBERFY_REPO='$MOUNT_POINT' sh '$MOUNT_POINT/install.sh'"

vm_ip=$(multipass info "$VM_NAME" | awk '/IPv4/{print $2; exit}')

[ -n "$vm_ip" ] || { echo "Could not determine VM IP" >&2; exit 1; }

echo "==> Smoke-testing http://$vm_ip:3000/api/health"
for _ in $(seq 1 15); do
  if curl -sf "http://$vm_ip:3000/api/health" >/dev/null; then
    echo "PASS: kuberfy is up at http://$vm_ip:3000"
    exit 0
  fi
  sleep 2
done

echo "FAIL: kuberfy never responded at http://$vm_ip:3000/api/health" >&2
echo "Inspect with: KEEP=1 bash scripts/test-install-vm.sh" >&2
exit 1
