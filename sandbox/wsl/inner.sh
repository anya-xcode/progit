#!/bin/sh
# DSAForge WSL sandbox — stage 2 (namespace "root", no real host privileges).
#
# 1. Mount a small private /tmp for the run (noexec).
# 2. Copy the harness in, then hide host data: /mnt (Windows drives, including
#    this project's .env), /home, /root, /run (WSL interop socket) and other
#    writable locations.
# 3. Enter a nested user namespace with no uid mapping. The code runs as an
#    unprivileged "nobody" user, and the masking mounts become locked so the
#    sandboxed code cannot unmount them.
set -eu

RUNNER_SRC="$1"

mount -t tmpfs -o size=32m,mode=1777,nosuid,nodev,noexec tmpfs /tmp
mkdir -m 755 /tmp/.dsaforge
cp "$RUNNER_SRC" /tmp/.dsaforge/runner.py
chmod 444 /tmp/.dsaforge/runner.py

for dir in /mnt /home /root /run /srv /media /opt /var/tmp /var/log /dev/shm /snap; do
  if [ -d "$dir" ]; then
    mount -t tmpfs -o size=1m,mode=755,nosuid,nodev,noexec tmpfs "$dir"
  fi
done

cd /tmp
exec env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HOME=/tmp \
  unshare --user --mount -- python3 -I -B /tmp/.dsaforge/runner.py
