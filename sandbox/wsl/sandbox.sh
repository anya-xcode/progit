#!/bin/sh
# DSAForge WSL sandbox — stage 1 (runs as the normal WSL user).
#
# Creates fresh user, mount, network, PID, IPC and UTS namespaces, then hands
# over to inner.sh. No root or sudo is required.
#   - network namespace: no interfaces, so no network access
#   - PID namespace: sandboxed code cannot see or signal host processes
#   - timeout + --kill-child: the whole tree dies if a run hangs
#
# Usage: sh sandbox.sh <path-to-runner.py>   (JSON payload on stdin)
set -eu

HERE=$(dirname "$0")
RUNNER="$1"
MAX_SECONDS="${DSAFORGE_SANDBOX_MAX_SECONDS:-90}"

exec timeout -s KILL "$MAX_SECONDS" \
  unshare --user --map-root-user --mount --net --pid --ipc --uts --fork --kill-child --mount-proc \
  sh "$HERE/inner.sh" "$RUNNER"
