#!/usr/bin/env bash
# Static export of the demo + documentation for GitHub Pages (Simulation mode only).
#
# A static export can't contain the /api/chain route (it reads POST requests and holds
# the gateway key), so the route is moved aside for the build and always restored.
#
# Usage: NEXT_PUBLIC_BASE_PATH=/<repo-name> pnpm build:pages   -> out/
set -euo pipefail
cd "$(dirname "$0")/.."

stash="$(mktemp -d)"
restore() {
  if [ -d "$stash/api" ]; then
    rm -rf app/api
    mv "$stash/api" app/api
  fi
  rm -rf "$stash"
}
trap restore EXIT

mv app/api "$stash/api"
STATIC_EXPORT=true NEXT_PUBLIC_STATIC_DEMO=true pnpm exec next build
touch out/.nojekyll
echo "Static site written to out/ (base path: '${NEXT_PUBLIC_BASE_PATH:-}')"
