# Resunova frontend (`web/`)

Next.js app for [Resunova](https://resunova.io): Analyze, Tailor, Template Builder, Resume Hub, Advisor dashboard.

| Doc | Purpose |
|-----|---------|
| [`AGENTS.md`](AGENTS.md) | Frontend conventions — read before editing |
| [`../CLAUDE.md`](../CLAUDE.md) | Full architecture + changelog |
| [`../resume_gui/README.md`](../resume_gui/README.md) | Backend API layout |
| [`../docs/PRODUCT_DESIGN.md`](../docs/PRODUCT_DESIGN.md) | App shell breakpoints + nav copy |

## Local dev

Requires **Node ≥20.9** (see `package.json` `engines`) for Next.js 16 and the shadcn CLI.

```bash
# Terminal 1 — backend on :8765 (from repo root)
.venv/bin/uvicorn resume_gui.app:app --host 0.0.0.0 --port 8765 --reload \
  --reload-dir resume_gui --reload-dir linkedin_agent

# Terminal 2 — frontend on :3000
npm install
npm run dev
```

Create `web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8765
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

Open [http://localhost:3000](http://localhost:3000).

## App shell (signed-in layout)

Signed-in routes wrap page content in [`components/AppShell.tsx`](components/AppShell.tsx), which uses **shadcn/ui** ([base-nova](https://ui.shadcn.com)) — not bespoke sidebar CSS.

| Piece | Implementation |
|-------|----------------|
| Desktop / tablet nav | [`components/app-shell/AppSidebar.tsx`](components/app-shell/AppSidebar.tsx) — `Sidebar` with `collapsible="icon"` (220px expanded → 72px icon rail) |
| Mobile nav | [`components/app-shell/AppBottomNav.tsx`](components/app-shell/AppBottomNav.tsx) — fixed bottom tabs; sidebar is **not** shown as a sheet |
| History drawer | shadcn `Sheet` (right) + [`ResumeSidebar.tsx`](components/ResumeSidebar.tsx) |
| Account menu | shadcn `DropdownMenu` + `Avatar` in [`AppSidebarUser.tsx`](components/app-shell/AppSidebarUser.tsx) (portaled — avoids clip bugs in collapsed rail) |
| Collapse from Tailor | [`contexts/AppShellSidebarContext.tsx`](contexts/AppShellSidebarContext.tsx) → `useSidebar().setOpen(false)` via [`AppShellSidebarBridge.tsx`](components/app-shell/AppShellSidebarBridge.tsx) |
| Nav labels / icons | [`components/app-shell/nav-config.ts`](components/app-shell/nav-config.ts) (Lucide icons) |
| Collapse preference | `localStorage` key `rn-app-sidebar-collapsed` (expanded = `open: true` on `SidebarProvider`) |

**Breakpoints**

- **≥768px:** `AppSidebar` visible; `SidebarTrigger` toggles expanded vs icon rail; tablet (`768–1023px`) forces collapsed rail on mount.
- **&lt;768px:** sidebar hidden; `AppBottomNav` only; main column has bottom padding for the tab bar.

**Add a shadcn primitive**

```bash
cd web && npx shadcn@latest add <component> --yes
```

Installed UI lives in [`components/ui/`](components/ui/) (`button`, `sidebar`, `sheet`, `dropdown-menu`, `avatar`, `badge`, `collapsible`, …). Prefer composing these over new inline styles in shell or feature views.

## Key paths

- `app/` — Next.js App Router pages (`HomePageClient` query routing: `/?view=analyze|builder|…`)
- `components/` — Feature UI (`AnalyzeResume`, `ResumeBuilder`, `ResumeLibrary`, …)
- `components/app-shell/` — Shell-only sidebar, bottom nav, nav config
- `components/ui/` — shadcn/ui primitives
- `hooks/` — `useHtmlPdfExport`, `use-mobile`, analyze export, etc.
- `lib/` — API helpers, `analysisCategoryMatch.ts`, Supabase client
- `store/` — Zustand state

## Typecheck

```bash
npx tsc --noEmit
```
