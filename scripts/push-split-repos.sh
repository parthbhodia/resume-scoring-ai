#!/usr/bin/env bash
# Push split repos after: gh auth login
set -euo pipefail

ORG="${1:-parthbhodia}"
API_DIR="${2:-../resunova-api}"
WEB_DIR="${3:-../resunova-web}"

echo "Creating private API repo..."
gh repo create "${ORG}/resunova-api" --private --source="${API_DIR}" --remote=origin --push

echo "Creating web repo..."
gh repo create "${ORG}/resunova-web" --source="${WEB_DIR}" --remote=origin --push

echo "Done. Follow CUTOVER_CHECKLIST.md in each repo for Railway + GitHub Pages."
