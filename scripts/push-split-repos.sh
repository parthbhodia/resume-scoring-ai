#!/usr/bin/env bash
# Push split repos after: gh auth login
set -euo pipefail

ORG="${1:-parthbhodia}"
API_DIR="${2:-../resunova-api}"
WEB_DIR="${3:-../resunova-web}"

push_repo() {
  local name="$1" visibility="$2" dir="$3"
  cd "${dir}"
  local url="https://github.com/${ORG}/${name}.git"
  if git remote get-url origin &>/dev/null; then
    git remote set-url origin "${url}"
  else
    git remote add origin "${url}"
  fi
  if gh repo view "${ORG}/${name}" &>/dev/null; then
    echo "Repo ${ORG}/${name} exists — pushing..."
    git push -u origin main
  else
    echo "Creating ${visibility} repo ${ORG}/${name}..."
    if [ "${visibility}" = "private" ]; then
      gh repo create "${ORG}/${name}" --private --source=. --remote=origin --push
    else
      gh repo create "${ORG}/${name}" --public --source=. --remote=origin --push
    fi
  fi
}

push_repo "resunova-api" "private" "${API_DIR}"

echo "Creating web repo..."
push_repo "resunova-web" "public" "${WEB_DIR}"

echo "Done. Follow CUTOVER_CHECKLIST.md in each repo for Railway + GitHub Pages."
