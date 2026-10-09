#!/bin/bash
# Polls GitHub Actions run status without embedding any token — token passed via env
TOKEN="${GITHUB_TOKEN:?must set GITHUB_TOKEN}"
REPO="synclicen/ARAY"
RUN_ID="${1:?usage: poll <run_id>}"
start=$(date +%s)
while true; do
  status=$(curl -sS -X GET \
    -H "Authorization: token $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/actions/runs/$RUN_ID" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['status'], '|', d.get('conclusion') or '-')")
  elapsed=$(( $(date +%s) - start ))
  echo "[$(date +%H:%M:%S)] elapsed=${elapsed}s — $status"
  if [[ "$status" == completed* ]]; then
    echo ""
    echo "=== Final jobs breakdown ==="
    curl -sS -X GET \
      -H "Authorization: token $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/$REPO/actions/runs/$RUN_ID/jobs" \
      | python3 -c "
import json,sys
d=json.load(sys.stdin)
for j in d.get('jobs',[]):
    print(f\"  {j['name']:30s} {j['status']:12s} {j.get('conclusion') or '-'}\")
    for s in j.get('steps',[]):
        icon = 'OK' if s.get('conclusion')=='success' else 'XX' if s.get('conclusion')=='failure' else '·'
        print(f\"    [{icon}] {s['name']}\")
"
    break
  fi
  sleep 25
done
