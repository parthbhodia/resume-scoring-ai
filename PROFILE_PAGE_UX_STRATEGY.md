# Profile Page UX Strategy — Resunova

## Current State vs. Vision

### What Exists Today
- **Profile form** — contact, education, job preferences, tailoring defaults, EEO answers
- **Onboarding flow** — 2-step intro with PDF upload hint
- **Auto-save** — debounced sync to Supabase
- **Sparse hint** — reminds users to fill out profile
- **Profile strength** — % indicator based on field completion

**Problems:**
1. Users see just a **form** — no context about what they can *do* with this profile
2. No visibility into **usage** (scans left, analyses saved, jobs saved)
3. **Confusing language** for non-power-users ("EEO answers", "tailoring defaults")
4. Disconnected from app flows — no shortcuts to Analyze/Tailor/Template Builder
5. **No sense of progress** — what's the next step after filling profile?

### Vision
A **dashboard + settings hub** that:
- Shows **at-a-glance usage** (scans left today, analyses saved, recent jobs)
- Explains **how this profile helps** in real user language
- Provides **quick paths** to all main flows
- Feels like their **home base** — not a form to endure
- Progressively reveals complexity (simple → detailed settings)

---

## Information Architecture

### Three Sections (Tabs or Scrollable)

#### 1. **Dashboard** (Quick overview + actions)
```
┌─────────────────────────────────────────────┐
│  Welcome back, [Name]!                      │
│  Ready for your next career move?            │
├─────────────────────────────────────────────┤
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ 📊       │ │ 💼       │ │ 📋       │   │
│  │ Scans    │ │ Jobs     │ │ Resumes  │   │
│  │ 4 / 5    │ │ Saved: 3 │ │ Built: 2 │   │
│  └──────────┘ └──────────┘ └──────────┘   │
│                                              │
│  ──────────────────────────────────────────  │
│                                              │
│  QUICK START                                │
│  [ 🔍 Analyze Resume ] [ 👔 Tailor to Job ]│
│  [ ✨ Use Template Builder ]               │
│                                              │
│  ──────────────────────────────────────────  │
│                                              │
│  RECENT ACTIVITY                            │
│  • Analyzed resume.pdf — 78 score          │
│  • Saved job: "SWE at Stripe"              │
│  • Built "Modern Tech Résumé"              │
│                                              │
└─────────────────────────────────────────────┘
```

#### 2. **Career Profile** (Structured info in real language)
```
┌─────────────────────────────────────────────┐
│ WHO YOU ARE                                  │
│ ─────────────────────────────────────────── │
│                                              │
│ Name, headline, location, links             │
│ (rendered as a clean preview)               │
│                                              │
├─────────────────────────────────────────────┤
│ WHAT YOU'RE LOOKING FOR                     │
│ ─────────────────────────────────────────── │
│                                              │
│ Target roles: [Editable chips]              │
│ Preferred locations: [Editable]             │
│                                              │
├─────────────────────────────────────────────┤
│ YOUR BACKGROUND                             │
│ ─────────────────────────────────────────── │
│                                              │
│ School, degree, graduation date             │
│ (Timeline view: "Will graduate May 2027")   │
│                                              │
├─────────────────────────────────────────────┤
│ FOR JOB APPLICATIONS (Optional)             │
│ ─────────────────────────────────────────── │
│                                              │
│ EEO answers (collapsed by default)          │
│ Tooltip: "Save time on job forms later"    │
│                                              │
└─────────────────────────────────────────────┘
```

#### 3. **Settings & Preferences**
```
┌─────────────────────────────────────────────┐
│ SHARING & PRIVACY                           │
│ Show my phone on PDFs? [Toggle]             │
│ Share my profile link? [Toggle]             │
│                                              │
│ ─────────────────────────────────────────── │
│ RÉSUMÉ DEFAULTS                             │
│ When I tailor a resume, use:                │
│ • Tone: [Dropdown]                         │
│ • Section order: [Reorderable]              │
│ • Font size: [Buttons]                      │
│                                              │
│ ─────────────────────────────────────────── │
│ NOTIFICATIONS                               │
│ Email me when: [Checkboxes]                │
│ □ My account changes                       │
│ □ I reach my daily scan limit               │
│ □ New features launch                      │
│                                              │
│ ─────────────────────────────────────────── │
│ ACCOUNT                                     │
│ Signed in as: you@email.com                 │
│ [Sign out]  [Delete account]                │
│                                              │
└─────────────────────────────────────────────┘
```

---

## Language Improvements

### Current → New (Simpler)

| Current | New |
|---------|-----|
| "Tailoring defaults" | "When I tailor a resume, use…" |
| "EEO answers" | "For job applications (optional)" |
| "Profile strength 75%" | "You're 3 fields away from complete" |
| "Equal employment optional" | "Save time on job forms later" |
| "Visibility (coming soon)" | "Who sees what (coming soon)" |
| "Résumé tagline" | "One-liner that appears at the top" |
| "Upload a PDF, we fill empty fields only" | "Have a resume handy? Upload it — we'll auto-fill your profile" |

### Progressive Disclosure
- **Default view**: Dashboard + "Who You Are" + "What You're Looking For"
- **On click "More options"**: All EEO, tailoring defaults, preferences
- **On click "Settings"**: Notifications, sharing, account

---

## Data Connections

### What Profile Feeds Into
1. **Analyze** — Uses `displayName` for PDF export, `headline` for summary
2. **Tailor** — Uses `roles`, `locations`, `tone`, `sectionOrder` to guide rewrite
3. **Template Builder** — Uses `displayName`, `headline`, `tone`, `sectionOrder` for starting template
4. **Upcoming "Apply Jobs"** — Uses EEO answers to prefill job forms

### What Flows Feed Into Profile
1. **After Analyze** — Could pre-fill `headline` from AI insights
2. **After Tailor** — Could suggest roles/locations based on success
3. **Job Save** — Adds to "Recent jobs" widget

---

## Prompt Simplification Examples

### PDF Upload (Onboarding)
**Current:**
```
Choose PDF — we fill empty fields only
```

**Better:**
```
Have a recent resume? Upload it.
We'll automatically fill in the basics so you don't have to type them again.
```

### EEO Section
**Current:**
```
Optional — save time on applications later. Many job boards ask the same EEO-style questions…
Not used for résumé scoring or tailoring…
```

**Better:**
```
Your answers here (optional) help you fill out job forms faster when you apply.
We never share these or use them for scoring.
```

### Profile Strength
**Current:**
```
Profile strength · 75% · keep going
```

**Better:**
```
Almost done! 3 more fields and your profile is complete.
(Shows which 3 are missing)
```

### Tailoring Defaults
**Current:**
```
When I tailor a résumé, use…
Default tone [dropdown]
Default section order [dropdown]
```

**Better:**
```
When you tailor a resume, we'll suggest this style:
[ Confident & concise ] [ Show Experience first ]
```

---

## UI Components Needed

1. **KPI Cards** — Scans left, jobs saved, resumes built (with mini sparklines/trends)
2. **Profile Preview** — Rendered as a clean "your profile card" view
3. **Role/Location Chips** — Editable, removable, addable
4. **Timeline** — Graduation date shown as "Graduating May 2027 (1 year away)"
5. **Expandable Sections** — EEO answers, settings hidden by default
6. **Quick Actions** — Three big buttons for Analyze / Tailor / Template Builder
7. **Breadcrumb/Tour** — First visit: highlight "Where does this go?" with arrows
8. **Auto-save Indicator** — Status line at bottom like current (✓ Saved)

---

## User Flows (How Profile Integrates)

### New User Flow
1. Land on homepage
2. Click "Get Started" → Profile onboarding (2 steps)
3. Option A: Upload PDF (auto-fills profile) → Dashboard shows empty KPIs
4. Option B: Manual form (guided fields)
5. Finish → Dashboard → Can now Analyze, Tailor, or Build Template

### Returning User (Signed In)
1. Click Profile in nav
2. See Dashboard with usage stats
3. Click "Analyze Resume" → Uploaded PDF pre-fills from last scan
4. Finish analysis → Returns to dashboard, KPI updates
5. Click "Tailor to Job" → Job search pre-fills from last saved job

### Power User (Multiple Scans)
1. Dashboard shows progress: "4/5 scans used today"
2. See banner: "Reset at midnight (8 hours)"
3. Can still analyze once more OR continue with Tailor/Template Builder

---

## Accessibility & Mobile

### Desktop (>900px)
- 3-column grid or tabs (Dashboard | Profile | Settings)
- KPI cards side-by-side
- Full preview

### Tablet (600-900px)
- Stacked tabs
- KPI cards stack
- Touch-friendly buttons

### Mobile (<600px)
- Single column
- Bottom sheet for "More options"
- Larger touch targets (44px min)
- Collapse EEO by default

---

## Next Steps

1. **Figma mockup** — Dashboard, Career Profile, Settings tabs
2. **Component audit** — Which shadcn/ui components to reuse (Card, Tabs, Button, etc.)
3. **API audit** — Ensure backend provides needed data (scan limits, recent analyses, etc.)
4. **Localization** — All text should be i18n-ready
5. **Dark mode** — Test all mockups in both light & dark

