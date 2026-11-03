#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
bash scripts/local/bootstrap.sh
bash scripts/local/run.sh pnpm install --frozen-lockfile --ignore-scripts
bash scripts/local/run.sh node scripts/local/setup-env.mjs
bash scripts/local/run.sh pnpm exec prisma generate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
"${LOCAL_BOOTSTRAP_PYTHON:-python3}" scripts/local/download-services.py
bash scripts/local/run.sh node scripts/local/setup-connectors.mjs
bash scripts/local/build.sh
printf '%s\n' 'Ready. Start: bash scripts/local/run.sh node scripts/local/control.mjs start'
