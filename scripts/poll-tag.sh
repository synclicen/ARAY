#!/usr/bin/env bash
# Poll GitHub Actions for a specific tag build status.
# Usage: TOKEN=xxx bash poll-tag.sh android-v1.0.74
TOKEN="${TOKEN:-$(git config --get credential.helper | head -1 || echo '')}"
REPO="synclicen/ARAY"
TAG="${1:-android-v1.0.74}"
TOKEN="${GITHUB_TOKEN:-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}"

for i in $(seq 1 60); do
  STATUS=$(curl -sS -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/actions/runs?per_page=10" \
    | python3 -c "
import sys, json
r = json.load(sys.stdin)
for x in r.get('workflow_runs', []):
    if x['head_branch'] == '$TAG' and x['event'] == 'push':
        print(x['status'], '|', x['conclusion'], '|', x['html_url'])
        break
")
  echo "[$i] $STATUS"
  if echo "$STATUS" | grep -qE 'completed'; then
    break
  fi
  sleep 30
done
