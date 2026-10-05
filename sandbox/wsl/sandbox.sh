#!/bin/sh
# DSAForge namespace sandbox — stage 1 (runs as the normal, unprivileged user).
#
# Creates fresh user, mount, network, PID, IPC and UTS namespaces, then hands
# over to inner.sh. No root or sudo is required.
#   - network namespace: no interfaces, so no network access
#   - PID namespace: sandboxed code cannot see or signal host processes
#   - timeout + --kill-child: the whole tree dies if a run hangs
#
# Reduced mode. Some container hosts (Render, most Kubernetes platforms) let a
# container create namespaces but deny every mount(2) call, so the jail above
# dies with "unshare: cannot change root filesystem propagation: Permission
# denied". With DSAFORGE_SANDBOX_ALLOW_REDUCED=1 the run then uses the same
# namespaces minus the mount one: still no network, no capabilities and no
# access to other processes, but the code sees the container's own files.
# Set it only where the container itself is the filesystem boundary (the
# Dockerfile does) — never on a workstation, where /mnt and /home must stay
# hidden.
#
# Usage: sh sandbox.sh <path-to-runner.py>   (JSON payload on stdin)
set -eu

HERE=$(dirname "$0")
RUNNER="$1"
MAX_SECONDS="${DSAFORGE_SANDBOX_MAX_SECONDS:-90}"
NAMESPACES="--net --pid --ipc --uts --fork --kill-child"

if [ "${DSAFORGE_SANDBOX_ALLOW_REDUCED:-0}" = 1 ] &&
  ! unshare --user --map-root-user --mount $NAMESPACES --mount-proc true </dev/null >/dev/null 2>&1; then
  # No uid mapping: the code runs as "nobody" with no capabilities. The
  # environment is cleared before the namespaces exist, so no process that
  # shares them still carries the API's secrets.
  exec env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HOME=/tmp \
    timeout -s KILL "$MAX_SECONDS" \
    unshare --user $NAMESPACES \
    python3 -I -B "$RUNNER"
fi

exec timeout -s KILL "$MAX_SECONDS" \
  unshare --user --map-root-user --mount $NAMESPACES --mount-proc \
  sh "$HERE/inner.sh" "$RUNNER"
