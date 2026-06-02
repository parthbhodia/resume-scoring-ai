---
description: Launch and verify the Resunova Next.js frontend in Claude Preview.
---

# Run skill — Resunova web frontend

## Launch

Use `preview_start` with the named config — never `Bash npm run dev`:

```
mcp__Claude_Preview__preview_start({ name: "resume-scoring-web" })
```

This returns a `serverId`. The server is defined in `.claude/launch.json`:
- **Runtime**: `/Users/mslcomx/.nvm/versions/node/v20.18.1/bin/node`
- **Args**: `node_modules/.bin/next dev`
- **CWD**: `web/`
- **Port**: 3000 (autoPort: false — reuses the port)

If port 3000 is already taken by a non-preview process, kill it first:
```bash
kill $(lsof -ti :3000)
```
Then retry `preview_start`.

## Auth bypass

`web/.env.local` has `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` which skips Supabase OAuth so the app dashboard loads without a real session. This is wired in `web/components/AuthGate.tsx`.

Navigate to the app (not the public landing page):
```js
// In preview_eval:
window.location.replace('/?view=analyze')   // Analyze page (default home)
window.location.replace('/?view=builder&flow=tailor')  // Tailor flow
window.location.replace('/template-builder/')          // Template Builder (public)
window.location.replace('/landing-preview')            // Landing page preview
```

## Sidebar state

The app remembers collapsed/expanded state in localStorage. Force expanded sidebar:
```js
localStorage.removeItem('rn-app-sidebar-collapsed');
document.cookie = 'sidebar_state=true; path=/';
window.location.reload();
```

Force collapsed (icon rail):
```js
localStorage.setItem('rn-app-sidebar-collapsed', '1');
document.cookie = 'sidebar_state=false; path=/';
window.location.reload();
```

## Scrolling the app

The main scrollable container has class `az-main`. Use:
```js
document.querySelector('.az-main')?.scrollTop = 500;
```
Do NOT use `window.scrollTo` — the AppShell clips overflow.

## Viewport presets

```
preview_resize({ serverId, preset: "desktop" })   // 1280×800
preview_resize({ serverId, preset: "mobile" })    // 375×812
preview_resize({ serverId, width: 1440, height: 900 })
```

## Verify a change

1. `preview_start` (or reuse running server)
2. `preview_eval` → navigate to the affected route
3. `preview_screenshot` — confirm visual
4. `preview_console_logs({ level: "error" })` — confirm no regressions
5. `preview_snapshot` — check accessibility tree if needed

## Key routes

| Route | What it shows |
|---|---|
| `/?view=analyze` | Analyze upload page (default) |
| `/?view=builder&flow=tailor` | Tailor to a job |
| `/template-builder/` | Template Builder (no auth) |
| `/landing-preview` | Landing page preview harness |
| `/editor-preview` | ResumeEditor harness |

## Backend

The Python backend runs separately on port 8765:
```bash
.venv/bin/uvicorn resume_gui.app:app --host 0.0.0.0 --port 8765 --reload \
  --reload-dir resume_gui --reload-dir linkedin_agent
```
The frontend talks to it via `NEXT_PUBLIC_API_URL=http://localhost:8765` in `.env.local`.
If the backend is down, upload/analyze calls will fail with network errors.
