#!/bin/bash

# Backup script for Minecraft world
# This script is called by cron every 48 hours and by the management script on shutdown

if [ -z "$WORLD_NAME" ]; then
    echo "Error: WORLD_NAME environment variable not set"
    exit 1
fi

DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/backups/${WORLD_NAME}"
WORLD_DIR="/worlds/${WORLD_NAME}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if world directory exists
if [ ! -d "$WORLD_DIR" ]; then
    echo "Warning: World directory $WORLD_DIR does not exist"
    exit 1
fi

# Create backup filename with date
BACKUP_FILE="${BACKUP_DIR}/${WORLD_NAME}_${DATE}.tar.gz"

# If backup for today already exists, append time to make it unique
if [ -f "$BACKUP_FILE" ]; then
    TIME=$(date +%H-%M-%S)
    BACKUP_FILE="${BACKUP_DIR}/${WORLD_NAME}_${DATE}_${TIME}.tar.gz"
fi

echo "Creating backup: $BACKUP_FILE"

# Create compressed backup
if tar -czf "$BACKUP_FILE" -C "/worlds" "$WORLD_NAME"; then
    echo "Backup created successfully: $BACKUP_FILE"
    
    # Keep only the last 10 backups to save disk space
    cd "$BACKUP_DIR"
    ls -t ${WORLD_NAME}_*.tar.gz | tail -n +11 | xargs -r rm
    echo "Old backups cleaned up (keeping last 10)"
else
    echo "Error: Failed to create backup"
    exit 1
fi