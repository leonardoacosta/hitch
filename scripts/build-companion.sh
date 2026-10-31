#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
npx esbuild src/companion/main.ts --bundle --platform=node --format=cjs --outfile=dist/companion.js
