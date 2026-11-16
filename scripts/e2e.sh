#!/usr/bin/env bash
# Build the web app, serve it, and run every browser end-to-end suite.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${E2E_DIST:-dist-e2e}"
EXPO_OFFLINE=1 CI=1 npx expo export --platform web --output-dir "$OUT" >/dev/null
node e2e/serve.mjs "$OUT" 8081 >/dev/null 2>&1 &
SERVE=$!
trap 'kill $SERVE' EXIT
sleep 1
status=0
for suite in phase1 phase2 phase3 phase4 phase5 capture editing; do
  echo "== $suite"
  node "e2e/$suite.e2e.cjs" || status=1
done
exit $status
