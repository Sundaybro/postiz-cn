#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"
export POSTIZ_LOCAL=true
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3584}"
bash scripts/local/run.sh pnpm --filter ./apps/backend run build
bash scripts/local/run.sh pnpm --filter ./apps/orchestrator run build
export NODE_OPTIONS="${LOCAL_FRONTEND_BUILD_NODE_OPTIONS:---max-old-space-size=5120}"
bash scripts/local/run.sh pnpm --filter ./apps/frontend exec dotenv -e ../../.env -- next build --webpack
