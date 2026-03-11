#!/bin/bash
set -e

REMOTE_USER="zwg"
REMOTE_HOST="192.168.0.106"
REMOTE_DIR="/home/$REMOTE_USER/rag-deploy"
TAR_FILE="rag-deploy-images.tar"

echo "=== Build images ==="
docker compose --profile prod build

echo "=== Save images ==="
docker save -o "$TAR_FILE" rag-deploy-lightrag:latest rag-deploy-ui:latest

echo "=== Sync files to Orange Pi ==="
ssh "$REMOTE_USER@$REMOTE_HOST" "mkdir -p $REMOTE_DIR/seed-data"

# Sync compose, init.sql, seed-data, .env
rsync -avz --delete \
  docker-compose.yml init.sql .env seed-data/ \
  "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/"

# Fix seed-data path (rsync flattens it)
ssh "$REMOTE_USER@$REMOTE_HOST" "mkdir -p $REMOTE_DIR/seed-data"
rsync -avz seed-data/ "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/seed-data/"

echo "=== Transfer images (~may take a minute) ==="
scp "$TAR_FILE" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/"

echo "=== Deploy on Orange Pi ==="
ssh "$REMOTE_USER@$REMOTE_HOST" << EOF
  cd $REMOTE_DIR

  # Load custom images
  docker load -i $TAR_FILE
  rm $TAR_FILE

  # Pull public images (postgres, valkey) + start everything
  docker compose --profile prod pull postgres valkey
  docker compose --profile prod up -d

  echo ""
  echo "=== Status ==="
  docker compose --profile prod ps
EOF

# Clean up local tar
rm "$TAR_FILE"

echo ""
echo "=== Done! ==="
echo "http://$REMOTE_HOST:4002"
