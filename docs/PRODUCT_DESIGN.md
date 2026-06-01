# Resunova — product design (source of truth)

This document captures the **intended UX, visual language, and screen map** for the signed-in product and marketing tone. Implementations should converge here over time.

**Figma (mockups):** [Resunova — Product Design](https://www.figma.com/design/k3miAAJ2URdB5IKTP1Wjur/Resunova-%E2%80%94-Product-Design?node-id=4-2&p=f&t=KOZc53er15xObUAa-0)

**Related engineering doc:** [Architecture & design](./ARCHITECTURE_AND_DESIGN.md)

---

## Product positioning

- **Resunova** — free AI-powered career toolkit for **students and early-career** job seekers.
- **Feel:** Clean, fast, confidence-inspiring — *Linear meets Notion meets a career coach*.
- **Constraints:** No clutter, no upsells, no paywalls, no lorem ipsum in placeholders.

---

## Brand & visual language

### Tone

Professional but approachable. Smart, not corporate. Built for people serious about careers who **do not** want an $80/month gate.

### Typography

- **UI:** System stack with **Inter** as the primary web font (`layout.tsx` + `globals.css`).
- **Marketing / hero emphasis:** DM Sans remains available for landing/editorial blocks.
- Tight letter-spacing; headlines roughly **−0.02em to −0.03em** for polish.

### Color tokens (implemented as CSS variables)

| Role | Light | Dark |
|------|--------|------|
| Background | `#f8fafc` | `#0d1117` |
| Surface / cards | `#ffffff` | `#161b22` |
| Accent (CTA, active) | `#2f81f7` | `#2f81f7` |
| Success / strong | `#34d399` | `#34d399` |
| Warning / medium | `#f59e0b` | `#f59e0b` |
| Error / weak / high priority | `#f87171` | `#f87171` |
| Muted text | `#64748b` | Muted rgba on `--text` |

**Dark mode:** Full support; surfaces and borders invert cleanly (`data-theme` on `html`).

### Shape & depth

- **Radius:** 10–14px cards (`--radius-lg` / `--radius-xl`), **8px** inputs (`--radius`), **pill** badges (`--radius-pill`: 99px).
- **Shadows:** Subtle card shadow (`--shadow-card` / `--shadow-sm`); stronger elevation only for modals / drawers.

### Motion

- Short fades / slide-up on load (**~80ms stagger** between cards where batch UI appears).
- **Skeleton** loaders preferred over spinners for async regions.
- Score / ring-style metrics: animate **0 → value** (~600ms ease-out) where implemented.
- **120ms** transitions on suggestion accept/skip toggles.
- Respect **`prefers-reduced-motion`** (see `globals.css`).

---

## App shell

Implemented with **shadcn/ui `Sidebar`** (`collapsible="icon"`) in `web/components/app-shell/` — see [`web/README.md`](../web/README.md).

### Desktop (≥1024px)

- **Persistent left sidebar** (220px expanded): logo + wordmark, primary nav, **Resume Builder** collapsible sub-nav (Tailor / Template Builder), **History** (right `Sheet`), theme toggle, account `DropdownMenu`, legal links.
- **Collapse:** `SidebarTrigger` shrinks to a **72px icon rail**; labels hide via shadcn `group-data-[collapsible=icon]`; tooltips on icon-only items.
- **Main:** `SidebarInset` flex column; **each view owns its scroll** (no document-level scroll in the shell).

### Tablet (768–1023px)

- Same sidebar component; **starts collapsed** to the 72px icon rail (matches prior “compact” behavior).

### Mobile (&lt;768px)

- Sidebar **not rendered** (no mobile sidebar sheet); **bottom tab bar** for Analyze, Resume Builder (default tailor flow), Library, Jobs, Profile.
- Main column **bottom padding** so content clears the tab bar.

### Navigation labels (product copy)

| Key | Label |
|-----|--------|
| `analyze` | Analyze |
| `builder` | Resume Builder (sub: **Tailor to a job** / **Template Builder**) |
| `library` | Library |
| `jobs` | Jobs (badge: Soon) |
| `cover-letter` | Cover letter (badge: Soon) |
| `profile` | Profile |
| `advisor` | Advisor (only if `/api/advisor-access` allows) |

**Active nav item:** Inset **accent left bar** + soft tinted background (`NAV_ACTIVE_CLASS` on `SidebarMenuButton` / sub-buttons in `nav-config.ts`).

---

## Views (screen map)

Routing uses **query params** (`/?view=…`) because of **static export** — see `HomePageClient.tsx` and `ARCHITECTURE_AND_DESIGN.md`.

| # | View | Purpose | Route / params |
|---|------|---------|----------------|
| 1 | **Analyze** | PDF + JD → scores, categories, improvement plan, live preview | default `/?view=analyze` |
| 2 | **Template gallery** | Pick layout before builder | `/?view=builder&flow=template` |
| 3 | **Content source picker** | PDF vs library vs manual | `/?view=content-source` |
| 4 | **Manual resume form** | Guided steps when no file | `/?view=manual-form` |
| 5 | **Resume Builder** | JD-driven tailor, streaming PDF, suggestions | `/?view=builder&flow=tailor|scratch` |
| 6 | **Library** | Saved résumés grid | `/?view=library` |
| 7 | **Resume detail** | Metadata + PDF iframe only (no editor / ATS / analysis) | `/?view=library&resume=<folder>` |
| 8 | **Jobs** | Placeholder | `/?view=jobs` |
| 9 | **Profile** | User profile / drafts | `/?view=profile` |

### Analyze (detail spec)

- **Two-panel** when results exist: **plan + scores** (left rail) vs **live preview** (paper card).
- **Workspace split** (center + right preview): target proportion **~40% / 60%** (`AnalyzeResume` grid uses `2fr` / `3fr`).
- **Category rows:** Readability, ATS Safety, Achievement, Quantification, Structure, Language, Field & Depth — click syncs preview highlights.
- **Paper preview:** Always reads as a physical sheet (white paper tokens in `--resume-paper-*`), not full-bleed chrome.

### Builder phases (intent) — View 5

1. **Input** — company, role, JD URL + textarea; primary CTA analyze & suggest.  
2. **Suggestions** — two columns: résumé with highlights + list of suggestion cards (priority pills, accept/skip).  
3. **Results** — score ring, verdict, match breakdown, ATS, download PDF.

**Implementation:** `web/components/ResumeBuilder.tsx` — suggestions flow via `SuggestionsPanel` (two-column grid, stacks under ~900px; HIGH/MEDIUM/LOW badges; Accept / Skip; high-priority auto-accepted when suggestions load; generate CTA + “N of M accepted”). Results include score card, criteria, diff, ATS, share. UI tokens aligned for priority colors and card elevation.

**Template handoff** (`fromTemplateStudio=1`, `studioHandoff`): no Target job / JD fields and no suggestions step — single **Generate résumé PDF** uses layout + extracted content only (`generate()` with internal placeholders).

### Library (intent)

- Responsive **card grid**; hover quick actions **View** / **Use as base**; match score badge by threshold.

**Implementation:** `web/components/ResumeLibrary.tsx` — 3-column (lg) / 2-column (md) / 1-column grid, paper-style preview strip (“PDF ready” vs “No PDF yet”), score pills (70 / 55 thresholds), hover action bar on desktop + always-visible actions on mobile, skeleton grid while loading.

---

## What not to ship

- Paywalls, upgrade prompts, dark-pattern urgency.
- Deep navigation trees (max **two** levels for primary tasks).
- Heavy animation that hurts **perceived** performance.
- Generic lorem placeholders — use realistic résumé-style examples (e.g. “Jennifer Jobscan, Product Designer at Acme Labs”).

---

## Implementation checklist (for PRs)

- [ ] Tokens used (`var(--…)`) instead of one-off hex in new UI.
- [ ] Light + dark tested.
- [ ] Mobile tab bar + safe-area not clipping CTAs.
- [ ] No provider/model names in user-facing strings (use `web/lib/brand.ts`).
- [ ] Static export: no reliance on Next server routes for core flows.
