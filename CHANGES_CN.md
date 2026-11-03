# Chinese local adaptation changes

## 2026-10-28 — Development preview

- Preserve Postiz's AGPL-3.0 license, source attribution and original README.
- Add integrity-checked project-local Node, pnpm and native service bootstraps, with domestic download mirrors.
- Add loopback-only process supervision, isolated data/configuration and serial builds. Only the main, Xiaohongshu and Fanqie task queues are enabled in local mode.
- Add authenticated TypeScript bridge, managed-media validation, timezone-aware scheduling checks and persistent task deduplication.
- Add Xiaohongshu image-note and Fanqie existing-novel single-chapter adapters and Postiz providers.
- Add Chinese local onboarding, platform settings, explicit AI declaration, invalidation of confirmation after edits, and UTF-8 TXT chapter import.
- Include fixed connector source snapshots and their licenses under third_party; runtime installs and credentials remain excluded.
- Disable Sentry's build wrapper/source maps in local mode; externalize the server DOM sanitizer to preserve its runtime assets.

Backend, orchestrator and frontend production builds have passed on macOS Apple Silicon. Native service startup and the local registration page have been verified. Offline tests do not establish that real-account publishing works. No real content was published during development.

Fanqie submission remains pending manual review; automatic approval-state reconciliation and real account publishing acceptance are not complete.
