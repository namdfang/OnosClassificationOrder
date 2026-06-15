#!/bin/bash
set -euo pipefail

# ============ CONFIG ============
USER_NAME="namdfang"
BACKUP_DIR="/home/$USER_NAME/db_backups"
CONTAINER_NAME="printsel-mongodb"
DB_NAME="printsel"
REMOTE_NAME="ggdrive"
REMOTE_DIR="backupDbPrintsel"
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d_%H-%M-%S)
# ================================

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/mongo_${DB_NAME}_${DATE}.archive.gz"

echo "[$(date)] ⏳ Starting mongodump for $DB_NAME"

docker exec "$CONTAINER_NAME" mongodump --db="$DB_NAME" --archive --gzip > "$BACKUP_FILE"

if [ ! -s "$BACKUP_FILE" ]; then
  echo "❌ Backup file is empty — failed"
  rm -f "$BACKUP_FILE"
  exit 1
fi

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Dump OK — $BACKUP_FILE ($SIZE)"

echo "⏫ Uploading to Drive..."
rclone copy "$BACKUP_FILE" "$REMOTE_NAME:$REMOTE_DIR" -v

echo "🧹 Cleaning local files older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -type f -name "mongo_${DB_NAME}_*.archive.gz" -mtime +$RETENTION_DAYS -exec rm {} \;

echo "[$(date)] 🎉 Done"
