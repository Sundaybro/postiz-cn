#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_ROOT="$PROJECT_ROOT/.local"
if [ ! -s "$ENV_ROOT/node-home" ]; then
  echo 'Run bash scripts/local/bootstrap.sh first.' >&2
  exit 1
fi
NODE_HOME="$(cat "$ENV_ROOT/node-home")"
case "$NODE_HOME" in "$ENV_ROOT/runtime/"*) ;; *) echo 'Invalid project runtime path' >&2; exit 1 ;; esac
export PATH="$NODE_HOME/bin:$ENV_ROOT/pnpm/node_modules/.bin:$PATH"
export npm_config_cache="$ENV_ROOT/cache/npm"
export XDG_CACHE_HOME="$ENV_ROOT/cache"
export COREPACK_HOME="$ENV_ROOT/cache/corepack"
export PNPM_HOME="$ENV_ROOT/pnpm"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
cd "$PROJECT_ROOT"
if [ "${1:-}" = pnpm ]; then
  shift
  exec "$NODE_HOME/bin/node" "$ENV_ROOT/pnpm/node_modules/pnpm/bin/pnpm.cjs" "$@"
fi
exec "$@"
