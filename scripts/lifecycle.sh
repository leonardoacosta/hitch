#!/usr/bin/env bash
# Install -> upgrade -> uninstall the VSIX into a throwaway extensions dir using a
# VS Code-compatible server CLI, and verify an unrelated live process survives every step.
# Usage: scripts/lifecycle.sh <server-cli> <vsix>
set -euo pipefail
cli=$1 vsix=$2
dir=$(mktemp -d); trap 'kill "$work" 2>/dev/null || true; rm -rf "$dir"' EXIT
sleep 600 & work=$!
x() { "$cli" --extensions-dir "$dir/ext" "$@" 2>&1; }
alive() { kill -0 "$work" || { echo "FAIL: work pid died after $1"; exit 1; }; }
x --install-extension "$vsix" | grep -q "successfully installed" || { echo "FAIL install"; exit 1; }
x --list-extensions --show-versions | grep -q "^leonardoacosta.hitch@" || { echo "FAIL list"; exit 1; }; alive install
x --install-extension "$vsix" --force | grep -qi "successfully installed" || { echo "FAIL upgrade"; exit 1; }; alive upgrade
x --uninstall-extension leonardoacosta.hitch | grep -qi "successfully uninstalled" || { echo "FAIL uninstall"; exit 1; }
! x --list-extensions | grep -q "leonardoacosta.hitch" || { echo "FAIL still listed"; exit 1; }; alive uninstall
echo "lifecycle OK"
