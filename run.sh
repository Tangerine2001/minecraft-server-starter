#!/bin/bash
set -euo pipefail

# Args: ./run_server.sh <world_name> <memory> [server_jar]
WORLD_NAME="${1:-}"
MEMORY="${2:-4G}"
SERVER_JAR="${3:-}"

if [ -z "$WORLD_NAME" ]; then
  echo "Usage: $0 <world_name> <memory> [server_jar]"
  exit 1
fi

WORLD_PATH="worlds/${WORLD_NAME}"
mkdir -p "$WORLD_PATH"

# Find newest server JAR if not provided
if [ -z "$SERVER_JAR" ]; then
  SERVER_JAR=$(ls -t *.jar 2>/dev/null | head -n 1 || true)
fi
if [ -z "$SERVER_JAR" ]; then
  echo "No Minecraft server JAR found."
  exit 1
fi

# Run server
java "-Xmx${MEMORY}" "-Xms${MEMORY}" -jar "$SERVER_JAR" nogui --world "$WORLD_PATH"
