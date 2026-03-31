#!/bin/bash
# Export all data from a running rag-deploy instance.
# Run this ON the production server, inside the rag-deploy directory.
#
# Usage: ./scripts/export.sh [backup-dir]
# Output: backup/ directory with db.sql.gz, lightrag-data.tar.gz, chat-files.tar.gz, kb-files.tar.gz
set -euo pipefail

BACKUP_DIR="${1:-./backup}"
mkdir -p "$BACKUP_DIR"

echo "=== Exporting PostgreSQL ==="
docker compose --profile prod exec -T postgres \
  pg_dump -U raguser --clean --if-exists lightrag \
  | gzip > "$BACKUP_DIR/db.sql.gz"
echo "  -> db.sql.gz"

echo "=== Exporting lightrag graph data ==="
docker compose --profile prod exec -T lightrag \
  tar czf - -C /app/data . \
  > "$BACKUP_DIR/lightrag-data.tar.gz"
echo "  -> lightrag-data.tar.gz"

echo "=== Exporting chat files ==="
if docker compose --profile prod exec -T rag-ui test -d /app/data/chat-files 2>/dev/null; then
  docker compose --profile prod exec -T rag-ui \
    tar czf - -C /app/data/chat-files . \
    > "$BACKUP_DIR/chat-files.tar.gz"
  echo "  -> chat-files.tar.gz"
else
  echo "  (no chat-files directory, skipping)"
fi

echo "=== Exporting kb files ==="
if docker compose --profile prod exec -T rag-ui test -d /app/data/kb-files 2>/dev/null; then
  docker compose --profile prod exec -T rag-ui \
    tar czf - -C /app/data/kb-files . \
    > "$BACKUP_DIR/kb-files.tar.gz"
  echo "  -> kb-files.tar.gz"
else
  echo "  (no kb-files directory, skipping)"
fi

echo ""
echo "=== Export complete ==="
ls -lh "$BACKUP_DIR/"
echo ""
echo "Transfer to new machine:  scp -r $BACKUP_DIR newhost:~/rag-deploy/backup"
echo "Then run:                 ./scripts/import.sh $BACKUP_DIR"
