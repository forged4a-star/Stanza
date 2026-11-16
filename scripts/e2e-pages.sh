#!/usr/bin/env bash
# Build the web app the way GitHub Pages hosts it (in /Stanza), serve it like Pages does, and run the hosting test.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${E2E_PAGES_DIST:-dist-pages}"
EXPO_OFFLINE=1 BUILD_ID=e2e scripts/pages-build.sh "$OUT" >/dev/null
node e2e/serve-pages.mjs "$OUT" 8082 /Stanza >/dev/null 2>&1 &
SERVE=$!
trap 'kill $SERVE' EXIT
sleep 1
node e2e/pages.e2e.cjs
