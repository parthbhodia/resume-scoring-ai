# Profile Page Redesign — Implementation Roadmap

## Quick Summary

You're redesigning the Profile page from a **form-heavy data entry interface** into a **dashboard + settings hub** that:
- Shows usage at a glance (scans left, jobs saved, resumes built)
- Connects seamlessly to Analyze, Tailor, and Template Builder flows
- Uses simplified, jargon-free language for non-technical users
- Progressively reveals complexity (simple by default, detailed on demand)

**Current Status:** UX strategy + Figma mockup (Dashboard tab) + detailed design guide + simplified language guide

---

## What's Been Delivered

### 1. UX Strategy Document
📄 [`PROFILE_PAGE_UX_STRATEGY.md`](PROFILE_PAGE_UX_STRATEGY.md)

- **What:** Information architecture for 3-tab design (Dashboard, Career Profile, Settings)
- **Why each section exists** and how it feeds into/from other flows
- **Data connections** (which Supabase tables, which endpoints)
- **Language improvements** with current vs. new examples
- **Accessibility & mobile considerations**

### 2. Detailed Design Guide
📄 [`PROFILE_PAGE_DESIGN_GUIDE.md`](PROFILE_PAGE_DESIGN_GUIDE.md)

- **Design system:** Colors, typography, spacing, components
- **3-tab structure** with every section spec'd out:
  - Dashboard: Welcome, KPIs, Quick Start, Recent Activity
  - Career Profile: Who you are, Contact, What you want, Background, EEO, Tailoring Defaults
  - Settings: Privacy, Notifications, Account
- **Flow connections:** How profile integrates with Analyze, Tailor, Template Builder
- **Implementation checklist** by phase
- **Future enhancements** (profile sharing, activity timeline, job matching)

### 3. Simplified Prompts & Language Guide
📄 [`SIMPLIFIED_PROMPTS_GUIDE.md`](SIMPLIFIED_PROMPTS_GUIDE.md)

- **Before/after pairs** for every label, prompt, tooltip, validation message
- **Principles:** Assume no resume knowledge, explain the why, use examples
- **Every field explained:**
  - Email validation: "Use a valid email like you@example.com"
  - Roles field: "What roles are you looking for? E.g., Backend engineer, Product Manager"
  - EEO section: "For job applications (optional) — Save time on job forms later"
- **Empty states, error messages, success confirmations**
- **Accessibility patterns** (aria-live, screen reader announcements)

### 4. Figma Mockup (Started)
🎨 https://www.figma.com/design/ddukhKkyCEOc5Tm28PutBS

- **Dashboard tab** with:
  - Welcome banner ("Welcome back! 👋" + scan status)
  - 3 KPI cards (Scans Left, Jobs Saved, Resumes Built)
  - Quick Start buttons (Analyze, Tailor)
  - Recent Activity list
- **Structure ready** for Career Profile and Settings tabs
- **Uses Resunova design tokens** (Figma auto-layout, proper spacing, shadows)

---

## How This Connects with Resunova Flows

### From Profile → Analyze
```
User clicks [🔍 Analyze Resume] button
  ↓
  Navigates to Analyze flow
  ↓
  On completion: profile shows updated KPI ("Analyses: 1" etc.)
```

### From Analyze → Profile
```
After analysis completes
  ↓
  Optional: Show coach "Check your profile" link
  ↓
  Suggested headline → offer to populate in Profile Career Profile tab
  ↓
  Recent Activity shows "Analyzed resume.pdf — Score: 78"
```

### From Profile → Tailor
```
User clicks [👔 Tailor to Job] button
  ↓
  Navigates to Tailor flow
  ↓
  Pre-fills: roles, locations from Career Profile
  ↓
  Uses: tone, section order from Tailoring Defaults
  ↓
  On completion: KPI "Jobs Saved" updates
```

### From Tailor → Profile
```
User saves a job
  ↓
  KPI "Jobs Saved: X" updates
  ↓
  Suggested action: "Check your profile" → shows saved job
```

### From Profile → Template Builder
```
User clicks [✨ Use Template Builder] button
  ↓
  Navigates to builder
  ↓
  Pre-fills: displayName, headline, education from Career Profile
  ↓
  Uses: tone, font size, accent color from Settings defaults
  ↓
  On completion: KPI "Resumes Built: X" updates
```

---

## Key Improvements Over Current Profile Page

| Aspect | Current | New |
|--------|---------|-----|
| **Entry point** | Sparse form | Dashboard with stats + quick actions |
| **Visible context** | None (just fields) | Usage (scans left, jobs saved) + recent activity |
| **Language** | Jargon ("EEO answers", "tailoring defaults") | Plain English ("For job applications", "When you tailor a resume") |
| **User mental model** | "I need to fill this form" | "This is my hub; I can see what I've done and what I can do next" |
| **Complexity** | All fields visible | Progressive disclosure (simple first, details hidden) |
| **Flow connectivity** | Isolated — no CTAs to other flows | Integrated — Quick Start buttons to Analyze, Tailor, Template Builder |

---

## Implementation Phases

### Phase 1: Frontend Components (2–3 weeks)
**Goal:** Build reusable components and dashboard structure

**Tasks:**
- [ ] Create `ProfilePageClient.tsx` with 3-tab layout
  - Tab navigation (reusable Tabs component if needed)
  - Content areas for Dashboard, Career Profile, Settings
- [ ] Dashboard components:
  - `KpiCard.tsx` — icon, label, value, tooltip
  - `ProfileWelcomeBanner.tsx` — greeting + scan status
  - `RecentActivityList.tsx` — bullet list of recent actions
  - `QuickStartButtons.tsx` — Analyze, Tailor, Template Builder CTAs
- [ ] Career Profile sections:
  - `ProfileStrengthIndicator.tsx` — "X fields away from complete" + breakdown
  - `ProfilePreviewCard.tsx` — clean "Who You Are" preview
  - `EditableRoleChips.tsx` — add/remove/edit role tags
  - `ExpandableSection.tsx` — for EEO, Tailoring Defaults (reusable)
- [ ] Settings section:
  - Toggle controls (notification preferences)
  - Dropdown/buttons for defaults (tone, section order, font size)
  - Destructive action (delete account with confirmation)
- [ ] Use existing shadcn/ui components where possible (Button, Card, Input, etc.)

**Definition of Done:**
- Components render without data (placeholder states)
- Mobile-responsive (600px, 900px, 1280px breakpoints)
- Accessibility: keyboard navigation + screen reader testing

---

### Phase 2: State & Data Integration (2–3 weeks)
**Goal:** Wire components to Zustand store and Supabase

**Tasks:**
- [ ] Create Zustand store for profile page state:
  ```typescript
  profilePageStore = {
    selectedTab: 'dashboard' | 'career' | 'settings',
    expandedSections: Set<string>,
    profile: ProfileFormState,
    stats: { scansUsed, jobsSaved, resumesBuilt },
    recentActivity: Activity[],
    loading: boolean,
    errors: Partial<Record<field, string>>,
    // actions...
  }
  ```
- [ ] Backend API audit:
  - [ ] Does `/api/analyze-upload` return recent analyses list?
  - [ ] Does `/api/upload-resume` return recent tailored resumes?
  - [ ] Does `/api/scan-limit-status` return daily scans remaining?
  - [ ] Create `/api/profile-dashboard` if needed to aggregate stats in one call
- [ ] Wire KPI cards:
  - [ ] Fetch scans used from scan_limits service
  - [ ] Count `resume_analyses` rows (user's analyses)
  - [ ] Count `resumes` rows where tailored=true (user's tailored resumes)
  - [ ] Count `template_builder_resumes` rows (user's builder drafts)
- [ ] Wire Recent Activity:
  - [ ] Query latest 5 items from `resume_analyses` + `resumes` + `template_builder_resumes` (merged + sorted by date)
  - [ ] Format as activity items (e.g., "Analyzed resume.pdf — Score: 78")
- [ ] Wire Career Profile form:
  - [ ] Load/save profile from `user_profiles` table
  - [ ] Auto-save on keystroke (debounced 1.5s)
  - [ ] Preserve to localStorage for offline use
- [ ] Auto-populate fields:
  - [ ] Email from Supabase auth
  - [ ] Suggested headline from recent analysis (optional)

**Definition of Done:**
- KPI cards show real data (or mock data in dev)
- Recent Activity populates from database
- Profile form auto-saves
- Mobile: all interactions responsive, no layout shifts

---

### Phase 3: Simplified Language & Copy (1 week)
**Goal:** Replace all labels, tooltips, help text with plain-English versions

**Tasks:**
- [ ] Audit every label, placeholder, helper text against [`SIMPLIFIED_PROMPTS_GUIDE.md`](SIMPLIFIED_PROMPTS_GUIDE.md)
- [ ] Update inline validation messages (e.g., email, LinkedIn URL)
- [ ] Add tooltips (info icons) for:
  - KPI cards (what each metric means, how it resets)
  - Profile strength (which fields are missing)
  - EEO section (why this is optional, how it's used)
  - Tailoring defaults (how they affect tailoring suggestions)
- [ ] Test with actual users (3–5 people, ages 18–40):
  - "What does this label mean?"
  - "Would you fill this field?" (optional vs. required)
  - "What would you expect to happen if you click this?"
- [ ] Iterate based on feedback

**Definition of Done:**
- No jargon remains (test with non-technical reader)
- All placeholders are examples, not requirements
- All tooltips explain the why
- Users (in testing) understand each field's purpose without help

---

### Phase 4: Testing & Refinement (2 weeks)
**Goal:** Verify functionality, accessibility, performance, visual consistency

**Tasks:**
- [ ] Cross-browser testing:
  - [ ] Chrome, Firefox, Safari (desktop)
  - [ ] Chrome, Safari (mobile)
  - [ ] Dark mode rendering
- [ ] Accessibility audit:
  - [ ] Tab order (nav → tabs → form → footer)
  - [ ] Keyboard shortcuts (Tab, Shift+Tab, Enter, Arrow keys)
  - [ ] Screen reader testing (NVDA on Windows, VoiceOver on Mac)
  - [ ] Color contrast (4.5:1 for body, 3:1 for large text)
- [ ] Performance:
  - [ ] Profile stats load < 500ms
  - [ ] Form auto-save doesn't block UI
  - [ ] Mobile lighthouse score > 90
- [ ] Usability testing:
  - [ ] 3–5 users (students, career-changers)
  - [ ] Record: completion time, errors, confusion points
  - [ ] A/B test if needed (e.g., "3 fields away" vs. "75% complete")
- [ ] Regression testing:
  - [ ] Existing flows (Analyze, Tailor, Template Builder) unaffected
  - [ ] Sign-in/auth still works
  - [ ] Offline mode (localStorage fallback) works

**Definition of Done:**
- No console errors
- All accessibility tests pass
- Lighthouse score > 90 (mobile)
- 95%+ task completion rate in usability testing
- Zero regressions in existing flows

---

## Data Model Changes

### New/Modified Tables

#### `user_profiles` (Existing — confirm fields)
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  display_name TEXT,
  tagline TEXT,
  email TEXT,
  phone TEXT,
  linkedin TEXT,
  portfolio TEXT,
  headline TEXT,
  roles TEXT,
  locations TEXT,
  school TEXT,
  degree TEXT,
  graduation TEXT,
  gpa TEXT,
  tone TEXT DEFAULT 'confident',
  section_order TEXT DEFAULT 'summary-exp-proj-edu',
  font_size NUMERIC DEFAULT 1.0,
  accent_color TEXT DEFAULT 'amber',
  eeo_work_us TEXT,
  eeo_visa_sponsor TEXT,
  eeo_disability TEXT,
  eeo_veteran TEXT,
  eeo_gender TEXT,
  eeo_lgbtq TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(user_id)
);
```

#### `user_preferences` (New — future)
```sql
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  notify_account_changes BOOLEAN DEFAULT TRUE,
  notify_scan_limit BOOLEAN DEFAULT FALSE,
  notify_features BOOLEAN DEFAULT FALSE,
  show_phone_on_pdf BOOLEAN DEFAULT FALSE,
  show_full_address BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(user_id)
);
```

### New API Endpoints

#### `GET /api/profile-dashboard`
**Returns:** Aggregated profile stats for dashboard

```json
{
  "user": {
    "displayName": "Sarah Chen",
    "email": "sarah@example.com"
  },
  "stats": {
    "scansUsedToday": 4,
    "scansLimitDaily": 5,
    "analysesTotal": 12,
    "jobsSaved": 3,
    "resumesBuilt": 2
  },
  "recentActivity": [
    {
      "type": "analysis",
      "date": "2026-06-12T14:32:00Z",
      "details": {
        "filename": "resume.pdf",
        "score": 78,
        "previousScore": 72
      }
    },
    {
      "type": "job_saved",
      "date": "2026-06-11T10:15:00Z",
      "details": { "jobTitle": "SWE at Stripe" }
    }
  ]
}
```

---

## File Structure

```
web/
├── components/
│   ├── ProfilePage.tsx (existing — keep for reference)
│   ├── ProfilePageClient.tsx (NEW — main client component)
│   ├── profile/ (NEW — tab-specific components)
│   │   ├── DashboardTab.tsx
│   │   ├── CareerProfileTab.tsx
│   │   ├── SettingsTab.tsx
│   │   ├── KpiCard.tsx
│   │   ├── ProfileWelcomeBanner.tsx
│   │   ├── RecentActivityList.tsx
│   │   ├── QuickStartButtons.tsx
│   │   ├── ProfileStrengthIndicator.tsx
│   │   ├── ProfilePreviewCard.tsx
│   │   ├── EditableRoleChips.tsx
│   │   └── ExpandableSection.tsx
│
├── store/
│   ├── profilePageStore.ts (NEW)
│   └── (existing stores remain)
│
├── lib/
│   ├── profileDashboard.ts (NEW — helpers for KPI calculations)
│   └── (existing libs remain)
│
├── hooks/
│   ├── useProfileDashboard.ts (NEW — fetch + manage profile stats)
│   └── (existing hooks remain)
│
resume_gui/
├── routes/
│   ├── profile.py (NEW or enhance existing)
│   └── profile_stats.py (NEW optional — if aggregating on backend)
```

---

## Success Metrics

### User Engagement
- [ ] Profile completion rate increases 20%+ (more users finish filling profile)
- [ ] Time to complete profile decreases (users understand what to fill)
- [ ] Profile field adoption increases (phone, LinkedIn, education filled in more often)

### Flow Integration
- [ ] Click-through rate to Analyze / Tailor / Template Builder increases 15%+
- [ ] Users who visit profile → perform action in same session: 40%+

### Usability
- [ ] Task completion rate in testing: 95%+
- [ ] Median task time: < 3 min for basic profile, < 8 min for full
- [ ] Error rate: < 5% (validation issues, clarification needed)

### Quality
- [ ] Accessibility: WCAG 2.1 AA (auto + manual audit)
- [ ] Mobile: Lighthouse score > 90
- [ ] Performance: Profile load < 1s, auto-save < 200ms

---

## Timeline Estimate

| Phase | Duration | Owner(s) |
|-------|----------|----------|
| 1. Components | 2–3 weeks | Frontend engineer(s) |
| 2. Data integration | 2–3 weeks | Frontend + Backend |
| 3. Language & copy | 1 week | Product/design + content |
| 4. Testing & refinement | 2 weeks | QA + Usability researchers |
| **Total** | **7–9 weeks** | |

**Parallel tracks:** Phases can overlap (e.g., Phase 2 API calls can start while Phase 1 components are being built).

---

## Next Steps

1. **Review & approve design:**
   - Does the 3-tab structure make sense?
   - Any language preferences (formal vs. casual, etc.)?
   - Any data points missing from KPIs?

2. **Figma refinement:**
   - Complete Career Profile and Settings tabs in Figma
   - Add mobile mockups (600px)
   - Add dark mode variants
   - Share for feedback

3. **Finalize data model:**
   - Confirm `user_profiles` fields are sufficient
   - Design `user_preferences` table schema (if needed now)
   - Estimate API cost of new `/api/profile-dashboard` endpoint

4. **Create Jira/Linear tasks:**
   - Break Phase 1 into sprint-sized tasks (~5-8 days each)
   - Assign ownership + estimates
   - Set milestone deadlines

5. **User research (optional but recommended):**
   - Interview 3–5 target users (students, early-career)
   - Test language clarity with simplified prompts guide
   - Validate dashboard concept (do they care about KPIs?)

---

## Questions to Resolve

- [ ] Should scan limits be per-user or per-institution?
- [ ] How should "Recent Activity" be ordered? (newest first? top performing?)
- [ ] Should KPI cards show trends (↑ ↓)? Or just current state?
- [ ] Should profile strength show on the dashboard tab, or only on Career Profile?
- [ ] Should users be able to re-order sections on Career Profile tab?
- [ ] Is there a "public profile" link feature planned? (affects sharing section)
- [ ] Mobile: should settings become a bottom sheet or sidebar?

---

## Related Documents

- [`PROFILE_PAGE_UX_STRATEGY.md`](PROFILE_PAGE_UX_STRATEGY.md) — Information architecture + principles
- [`PROFILE_PAGE_DESIGN_GUIDE.md`](PROFILE_PAGE_DESIGN_GUIDE.md) — Visual design + component specs
- [`SIMPLIFIED_PROMPTS_GUIDE.md`](SIMPLIFIED_PROMPTS_GUIDE.md) — Every label & prompt (before/after)
- **Figma:** https://www.figma.com/design/ddukhKkyCEOc5Tm28PutBS

---

## Questions?

This roadmap is a starting point. Let me know:
- **What's missing?** (data, flows, edge cases)
- **What should change?** (language, structure, priorities)
- **What's unclear?** (ask for clarification)
- **Ready to start?** (let's break Phase 1 into tasks)

