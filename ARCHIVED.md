# Archived monorepo

Development has moved to split repositories:

| Repo | Local path | GitHub (after push) | Deploy |
|------|------------|---------------------|--------|
| **resunova-api** (private) | `../resunova-api` | `parthbhodia/resunova-api` | Railway |
| **resunova-web** (team) | `../resunova-web` | `parthbhodia/resunova-web` | GitHub Pages |

This repository is retained for history only. Do not add new features here; open PRs in the split repos instead.

## Push split repos (one-time)

```bash
gh auth login
./scripts/push-split-repos.sh parthbhodia
```

Then follow `CUTOVER_CHECKLIST.md` in each new repo (Railway source swap, GitHub Pages secrets, archive this repo).

Split date: 2026-06-10.
