#!/bin/bash
# Import backup data into a fresh rag-deploy instance.
# Run this on the NEW machine, inside the rag-deploy directory.
#
# Prerequisites: images must be built already
#   docker compose --profile prod --profile build build
#
# Usage: ./scripts/import.sh [backup-dir]
set -euo pipefail

BACKUP_DIR="${1:-./backup}"

if [ ! -f "$BACKUP_DIR/db.sql.gz" ]; then
  echo "Error: $BACKUP_DIR/db.sql.gz not found"
  echo "Usage: $0 [backup-dir]"
  exit 1
fi

echo "=== Step 1: Start postgres + valkey ==="
docker compose up -d postgres valkey
echo "Waiting for postgres to be healthy..."
until docker compose exec -T postgres pg_isready -U raguser -d lightrag 2>/dev/null; do
  sleep 1
done
echo "  postgres ready"

echo "=== Step 2: Restore database ==="
gunzip -c "$BACKUP_DIR/db.sql.gz" \
  | docker compose exec -T postgres psql -U raguser -d lightrag --quiet
echo "  database restored"

echo "=== Step 3: Start all services ==="
docker compose --profile prod up -d
echo "Waiting for services..."
sleep 5

echo "=== Step 4: Restore lightrag graph data ==="
if [ -f "$BACKUP_DIR/lightrag-data.tar.gz" ]; then
  docker compose --profile prod exec -T lightrag \
    tar xzf - -C /app/data < "$BACKUP_DIR/lightrag-data.tar.gz"
  echo "  lightrag data restored"
fi

echo "=== Step 5: Restore chat files ==="
if [ -f "$BACKUP_DIR/chat-files.tar.gz" ]; then
  docker compose --profile prod exec -T rag-ui \
    tar xzf - -C /app/data/chat-files < "$BACKUP_DIR/chat-files.tar.gz"
  echo "  chat files restored"
fi

echo "=== Step 6: Restore kb files ==="
if [ -f "$BACKUP_DIR/kb-files.tar.gz" ]; then
  docker compose --profile prod exec -T rag-ui \
    tar xzf - -C /app/data/kb-files < "$BACKUP_DIR/kb-files.tar.gz"
  echo "  kb files restored"
fi

echo "=== Step 7: Restart lightrag to pick up graph data ==="
docker compose --profile prod restart lightrag
echo "  lightrag restarted"

echo ""
echo "=== Import complete ==="
docker compose --profile prod ps
