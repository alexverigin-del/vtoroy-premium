#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/isvoi}"
STACK_DIR="${STACK_DIR:-$REPO_ROOT/infra/directus-beget}"
HEALTH_URL="${DIRECTUS_HEALTH_URL:-http://127.0.0.1:8055/server/health}"

if [ ! -f "$STACK_DIR/docker-compose.yml" ]; then
  echo "Directus compose file not found: $STACK_DIR/docker-compose.yml" >&2
  exit 1
fi

cd "$STACK_DIR"

lua_script="local cursor='0'; local deleted=0; repeat local result=redis.call('SCAN',cursor,'MATCH','permissions:*','COUNT',200); cursor=result[1]; for _,key in ipairs(result[2]) do deleted=deleted+redis.call('DEL',key); end; until cursor=='0'; return deleted"
deleted="$(docker compose exec -T cache redis-cli --raw EVAL "$lua_script" 0)"

if ! [[ "$deleted" =~ ^[0-9]+$ ]]; then
  echo "Unexpected Redis response: $deleted" >&2
  exit 1
fi

echo "Deleted Directus permission cache keys: $deleted"
docker compose restart directus

for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    echo "Directus health: ok"
    exit 0
  fi
  sleep 2
done

echo "Directus did not become healthy: $HEALTH_URL" >&2
exit 1
