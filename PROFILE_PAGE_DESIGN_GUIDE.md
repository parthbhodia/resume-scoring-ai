# Profile Page Design Guide — Implementation Details

**Figma File:** https://www.figma.com/design/ddukhKkyCEOc5Tm28PutBS

---

## Overview

The new Profile page transforms Resunova's account/profile view from a **form** into a **dashboard + settings hub**. It provides users with:

1. **Usage visibility** — scans left, jobs saved, resumes built at a glance
2. **Clear CTAs** — one-click shortcuts to all main flows
3. **Simplified language** — "who you are" instead of "EEO answers"
4. **Progressive disclosure** — simple default view, detailed options hidden until needed

---

## Design System

### Colors
- **Background (page):** #F5F5F6 (rgb 245, 245, 246) — very light gray
- **Surfaces (cards):** #FFFFFF (white)
- **Text primary:** #141416 (dark gray, ~r:0.08, g:0.08, b:0.10)
- **Text secondary:** #72727A (medium gray, ~r:0.45)
- **Text tertiary:** #99999E (light gray, ~r:0.6)
- **Accent (primary button):** #3366FF (blue, ~r:0.2, g:0.6, b:1.0)
- **KPI colors:**
  - Scans: Blue (#3366FF)
  - Jobs: Green (#33CC88)
  - Resumes: Orange (#FF9933)

### Typography
- **Page title:** Inter Semi Bold 28px
- **Card/section titles:** Inter Semi Bold 18px
- **Labels & headings:** Inter Semi Bold 13-14px
- **Body text:** Inter Regular 13-14px
- **Small text:** Inter Regular 11-12px

### Spacing & Layout
- **Page padding:** 32px left/right
- **Card padding:** 16-20px
- **Gap between sections:** 20px
- **Item spacing in cards:** 8-16px
- **Corner radius:** 8-12px for cards

### Components
- **KPI Card:** 3-column layout, ~100px width each (flex-grow to fill)
- **Button (primary):** Blue bg, white text, 12px padding
- **Button (secondary):** White bg, dark text, light border, 12px padding
- **Tab:** Underline for active tab (using white background on active)

---

## Structure: 3 Main Tabs

### Tab 1: Dashboard
**Purpose:** Quick overview, entry point to all flows

**Sections:**
1. **Welcome Banner**
   - Greeting: "Welcome back! 👋"
   - Contextual message: "Ready for your next career move? You've got 4 scans left today."
   - White card, 20px padding, 8px gap between title/subtitle

2. **KPI Cards (3 columns)**
   - **Scans Left Today:** "4 / 5" — icons + numbers, blue accent
   - **Jobs Saved:** "3" — jobs collected from "Tailor to Job" flow
   - **Resumes Built:** "2" — templates saved in Template Builder
   - Dynamic: update from Supabase as user performs actions

3. **Quick Start Buttons**
   - Primary: "🔍 Analyze Resume" (blue, full width)
   - Secondary: "👔 Tailor to Job" (white with border)
   - These are shortcuts that pre-fill or navigate to the respective flows

4. **Recent Activity** (collapsible)
   - Bullet list of recent actions
   - Examples:
     - • Analyzed resume.pdf — Score: 78
     - • Saved job: "SWE at Stripe"
     - • Built "Modern Tech Résumé"
   - Max 5 items, ordered newest first

**Data Sources:**
- User auth email → welcome message customization
- `resume_analyses` table → recent analyses count, latest score
- `resumes` table (tailored) → tailored resume count
- `template_builder_resumes` table → builder draft count
- Scan limits endpoint → daily scan quota

---

### Tab 2: Career Profile

**Purpose:** Structured, simplified profile editing. Uses real-world language.

**Sections (in order):**

#### 1. **Who You Are**
   - Display name (large, bold)
   - Subtitle/tagline (smaller, secondary color)
   - Rendered as a clean "profile card" preview
   - Profile strength indicator (0-100%, color-coded)
   - Small copy: "Used on exported PDFs and shared links"

#### 2. **Contact & Links**
   - Email (with pre-fill from auth)
   - Phone
   - LinkedIn URL
   - Portfolio / GitHub
   - Each with inline validation (non-blocking hints)

#### 3. **What You're Looking For**
   - Target roles (comma-separated, or chips)
   - Preferred locations
   - Sub-copy: "These guide tailoring suggestions and (soon) job matching"

#### 4. **Your Background**
   - School
   - Degree
   - Graduation date (with timeline visualization: "Graduating May 2027 (1.2 years away)")
   - GPA (optional)

#### 5. **For Job Applications** (Expandable, Optional)
   - Header with info icon: "Save time on job forms later"
   - 6 EEO radio groups (hidden by default):
     - Are you authorized to work in the U.S.?
     - Will you require visa sponsorship?
     - Do you have a disability?
     - Are you a veteran?
     - What is your gender?
     - Do you identify as LGBTQ+?
   - Fine print: "Not used for scoring or tailoring. Employers use this for compliance."

#### 6. **Résumé Tailoring Defaults** (Expandable)
   - Default tone (dropdown): Confident & concise / Formal / Friendly
   - Default section order (dropdown)
   - Font size preset (buttons or dropdown)
   - Sub-copy: "When you tailor a resume, we'll use these as starting points"

**Data Sources:**
- `user_profiles` table (Supabase) — all profile fields
- LocalStorage fallback for unsigned-in users
- Auto-save on every keystroke (debounced 1.5s)

---

### Tab 3: Settings & Preferences

**Purpose:** Privacy, notifications, account controls.

**Sections:**

#### 1. **Sharing & Privacy**
   - [ ] Show phone on résumé PDFs (toggle)
   - [ ] Show full address vs city only (toggle, future)
   - [ ] Make my profile shareable (toggle, future)
   - Sub-copy: "Control what appears on exported PDFs"

#### 2. **Résumé Display Defaults**
   - Font size (3 buttons: 0.92x / 1.0x / 1.10x)
   - Preview accent color (8 color swatches: amber, blue, teal, etc.)
   - Section order reorderable list

#### 3. **Notifications**
   - [ ] Email me when my account changes
   - [ ] Notify me when I reach daily scan limit
   - [ ] Notify me about new features
   - Sub-copy: "We'll send at most 1-2 emails per week"

#### 4. **Account**
   - Signed in as: you@email.com (read-only)
   - [Sign out button]
   - [Delete account button] (low-contrast, disabled until confirmed)

**Data Sources:**
- `user_preferences` table (future) — notification settings, defaults
- Supabase auth → email display

---

## Key Differences from Current Profile Page

| Current | New |
|---------|-----|
| **Form-heavy** — long scrolling list of fields | **Dashboard-first** — context + stats, then settings |
| "Tailoring defaults" | "When you tailor a resume, use…" |
| "EEO answers" | "For job applications (optional)" |
| No visibility into usage | KPI cards showing scans/jobs/resumes |
| No shortcuts to flows | Quick Start buttons at top |
| Profile strength = % | Profile strength = "X fields away from complete" |
| All fields visible by default | EEO + settings hidden until expanded |
| Sparse hint as side card | Integrated into "Career Profile" flow |

---

## Flow Connections

### **After Analyze**
- On analysis completion, prompt user to "Check your profile" (optional coach)
- Suggested headline → offer to populate in Profile
- Recently analyzed file name → shown in "Recent Activity"

### **After Tailor to Job**
- Saved job title auto-appears in KPI "Jobs Saved"
- Profile roles/locations might be suggested based on match

### **After Template Builder**
- Built template name → "Resumes Built" KPI updates
- Style choices (font size, accent) → persist to Settings tab defaults

### **From Profile → Analyze**
- Click "🔍 Analyze Resume" → navigates to Analyze flow
- If PDF already uploaded in profile → pre-fills that PDF

### **From Profile → Tailor**
- Click "👔 Tailor to Job" → navigates to Tailor flow
- Pre-fills `roles` / `locations` from Career Profile
- Uses `tone` / `sectionOrder` from Tailoring Defaults

### **From Profile → Template Builder**
- Click "✨ Use Template Builder" → navigates to builder
- Pre-fills display name, headline, education, tone from Career Profile

---

## Prompts & Microcopy (Simplified Language)

### Profile Strength
**Current:** "Profile strength 75% · keep going"
**New:** "You're 3 fields away from complete. Optional fields: phone, GPA, role notes."
*(Shows which specific fields are missing)*

### PDF Upload (if kept in onboarding)
**Current:** "Choose PDF — we fill empty fields only"
**New:** "Have a recent resume handy? Upload it. We'll automatically fill in the basics so you don't have to type them again."

### EEO Section Header
**Current:** "Optional — save time on applications later. Many job boards ask the same EEO-style questions on every apply…"
**New:** "For job applications (optional) — Save time on job forms later. Your answers help us prefill forms when you apply. We never share these."

### Tailoring Defaults
**Current:** "Default tone: [dropdown]"
**New:** "When you tailor a resume, we'll suggest this style: [Confident & concise] [Show Experience first]"

### Graduation Date
**Current:** "Graduation"
**New:** "Graduation date" with inline helper: "May 2027 (graduating in ~1.2 years)"

### Roles/Locations
**Current:** "Roles you want" / "Locations"
**New:** "What roles are you looking for?" / "Where do you want to work?" with chips for easy editing

---

## Mobile Responsiveness (< 600px)

1. **Dashboard Tab** stays single-column:
   - KPI cards stack vertically (full width)
   - Buttons stack or arrange 2-per-row

2. **Career Profile Tab**:
   - All sections full-width
   - 2-column form grids collapse to single column

3. **Settings Tab**:
   - All toggles/inputs full-width

4. **Navigation**:
   - Tabs could become a bottom nav or slide-out drawer on very small screens

---

## Implementation Checklist

### Phase 1: Frontend Components
- [ ] Tab navigation component (reusable)
- [ ] KPI card component
- [ ] Profile strength indicator (% or count)
- [ ] Recent activity list
- [ ] Expandable section component (for EEO, tailoring, settings)
- [ ] Profile preview card ("Who You Are")

### Phase 2: Data Integration
- [ ] Wire dashboard KPI cards to Supabase queries
- [ ] Auto-populate "Recent Activity" from `resume_analyses` + `resumes` tables
- [ ] Add `/api/user-profile-stats` endpoint if needed
- [ ] Implement scan limits display (from existing scan_limits service)

### Phase 3: Backend Changes
- [ ] Ensure `user_profiles` includes all new fields
- [ ] Add `user_preferences` table for notification settings (future)
- [ ] Add `/api/profile-stats` endpoint (scans used, analyses count, etc.)

### Phase 4: Testing & Refinement
- [ ] Visual regression testing (light + dark mode)
- [ ] Mobile responsiveness (3 breakpoints: 600px, 900px, 1280px)
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Usability testing with 3-5 users

---

## Future Enhancements

1. **Profile sharing** — public link to share career profile with recruiters
2. **Activity timeline** — shows score progression over time
3. **Suggested improvements** — "Based on your recent analyses, you might want to add [X]"
4. **Integration with "Apply Jobs"** — EEO answers auto-prefill job forms
5. **Job matching feed** — "Jobs that match your profile" based on roles/locations
6. **Export profile as PDF** — clean one-page profile card
7. **Profile strength badges** — show on exported resumes/PDFs

---

## Accessibility Notes

- **Tab order:** Logo/nav → Tab buttons → Content area → Footer
- **Keyboard:** Tab to navigate, Enter/Space to toggle, Arrow keys for radio groups
- **ARIA:** Each tab has `aria-selected="true/false"` and `role="tabpanel"`
- **Color contrast:** All text meets WCAG AA (4.5:1 for body, 3:1 for large)
- **Focus visible:** Clear 2px outline on all buttons, 2px offset
- **Expansion triggers:** Section headers are proper `<button>` elements, not divs

---

## Code Integration Points

### In `web/components/ProfilePage.tsx`
- Keep the existing ProfileFormState structure
- Add new UI for Dashboard/Settings tabs
- Import KPI and quick-action components

### In `web/lib/supabase.ts`
- Add `fetchProfileStats()` → returns { scansUsed, jobsSaved, resumesBuilt }
- Add `fetchRecentActivity()` → returns recent analyses, tailored resumes

### In `resume_gui/routes/`
- Optional new endpoint: `GET /api/profile-dashboard` → aggregates stats

### In `web/store/`
- Zustand store may need `profileTab` (selected tab) and `expandedSections` state

---

## Next Steps

1. **Review this design** — feedback on layout, language, data model
2. **Figma iteration** — refine based on feedback, add Career Profile + Settings tabs
3. **Component audit** — which shadcn/ui components exist for KPI cards, expandables, etc.
4. **Data audit** — verify API endpoints provide needed stats
5. **Implementation timeline** — estimate effort for frontend, backend, integration

