#!/bin/bash
set -euo pipefail

# ---- Load .env ----
if [ -f .env ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' .env | xargs)
else
  echo "❌ No .env file found!"
  exit 1
fi

# ---- Ensure Java 21 is used (macOS-friendly) ----
ensure_java21() {
  # If current java is 21 already, we're good
  if java -version 2>&1 | grep -q 'version "21'; then
    return
  fi

  # Try to locate a 21 JDK installed on macOS
  if command -v /usr/libexec/java_home >/dev/null 2>&1; then
    if JAVA21_HOME=$(/usr/libexec/java_home -v 21 2>/dev/null); then
      export JAVA_HOME="$JAVA21_HOME"
      export PATH="$JAVA_HOME/bin:$PATH"
      echo "🔧 Using Java from: $JAVA_HOME"
      return
    fi
  fi

  # Fallback: if Homebrew has it on Apple Silicon default path
  if [ -x "/opt/homebrew/opt/openjdk@21/bin/java" ]; then
    export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
    echo "🔧 Using Java from Homebrew openjdk@21"
    return
  fi

  echo "❌ Java 21 not found. Install it, e.g.:"
  echo "   brew install openjdk@21"
  exit 1
}
ensure_java21

# ---- Basic config ----
if [ -z "${WORLD_NAME:-}" ]; then
  echo "❌ WORLD_NAME not set in .env"
  exit 1
fi

WORLD_PATH="worlds/${WORLD_NAME}"
MEMORY="${MEMORY:-4G}"

# ---- Create world folder (with confirmation if missing) ----
if [ ! -d "$WORLD_PATH" ]; then
  echo "⚠️  World '$WORLD_NAME' does not exist."
  read -rp "Do you want to create a new world at '$WORLD_PATH'? (y/N) " answer
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    echo "❌ Aborting."
    exit 1
  fi
  echo "🌱 Creating new world directory..."
  mkdir -p "$WORLD_PATH"
fi

# ---- Auto-detect newest server JAR ----
SERVER_JAR=$(ls -t *.jar 2>/dev/null | grep -vE '(\.old|\.bak)\.jar$' | head -n 1 || true)
if [ -z "$SERVER_JAR" ]; then
  echo "❌ No Minecraft server JAR found in current directory."
  exit 1
fi

echo "✅ Using server JAR: $SERVER_JAR"
echo "✅ Starting Minecraft server with world: $WORLD_NAME"
echo "📂 Path: $WORLD_PATH"

# ---- EULA handling ----
# If EULA=TRUE in .env, write eula.txt so first run won’t fail
if [ "${EULA:-}" = "TRUE" ]; then
  echo "eula=true" > eula.txt
fi

# ---- Launch server (Fabric/Vanilla/Spigot all fine) ----
exec java -Xmx"$MEMORY" -Xms"$MEMORY" -jar "$SERVER_JAR" nogui --world "$WORLD_PATH"
