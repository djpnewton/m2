#!/usr/bin/env bash
# Serve the page with caching disabled. Usage: ./scripts/run.sh [port]
set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 scripts/nocache-server.py "${1:-${PORT:-8080}}"
