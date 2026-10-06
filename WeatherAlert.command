#!/bin/bash
# WeatherAlert launcher for macOS / Linux - runs the app from source (installs dependencies on first run).
# Double-click in Finder, or run:  bash WeatherAlert.command
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install it from https://nodejs.org (LTS) or with Homebrew: brew install node"
  read -r -p "Press Enter to close." _
  exit 1
fi

major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 18 ]; then
  echo "Node.js $(node -v) is too old; WeatherAlert needs Node 18 or newer."
  read -r -p "Press Enter to close." _
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only)..."
  npm install --no-audit --no-fund || { echo "npm install failed."; read -r -p "Press Enter to close." _; exit 1; }
fi

# The Electron download can be skipped or fail silently during npm install; fetch it if it is missing.
node tools/ensure-electron.js || { read -r -p "Press Enter to close." _; exit 1; }

echo "Starting WeatherAlert..."
exec node_modules/.bin/electron .
