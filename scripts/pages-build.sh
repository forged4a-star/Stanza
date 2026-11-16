#!/usr/bin/env bash
# Build the web app for hosting in a sub-folder (GitHub Pages: /Stanza) into $1 (default dist-pages).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-dist-pages}"
export EXPO_BASE_URL="${EXPO_BASE_URL:-/Stanza}"
CI=1 npx expo export --platform web --output-dir "$OUT"
# offline file list, version name, 404.html and .nojekyll for GitHub Pages
BUILD_ID="${BUILD_ID:-$(date +%s)}" node scripts/finish-web.mjs "$OUT"
