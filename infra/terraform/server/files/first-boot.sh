#!/bin/bash
# The server's first boot (ADR-0029), run once by cloud-init as root: swap, the data volume, Docker with the Compose
# plugin, then the markup-resume unit. A change to this file replaces the instance on the next apply; the data volume
# is kept and only formatted if it is blank.
set -euo pipefail

# Swap: Chromium's PDF export can briefly need more than the instance's 2 GB of memory.
if [[ ! -f /swapfile ]]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile
  echo '/swapfile none swap defaults 0 0' >>/etc/fstab
fi
swapon -a

# The data volume. Terraform attaches it after the instance is up, so it may not be there yet. On this (Nitro)
# instance it is an NVMe device; Amazon Linux links the name it was attached as, /dev/sdf, to it.
device=/dev/sdf
for _ in $(seq 60); do
  if [[ -e $device ]]; then
    break
  fi
  sleep 5
done
if [[ ! -e $device ]]; then
  echo "The data volume $device is not attached." >&2
  exit 1
fi
# Formatted on its very first use only: on a replacement it already holds the database.
if ! blkid "$device" >/dev/null; then
  mkfs.xfs "$device"
fi
# Docker keeps its named volumes (Postgres, Caddy's certificates) under this directory, so they live on the data
# volume. nofail: the system still boots if the volume is missing; Docker then does not start (docker-data-volume.conf).
mkdir -p /var/lib/docker/volumes
uuid=$(blkid -s UUID -o value "$device")
if ! grep -q "$uuid" /etc/fstab; then
  echo "UUID=$uuid /var/lib/docker/volumes xfs defaults,nofail 0 2" >>/etc/fstab
fi
systemctl daemon-reload
mount /var/lib/docker/volumes

# Docker from Amazon Linux; the Compose plugin is not packaged there, so it comes from its GitHub release, checked
# against the checksum published with it.
dnf install -y docker
compose_version=v5.6.1
compose_sha256=42cfa75f51ad0ccf290bad37899e0038a8c10a0069e85233ecc1d53e3ff1347d
plugin=/usr/local/lib/docker/cli-plugins/docker-compose
mkdir -p "$(dirname "$plugin")"
curl -fsSL -o "$plugin" \
  "https://github.com/docker/compose/releases/download/$compose_version/docker-compose-linux-aarch64"
echo "$compose_sha256  $plugin" | sha256sum -c -
chmod 755 "$plugin"
systemctl enable --now docker

# Created once and marked external in compose.prod.yaml, so no Compose command can delete it.
if ! docker volume inspect markup-resume-db-prod >/dev/null 2>&1; then
  docker volume create markup-resume-db-prod
fi

# compose.prod.yaml is put into /opt/markup-resume by the deploy (by hand before the first one); until then the unit
# is skipped.
mkdir -p /opt/markup-resume
systemctl enable --now markup-resume.service
