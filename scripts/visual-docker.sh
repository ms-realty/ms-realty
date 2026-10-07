#!/usr/bin/env bash
set -euo pipefail

# Baselines and comparisons use the same Linux browser/font environment locally and in CI.
# The image version must equal the pinned @playwright/test dependency.
task_root="$(cd "$(dirname "$0")/.." && pwd)"
test_mode="${1:-check}"
case "$test_mode" in
  check) snapshot_args=() ;;
  update) snapshot_args=(--update-snapshots) ;;
  *) printf '%s\n' 'Usage: scripts/visual-docker.sh [check|update]' >&2; exit 2 ;;
esac

docker run --rm --init --ipc=host \
  --mount "type=bind,source=$task_root,target=/workspace" \
  --mount type=volume,destination=/workspace/node_modules \
  --workdir /workspace \
  --env CI=1 \
  --env PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -euc 'npm ci; npm run storybook:build; npx playwright test --config playwright.visual.config.ts --workers=2 "$@"' \
  bash "${snapshot_args[@]}"
