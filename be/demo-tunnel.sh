#!/bin/sh
# Demo mode: run the ClipCraft backend locally in Docker and expose it publicly
# via a Cloudflare quickstart tunnel. $0 cost, no accounts needed.
# Usage: ./demo-tunnel.sh   (stop with Ctrl+C)
# Your laptop + Docker must stay on while the demo is live.
set -e
cd "$(dirname "$0")"

echo "==> starting backend (image: clipcraft-be)"
# docker --env-file rejects 'KEY = value' spacing: sanitize to a temp file
CLEAN_ENV=$(mktemp)
# docker --env-file wants stark KEY=value: no spaces, no quotes, no CR (dotenv strips them, docker does not)
python3 - <<'PYEOF' > "$CLEAN_ENV"
for raw in open('.env', encoding='utf-8-sig'):
    line = raw.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue
    k, v = line.split('=', 1)
    print(f"{k.strip()}={v.strip().strip(chr(34)).strip(chr(39))}")
PYEOF
docker run -d --rm --name clipcraft-demo \
  -p 3000:3000 \
  --env-file "$CLEAN_ENV" \
  -e PORT=3000 \
  -e MANIM_LOCAL=1 \
  clipcraft-be >/dev/null
rm -f "$CLEAN_ENV"

trap 'docker stop clipcraft-demo >/dev/null 2>&1' INT TERM
echo "==> waiting for boot (migrations + API)"
for i in $(seq 1 30); do
  sleep 5
  if curl -sf http://localhost:3000/ >/dev/null 2>&1; then break; fi
done
curl -sf http://localhost:3000/ && echo "" || { echo "backend failed to boot"; docker logs clipcraft-demo | tail -n 20; exit 1; }

echo "==> opening public tunnel (share the https URL below)"
cloudflared tunnel --url http://localhost:3000
