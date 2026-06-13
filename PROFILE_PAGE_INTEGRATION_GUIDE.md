# Profile Page Integration Guide — Complete Setup

## ✅ What's Been Created

### Frontend
- ✅ `web/components/profile/ProfilePageClient.tsx` — Main container (3 tabs)
- ✅ `web/components/profile/DashboardTab.tsx` — KPIs + recent activity
- ✅ `web/components/profile/CareerProfileTab.tsx` — Profile editing (5 sections)
- ✅ `web/components/profile/SettingsTab.tsx` — Settings + preferences
- ✅ `web/store/profilePageStore.ts` — Zustand store (state management)
- ✅ `web/hooks/useProfileDashboard.ts` — Hook to fetch dashboard data
- ✅ `web/components/ProfilePageNew.tsx` — Wrapper (ready to replace old ProfilePage.tsx)

### Backend
- ✅ `resume_gui/routes/profile_dashboard.py` — `/api/profile-dashboard` endpoint
- ✅ `resume_gui/routes/__init__.py` — Route registered in app

### Documentation
- ✅ Full implementation strategy & design guide
- ✅ Simplified prompts guide (every label before/after)

---

## 🚀 How to Activate (3 Steps)

### Step 1: Replace ProfilePage.tsx (frontend)

**Option A: Quick swap (recommended)**
```bash
cd web/components
mv ProfilePage.tsx ProfilePageOld.tsx
mv ProfilePageNew.tsx ProfilePage.tsx
```

**Option B: Manual update**
Replace the entire content of `web/components/ProfilePage.tsx` with:
```typescript
"use client";
import dynamic from "next/dynamic";

const ProfilePageClient = dynamic(() => import("./profile/ProfilePageClient"), {
  loading: () => (
    <div className="min-h-screen bg-[#f5f5f6] flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 text-[#72727a]">
          <div className="w-4 h-4 border-2 border-[#e5e5e7] border-t-[#3366FF] rounded-full animate-spin" />
          Loading profile…
        </div>
      </div>
    </div>
  ),
  ssr: true,
});

export default function ProfilePage() {
  return <ProfilePageClient />;
}
```

### Step 2: Start the dev server

```bash
# Upgrade Node.js to 20.9+ if needed
node --version  # Should be >= 20.9.0

# Start the dev server
cd web && npm run dev

# Visit: http://localhost:3000/?view=profile
```

### Step 3: Test the basic flow

- [ ] Click Profile in sidebar → Dashboard loads
- [ ] Click tabs → Career Profile and Settings render
- [ ] Form inputs are editable (mock data)
- [ ] Settings toggles work
- [ ] KPI cards display (with mock data)
- [ ] No console errors

---

## 🔌 Backend Integration (Next Phase)

### Current State
- ✅ Endpoint registered: `GET /api/profile-dashboard`
- ✅ Zustand store ready
- ✅ Hook ready
- 🔄 Using **mock data** for now

### To Connect Real Data

#### 1. Update `resume_gui/routes/profile_dashboard.py`

Replace the TODO comments with actual Supabase queries:

```python
# SCANS LEFT TODAY
from resume_gui.services.scan_limits import _scan_limit_status_for_user
scan_status = _scan_limit_status_for_user(user_id, user_email)

# RECENT ACTIVITY (example query structure)
supabase = get_supabase_client()

# Get recent analyses
analyses = supabase.table("resume_analyses") \
    .select("*") \
    .eq("user_id", user_id) \
    .order("created_at", desc=True) \
    .limit(5) \
    .execute()

# Get recent tailored resumes
tailored = supabase.table("resumes") \
    .select("*") \
    .eq("user_id", user_id) \
    .eq("tailored", True) \
    .order("created_at", desc=True) \
    .limit(5) \
    .execute()

# Get recent template builder resumes
builder = supabase.table("template_builder_resumes") \
    .select("*") \
    .eq("user_id", user_id) \
    .order("created_at", desc=True) \
    .limit(5) \
    .execute()

# Format and merge
recent_activity = format_activity(analyses, tailored, builder)
```

#### 2. Update `web/hooks/useProfileDashboard.ts`

Replace mock data with real API call:

```typescript
// BEFORE (mock):
const mockStats: DashboardStats = { ... };
store.setStats(mockStats);

// AFTER (real):
const resp = await fetch(apiUrl("/api/profile-dashboard"));
if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
const data = await resp.json() as ProfileDashboardResponse;
store.setStats(data.stats);
store.setActivity(data.activity);
```

#### 3. Implement auto-save in CareerProfileTab

Add this to `CareerProfileTab.tsx`:

```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    if (dirty) {
      setSaving(true);
      // Call your upsertUserProfile API
      fetch(apiUrl("/api/user-profile"), {
        method: "POST",
        body: JSON.stringify(profile),
      })
        .then(() => {
          setDirty(false);
          setSavedFlash(true);
          setTimeout(() => setSavedFlash(false), 2000);
        })
        .finally(() => setSaving(false));
    }
  }, 1500); // Debounce 1.5s

  return () => clearTimeout(timer);
}, [profile, dirty]);
```

---

## 📊 API Contract

### `/api/profile-dashboard` (GET)

**Request:**
```
GET /api/profile-dashboard
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "stats": {
    "scansUsedToday": 4,
    "scansLimitDaily": 5,
    "analysesTotal": 12,
    "jobsSaved": 3,
    "resumesBuilt": 2
  },
  "activity": [
    {
      "type": "analysis",
      "date": "2026-06-12T14:32:00Z",
      "details": {
        "filename": "resume.pdf",
        "score": 78,
        "previousScore": 72
      }
    }
  ]
}
```

**Error (401):**
```json
{ "error": "Unauthorized" }
```

---

## 🧪 Testing Checklist

### Visual / Interaction
- [ ] Dashboard tab loads with KPI cards
- [ ] Career Profile tab shows all 5 sections
- [ ] Settings tab displays toggles + color picker
- [ ] Tab switching is smooth
- [ ] Mobile responsive (< 600px)
- [ ] Dark mode readable
- [ ] All form inputs are editable
- [ ] Expandable EEO section works

### API Integration
- [ ] KPI cards show real scan count
- [ ] Recent activity populates from DB
- [ ] Profile form loads user data
- [ ] Auto-save works (debounced)
- [ ] Save errors show inline
- [ ] Unauthorized users see error

### Accessibility
- [ ] Tab order: Logo → Tabs → Inputs → Footer
- [ ] Keyboard: Tab/Shift+Tab navigate
- [ ] Screen reader: Announces section titles
- [ ] Focus visible on all buttons
- [ ] Color contrast meets WCAG AA

### Performance
- [ ] Page load < 1.5s
- [ ] Auto-save doesn't block UI
- [ ] Lighthouse score > 90
- [ ] No console errors/warnings

---

## 📝 Database Schema Assumptions

The backend assumes these tables exist:

```sql
-- resume_analyses (for analyzing resumes)
SELECT user_id, created_at, result->'overallScore' as score 
FROM resume_analyses 
WHERE user_id = ?
ORDER BY created_at DESC

-- resumes (for tailored resumes)
SELECT user_id, created_at, name FROM resumes 
WHERE user_id = ? AND tailored = true
ORDER BY created_at DESC

-- template_builder_resumes (for built templates)
SELECT user_id, created_at, name FROM template_builder_resumes 
WHERE user_id = ?
ORDER BY created_at DESC

-- user_profiles (for profile data)
SELECT * FROM user_profiles WHERE user_id = ?
```

If your schema differs, update `profile_dashboard.py` queries accordingly.

---

## 🔄 Fallback Strategy

If backend integration takes time, the frontend will:
1. Use mock data (already hardcoded)
2. Allow users to edit profile locally
3. Auto-save to Supabase when ready
4. Show "loading" state until real data arrives

This means users can test the UX end-to-end before backend is ready.

---

## 🚢 Deployment Checklist

- [ ] Node.js >= 20.9.0 on server
- [ ] Backend endpoint `/api/profile-dashboard` deployed
- [ ] Supabase tables have `user_id` + `created_at` indexed
- [ ] Auth middleware protects `/api/profile-dashboard`
- [ ] CORS allows web origin
- [ ] Environment variables set (API_URL, etc.)
- [ ] Database migrations applied (if any)

---

## 📋 Next Steps (After Testing)

1. **Wire real data** — Update `profile_dashboard.py` with Supabase queries
2. **Implement auto-save** — Add API endpoint for profile updates
3. **Test end-to-end** — Profile form → Save → Verify in DB
4. **Dark mode** — Verify colors in dark theme
5. **Mobile testing** — Test on actual phones (iOS + Android)
6. **Accessibility audit** — Run axe / WAVE
7. **Load testing** — Verify performance under load
8. **Documentation** — Update CLAUDE.md with changes

---

## ❓ Troubleshooting

### Dev server won't start
```
Error: You are using Node.js 16.20.2. For Next.js, Node.js version ">=20.9.0" is required.
```
**Solution:** Upgrade Node.js or use Node version manager (nvm)
```bash
nvm install 20
nvm use 20
```

### Components not rendering
```
Module not found: Can't resolve './profile/ProfilePageClient'
```
**Solution:** Ensure all 4 components are created in `web/components/profile/` directory

### API returns 401
```
Unauthorized error from /api/profile-dashboard
```
**Solution:** Check that:
- User is signed in
- Auth token is valid
- Backend auth middleware is active

### Mock data shows but real data doesn't load
```
Dashboard shows mock KPIs, but doesn't update when data fetches
```
**Solution:** Check browser console for fetch errors, verify API endpoint exists

---

## 🎯 Success Criteria

The profile page is ready for production when:

1. ✅ All 3 tabs render correctly
2. ✅ Dashboard shows real KPIs (not mock)
3. ✅ Users can edit & save profile
4. ✅ Recent activity populates correctly
5. ✅ Mobile layout works (< 600px)
6. ✅ Accessibility audit passes (WCAG 2.1 AA)
7. ✅ Lighthouse score > 90
8. ✅ No console errors
9. ✅ Auto-save works (debounced)
10. ✅ Settings toggle and persist

---

**Current Status:** Frontend complete + backend scaffold ready. Ready to test with mock data, then wire real data.

