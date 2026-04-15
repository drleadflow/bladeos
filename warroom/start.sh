#!/bin/bash
# Start the Blade War Room voice server
#
# Prerequisites:
#   cd warroom && pip install -r requirements.txt
#
# Usage:
#   ./warroom/start.sh
#
# Environment:
#   GEMINI_API_KEY — required for Gemini Live speech-to-speech
#   WARROOM_PORT   — server port (default: 7860)
#   WARROOM_MODE   — "live" (default) or "legacy"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load .env from project root
if [ -f "$PROJECT_ROOT/.env" ]; then
  export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)
fi

# Check GEMINI_API_KEY
if [ -z "$GEMINI_API_KEY" ]; then
  echo "ERROR: GEMINI_API_KEY not set. Add it to your .env file."
  exit 1
fi

echo "Starting Blade War Room..."
echo "  Mode: ${WARROOM_MODE:-live}"
echo "  Port: ${WARROOM_PORT:-7860}"
echo ""
echo "Connect at: ws://localhost:${WARROOM_PORT:-7860}"
echo "Dashboard:  http://localhost:3000/war-room"
echo ""

cd "$SCRIPT_DIR"
python server.py
