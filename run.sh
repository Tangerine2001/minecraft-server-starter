#!/bin/bash
set -euo pipefail

# ---------- Load .env (robustly, supports values with =, no spaces in keys) ----------
if [ -f .env ]; then
  set -
  # shellcheck disable=SC1091
  . ./.env
  set +a
else
  echo "❌ No .env file found!"
  exit 1
fi

# ---------- Ensure Java 21 (macOS-friendly, works elsewhere if PATH already set) ----------
ensure_java21() {
  if java -version 2>&1 | grep -q 'version "21'; then
    return
  fi

  # macOS helper
  if command -v /usr/libexec/java_home >/dev/null 2>&1; then
    if JAVA21_HOME=$(/usr/libexec/java_home -v 21 2>/dev/null); then
      export JAVA_HOME="$JAVA21_HOME"
      export PATH="$JAVA_HOME/bin:$PATH"
      echo "🔧 Using Java from: $JAVA_HOME"
      return
    fi
  fi

  # Homebrew default path on Apple Silicon
  if [ -x "/opt/homebrew/opt/openjdk@21/bin/java" ]; then
    export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
    echo "🔧 Using Java from Homebrew openjdk@21"
    return
  fi

  # If we got here, fall back to whatever is on PATH; error if not 21
  if ! java -version 2>&1 | grep -q 'version "21'; then
    echo "❌ Java 21 not found. Please install it first (e.g., brew install openjdk@21, apt install openjdk-21-jre-headless)."
    exit 1
  fi
}
ensure_java21

# ---------- Basic config ----------
WORLD_NAME="${WORLD_NAME:-}"
if [ -z "$WORLD_NAME" ]; then
  echo "❌ WORLD_NAME not set in .env"
  exit 1
fi

WORLD_PATH="worlds/${WORLD_NAME}"
MEMORY="${MEMORY:-4G}"

BACKUP_ON_STOP="${BACKUP_ON_STOP:-FALSE}"
BACKUP_INTERVAL="${BACKUP_INTERVAL:-24h}"
BACKUP_DIR="backups"
LAST_BACKUP_FILE="${BACKUP_DIR}/.last_backup_${WORLD_NAME}"

mkdir -p "$BACKUP_DIR"

# ---------- Interval parsing: supports s, m, h, d, w ----------
parse_interval_to_seconds() {
  local val="$1"
  local num unit
  num="${val%[smhdw]}"   # numeric part
  unit="${val#$num}"     # last char (unit)
  case "$unit" in
    s) echo $((num));;
    m) echo $((num * 60));;
    h) echo $((num * 3600));;
    d) echo $((num * 86400));;
    w) echo $((num * 604800));;
    *) 
      # If no unit or unknown, try as seconds
      if [[ "$val" =~ ^[0-9]+$ ]]; then
        echo "$val"
      else
        # default to hours if given like "48h" without being caught above (shouldn't happen)
        echo 0
      fi
      ;;
  esac
}

should_backup_now() {
  [ "$BACKUP_ON_STOP" = "TRUE" ] || return 1
  local now last interval_s delta
  interval_s=$(parse_interval_to_seconds "$BACKUP_INTERVAL")
  if [ "$interval_s" -le 0 ]; then
    # If parsing failed, default to always backup
    return 0
  fi
  now=$(date +%s)
  if [ ! -f "$LAST_BACKUP_FILE" ]; then
    return 0
  fi
  last=$(cat "$LAST_BACKUP_FILE" 2>/dev/null || echo 0)
  delta=$((now - last))
  [ "$delta" -ge "$interval_s" ]
}

do_backup() {
  # Skip if the world folder doesn't exist yet
  if [ ! -d "$WORLD_PATH" ]; then
    return 0
  fi

  local ts archive now
  ts="$(date +%Y%m%d-%H%M%S)"
  archive="${BACKUP_DIR}/${WORLD_NAME}-${ts}.tar.gz"
  echo "🗄️  Creating backup: ${archive}"
  # Use --hard-dereference to be safe with symlinks; relative path tar to avoid leading directories
  tar -czf "$archive" -C "$(dirname "$WORLD_PATH")" "$(basename "$WORLD_PATH")"
  now=$(date +%s)
  echo "$now" > "$LAST_BACKUP_FILE"
  echo "✅ Backup complete."
}

do_backup_if_needed() {
  if should_backup_now; then
    do_backup
  else
    echo "ℹ️  Skipping backup (interval not reached or backups disabled)."
  fi
}

do_backup_on_stop() {
  # Only respect BACKUP_ON_STOP toggle; ignore interval here
  if [ "$BACKUP_ON_STOP" = "TRUE" ]; then
    do_backup
  else
    echo "ℹ️  Backups disabled on stop (BACKUP_ON_STOP != TRUE)."
  fi
}

# ---------- Create world folder (with confirmation if missing) ----------
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

# ---------- Auto-detect newest server JAR ----------
SERVER_JAR=$(ls -t *.jar 2>/dev/null | grep -vE '(\.old|\.bak)\.jar$' | head -n 1 || true)
if [ -z "$SERVER_JAR" ]; then
  echo "❌ No Minecraft server JAR found in current directory."
  exit 1
fi

echo "✅ Using server JAR: $SERVER_JAR"
echo "✅ Starting Minecraft server with world: $WORLD_NAME"
echo "📂 Path: $WORLD_PATH"

# ---------- EULA handling ----------
if [ "${EULA:-}" = "TRUE" ]; then
  echo "eula=true" > eula.txt
fi

# ---- Per-world server.properties sync ----
WORLD_PROPS="worlds/${WORLD_NAME}/server.properties"
if [ -f "$WORLD_PROPS" ]; then
  echo "🧩 Using per-world server.properties from $WORLD_PROPS"
  cp "$WORLD_PROPS" ./server.properties
else
  echo "ℹ️  No per-world server.properties at $WORLD_PROPS (using existing ./server.properties if present)"
fi


# ---------- Run server in foreground, forward signals, then backup on stop ----------
# Start Java as a child process (no 'exec') so we can run post-exit logic
JAVA_CMD=(java "-Xmx${MEMORY}" "-Xms${MEMORY}" -jar "$SERVER_JAR" --world "$WORLD_PATH")

server_pid=""
cleanup_and_backup() {
  # Trap path: user hit Ctrl+C or process got SIGTERM
  if [ -n "${server_pid:-}" ] && kill -0 "$server_pid" 2>/dev/null; then
    echo "⏹️  Stopping server..."
    kill -TERM "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  # Always back up on stop (respecting BACKUP_ON_STOP toggle, but ignoring interval)
  do_backup_on_stop
  exit 0
}
trap cleanup_and_backup INT TERM

echo "✅ Using server JAR: $SERVER_JAR"
echo "✅ Starting Minecraft server with world: $WORLD_NAME"
echo "📂 Path: $WORLD_PATH"

"${JAVA_CMD[@]}" &
server_pid=$!
wait "$server_pid"
exit_code=$?

# Normal shutdown path (e.g., you typed 'stop' in the console)
do_backup_on_stop
exit "$exit_code"

