#!/bin/sh
# Copy seed graph file on first startup (when data dir is empty)
if [ -f /app/seed/graph_chunk_entity_relation.graphml ] && [ ! -f /app/data/graph_chunk_entity_relation.graphml ]; then
  echo "Seeding knowledge graph from seed data..."
  cp /app/seed/graph_chunk_entity_relation.graphml /app/data/
fi

exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8007
