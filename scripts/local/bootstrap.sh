#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_ROOT="$PROJECT_ROOT/.local"
NODE_VERSION=22.23.4
PNPM_VERSION=10.6.1
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) NODE_PLATFORM=darwin-arm64 ;;
  Darwin-x86_64) NODE_PLATFORM=darwin-x64 ;;
  Linux-x86_64) NODE_PLATFORM=linux-x64 ;;
  Linux-aarch64) NODE_PLATFORM=linux-arm64 ;;
  *) echo 'Unsupported platform' >&2; exit 1 ;;
esac
mkdir -p "$ENV_ROOT/downloads" "$ENV_ROOT/runtime" "$ENV_ROOT/cache/npm" "$ENV_ROOT/data" "$ENV_ROOT/logs"
NODE_NAME="node-v$NODE_VERSION-$NODE_PLATFORM"
NODE_HOME="$ENV_ROOT/runtime/$NODE_NAME"
if [ ! -x "$NODE_HOME/bin/node" ]; then
  "${LOCAL_BOOTSTRAP_PYTHON:-python3}" "$PROJECT_ROOT/scripts/local/download.py" node "$NODE_VERSION" "$NODE_PLATFORM" "$ENV_ROOT/downloads/$NODE_NAME.tar.gz"
  tar -xzf "$ENV_ROOT/downloads/$NODE_NAME.tar.gz" -C "$ENV_ROOT/runtime"
fi
export PATH="$NODE_HOME/bin:$PATH"
export npm_config_cache="$ENV_ROOT/cache/npm"
if [ ! -f "$ENV_ROOT/pnpm/node_modules/pnpm/bin/pnpm.cjs" ]; then
  "${LOCAL_BOOTSTRAP_PYTHON:-python3}" "$PROJECT_ROOT/scripts/local/download.py" pnpm "$PNPM_VERSION" unused "$ENV_ROOT/downloads/pnpm-$PNPM_VERSION.tgz"
  mkdir -p "$ENV_ROOT/pnpm/node_modules/pnpm" "$ENV_ROOT/pnpm/node_modules/.bin"
  tar -xzf "$ENV_ROOT/downloads/pnpm-$PNPM_VERSION.tgz" -C "$ENV_ROOT/pnpm/node_modules/pnpm" --strip-components=1
  ln -sf ../pnpm/bin/pnpm.cjs "$ENV_ROOT/pnpm/node_modules/.bin/pnpm"
fi
printf '%s\n' "$NODE_HOME" > "$ENV_ROOT/node-home"
printf 'Project Node: '; "$NODE_HOME/bin/node" --version
printf 'Project pnpm: '; "$NODE_HOME/bin/node" "$ENV_ROOT/pnpm/node_modules/pnpm/bin/pnpm.cjs" --version
