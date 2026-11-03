#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [ ! -x "$PROJECT_ROOT/.local/python/bin/python" ]; then
  echo 'Xiaohongshu environment not installed; see LOCAL_BUILD.md.' >&2
  exit 1
fi
exec "$PROJECT_ROOT/.local/python/bin/python" "$PROJECT_ROOT/scripts/local/xhs-entry.py" "$@"
