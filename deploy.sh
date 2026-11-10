#!/bin/bash
# One command to ship everything:
#   ./deploy.sh "what changed"
# 1) uploads apps-script/ to the Google Sheet's Apps Script project (clasp push)
# 2) redeploys the web app at the SAME URL as config.js (new version)
# 3) commits + pushes to GitHub → Cloudflare redeploys the site
set -e
cd "$(dirname "$0")"
MSG="${1:-Update dashboard}"
CLASP="npx --yes @google/clasp@2.4.2"

# --- Safety check: only deploy from an up-to-date main -----------------------
# deploy.sh replaces the live Apps Script with THIS computer's copy, so deploying
# from an old copy would erase a teammate's Apps Script changes.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "✗ You're on branch '$BRANCH'. Deploy only from main:"
  echo "    git checkout main && git pull"
  exit 1
fi
git fetch -q origin
if [ "$(git rev-list --count HEAD..origin/main)" != "0" ]; then
  echo "✗ GitHub has changes you don't have yet. Get them first, then deploy again:"
  echo "    git pull --no-edit"
  exit 1
fi

DEPLOYMENT_ID=$(grep -o 'macros/s/[^/]*' config.js | cut -d/ -f3)
if [ -z "$DEPLOYMENT_ID" ]; then echo "Couldn't find the Apps Script URL in config.js"; exit 1; fi

echo "→ Uploading Apps Script…"
$CLASP push --force

echo "→ Redeploying web app (same URL)…"
$CLASP deploy --deploymentId "$DEPLOYMENT_ID" --description "$MSG"

echo "→ Pushing to GitHub (Cloudflare redeploys automatically)…"
git add .
git commit -m "$MSG" || echo "(nothing new to commit)"
git push

echo "✓ Done: Apps Script updated, site deploying."
