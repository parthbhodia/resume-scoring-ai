# Simplified Prompts & UX Language Guide — Resunova Profile Page

This document provides **clear, jargon-free language** for every prompt, tooltip, label, and instruction in the new profile page. The goal: help non-technical users (college students, career-changers) feel in control, not intimidated.

---

## Principles

1. **Assume no resume knowledge** — don't say "ATS" or "tailoring" without explaining
2. **Use questions over commands** — "What roles are you looking for?" not "Enter target roles"
3. **Be honest about timing** — "This takes about 30 seconds" or "It's optional"
4. **Celebrate progress** — "You're 3 fields away from complete" not "75% done"
5. **Explain the *why*** — "We use this to suggest matching keywords when you tailor"
6. **Use examples liberally** — "e.g., Backend engineer, Product Manager"

---

## Dashboard Tab

### Welcome Section

#### Title + Subtitle
```
❌ OLD:
"Welcome to your Profile"

✅ NEW:
"Welcome back! 👋"
```

#### Context Message
```
❌ OLD:
"You have 4 scans remaining today per institution policy"

✅ NEW:
"Ready for your next career move? You've got 4 scans left today.
Reset at midnight."
```

**Why:** "Ready for your next career move?" connects the feature to user intent. "Scans left" is concrete. "Reset at midnight" answers the next question they'll ask.

---

### KPI Cards

#### Scans Left (Today)

```
❌ OLD:
Scan Quota Status: 4/5 (80%)

✅ NEW:
📊 Scans Left Today
4 / 5
(Resets at midnight)
```

**Tooltip on hover:**
```
"You get 5 free scans per day to analyze and score your resume.
Each time you upload or re-analyze, it uses one scan.
Signed-in users get 5/day; this resets at midnight PT."
```

#### Jobs Saved

```
❌ OLD:
Bookmarked Job Descriptions: 3

✅ NEW:
💼 Jobs Saved
3
(From "Tailor to Job" flow)
```

**Tooltip:**
```
"Jobs you've saved from the 'Tailor to Job' flow.
Click a job to re-tailor your resume to that job description."
```

#### Resumes Built

```
❌ OLD:
Templates Created: 2

✅ NEW:
📄 Resumes Built
2
(Using Template Builder)
```

**Tooltip:**
```
"Résumés you've designed in the Template Builder.
Click one to edit or download it as a PDF."
```

---

### Quick Start Buttons

#### Primary Button (Analyze Resume)

```
❌ OLD:
[Begin Analysis]

✅ NEW:
[🔍 Analyze Resume]
```

**Sub-label:** "See your score, top issues, and instant fixes"

**On-click tooltip:**
```
"Upload a PDF or Word resume. We'll score it (0-100) and show you:
• How recruiter-friendly it is
• Top 3 things to fix (with instant suggestions)
• Keyword match breakdown (if you paste a job description)"
```

#### Secondary Button (Tailor to Job)

```
❌ OLD:
[Begin Tailoring]

✅ NEW:
[👔 Tailor to Job]
```

**Sub-label:** "Customize your resume for a specific job"

**On-click tooltip:**
```
"Paste a job description. We'll analyze it and suggest:
• Keywords to add from the job
• Bullets to rewrite for better match
• A reordered resume that highlights the most relevant parts"
```

#### Tertiary Button (Template Builder)

```
❌ OLD:
[Open Resume Designer]

✅ NEW:
[✨ Use Template Builder]
```

**Sub-label:** "Create a beautiful resume from scratch"

**On-click tooltip:**
```
"Design a résumé with a clean, modern layout.
Choose your style, enter your info, and download as PDF.
No account needed—start free."
```

---

### Recent Activity

#### Section Header
```
❌ OLD:
"Action Log"

✅ NEW:
"Recent Activity"
```

#### Activity Items

```
❌ OLD:
"Analysis#42 completed at 2026-06-12 14:32 — Score: 78/100"

✅ NEW:
"• Analyzed resume.pdf — Score: 78 (was 72)"
"• Saved job: 'SWE at Stripe' 5h ago"
"• Built 'Modern Tech Résumé' (2 days ago)"
```

**On-click:** "View analysis" or "Re-tailor to this job"

---

## Career Profile Tab

### Who You Are

#### Display Name

```
❌ OLD:
"Full Name"

✅ NEW:
"Your name"
```

**Placeholder:** "Sarah Chen"

**Helper text:** "This appears at the top of your résumé and exported PDFs."

---

#### Tagline / Subtitle

```
❌ OLD:
"Professional Headline"

✅ NEW:
"One-liner (optional)"
```

**Placeholder:** "Data engineer · Python & SQL · NYC"

**Helper text:** "A short phrase that describes you. Used when no custom summary is written."

**Validation (live as user types):**
- ✅ 0–90 chars: "Looks good"
- ⚠️ 90–120 chars: "Getting long — you have 90/140"
- ❌ 120+ chars: "Too long — trim to 120 characters"

---

#### Profile Strength Indicator

```
❌ OLD:
"Profile Strength: 75% · Keep going"

✅ NEW:
"You're 3 fields away from complete
(Phone, GPA, LinkedIn)"
```

**Full breakdown (on click):**
- ✅ Name — Done
- ✅ Email — Done
- ✅ School — Done
- ❌ Phone — Optional, but helps
- ❌ LinkedIn — Optional (but recommended)
- ❌ GPA — Optional (leave blank if < 3.5)

---

### Contact & Links

#### Email

```
❌ OLD:
"Email Address"

✅ NEW:
"Email"
```

**Pre-filled from:** "Your account email (you@example.com). Change it if you want a different one on your résumé."

**Helper text:** "This is where employers will contact you."

**Inline validation (on blur):**
```
❌ "not-an-email" → "Use a valid email like you@example.com"
❌ "you@.com" → "Missing the domain"
✅ "you@example.com" → (no message, green checkmark)
```

---

#### Phone

```
❌ OLD:
"Phone Number"

✅ NEW:
"Phone (optional)"
```

**Placeholder:** "+1 (555) 123-4567"

**Helper text:** "Leave blank if you don't want it on your résumé. We'll never share it."

**Validation:**
- Auto-formats as user types (if possible)
- Non-blocking — no error if left blank or malformed (it's optional)

---

#### LinkedIn

```
❌ OLD:
"LinkedIn Profile URL"

✅ NEW:
"LinkedIn (optional)"
```

**Placeholder:** "linkedin.com/in/your-handle"

**Helper text:** "Your LinkedIn profile link. Leave blank if you don't have one."

**Inline validation:**
```
❌ "linkedin.com/in/you and more text" → "Looks off — try linkedin.com/in/your-handle"
✅ "linkedin.com/in/sarah-chen-123" → (green checkmark)
```

---

#### Portfolio / GitHub

```
❌ OLD:
"Portfolio URL"

✅ NEW:
"Portfolio or GitHub (optional)"
```

**Placeholder:** "github.com/yourusername"

**Helper text:** "Link to your projects, code samples, or portfolio site."

**Validation:**
```
❌ "my website" → "Use a valid URL like https://github.com/you"
✅ "https://github.com/sarahchen" → (green checkmark)
```

---

### What You're Looking For

#### Roles

```
❌ OLD:
"Target Job Titles"

✅ NEW:
"What roles are you looking for?"
```

**Placeholder:** "Backend engineer, Data engineer, SRE"

**Helper text:** "Comma-separated. We use these to focus tailoring suggestions and (soon) match you with relevant job postings."

**Examples (on focus):**
```
"E.g., Software Engineer, Product Manager, Data Analyst
Or level: Intern, Junior, Senior"
```

---

#### Locations

```
❌ OLD:
"Preferred Locations"

✅ NEW:
"Where do you want to work?"
```

**Placeholder:** "Remote · San Francisco, CA · New York, NY"

**Helper text:** "Cities, regions, or 'Remote'. Separate with · or commas."

---

### Your Background

#### School

```
❌ OLD:
"University Name"

✅ NEW:
"School"
```

**Placeholder:** "University of Maryland, College Park"

**Helper text:** "Leave blank if you haven't graduated yet."

---

#### Degree

```
❌ OLD:
"Degree"

✅ NEW:
"Degree (optional)"
```

**Placeholder:** "B.S. Computer Science"

**Helper text:** "E.g., B.S., B.A., M.S., MBA"

---

#### Graduation Date

```
❌ OLD:
"Expected Graduation"

✅ NEW:
"When are you graduating?"
```

**Placeholder:** "May 2027"

**Helper text:** "Format: Month Year (e.g., May 2027). Leave blank if already graduated."

**Display (after input):**
```
"Graduating May 2027 (in ~1.2 years)"
or
"Graduated May 2023 (3 years ago)"
```

---

#### GPA

```
❌ OLD:
"Grade Point Average (optional)"

✅ NEW:
"GPA (optional)"
```

**Placeholder:** "3.8"

**Helper text:** "Only include if it's 3.5 or higher. Most recruiters don't check this after 2 years of experience."

---

### For Job Applications

#### Section Header + Info Icon

```
❌ OLD:
"Equal Employment Opportunity (EEO) Information (Optional)"

✅ NEW:
"For job applications (optional)"
```

**Tooltip (on info icon):**
```
"Some job boards ask the same diversity questions on every application.
If you fill these out here, we can auto-fill them on supported job forms.

We never share these with employers or use them for scoring.
Employers only use them for compliance and diversity reporting."
```

---

#### Individual EEO Questions

**Format:** Radio group with Clear button

```
❌ OLD:
"Are you authorized to work in the United States?"

✅ NEW:
"Are you authorized to work in the U.S.?"
```

**Options:**
- ( ) Yes
- ( ) No
- [Clear this answer]

**Tooltip (on question mark icon):**
```
"This is required on most job applications.
Your answer helps employers assess visa sponsorship needs.
(This is NOT used for resume scoring.)"
```

---

**All 6 questions simplified similarly:**

1. ✅ "Are you authorized to work in the U.S.?"
2. ✅ "Will you need visa sponsorship?"
3. ✅ "Do you have a disability?" (with "Decline to state" option)
4. ✅ "Are you a veteran?" (with "Decline to state" option)
5. ✅ "What is your gender?" (with "Decline to state" option)
6. ✅ "Do you identify as LGBTQ+?" (with "Decline to state" option)

**Fine print at bottom:**
```
"Employers use this information for compliance and diversity reporting.
We never share these answers with anyone or use them for resume scoring."
```

---

### Résumé Tailoring Defaults

#### Section Header

```
❌ OLD:
"Tailoring Configuration"

✅ NEW:
"When you tailor a resume, use…"
```

---

#### Default Tone

```
❌ OLD:
"Default Tone Setting"

✅ NEW:
"Tone"
```

**Options (as clickable cards):**
- [ ] **Confident & concise** (recommended)
- [ ] Formal
- [ ] Friendly

**Helper text:**
```
"This controls how rewrites sound.
'Confident & concise' is best for most jobs."
```

---

#### Default Section Order

```
❌ OLD:
"Canonical Section Layout"

✅ NEW:
"Section order"
```

**Options (as cards or dropdown):**
- **Summary → Experience → Projects → Education**
- Experience → Summary → Education
- Education → Experience → …

**Helper text:**
```
"The order sections appear on your résumé when you tailor.
Recent grads: Education first. Experienced: Experience first."
```

---

#### Font Size

```
❌ OLD:
"Type Scale"

✅ NEW:
"Font size"
```

**Options (as 3 buttons):**
- [ ] 92% (compact)
- [X] 100% (standard)
- [ ] 110% (spacious)

**Helper text:**
```
"Controls readability vs. fitting more content.
Standard is best for most résumés."
```

---

## Settings Tab

### Sharing & Privacy

#### Show Phone on Résumé PDFs

```
❌ OLD:
"Contact Information Visibility"

✅ NEW:
"Show my phone on résumé PDFs"
```

**State:** [Toggle] OFF by default

**Helper text:**
```
"When off, your phone is hidden on exported PDFs.
Employers can still find your email (which is always visible)."
```

---

#### Hide Full Address

```
❌ OLD:
"Address Privacy Mode"

✅ NEW:
"Show city only (not full address)"
```

**State:** [Toggle] OFF by default

**Helper text:**
```
"When on, 'San Francisco, CA' instead of your full address.
Privacy without losing location context."
```

---

### Notifications

#### Email Preferences Header

```
❌ OLD:
"Communication Settings"

✅ NEW:
"Email preferences"
```

**Sub-header:** "We'll send at most 1-2 emails per week"

---

#### Notification Options

```
❌ OLD:
□ Notify on account modifications
□ Quota status alerts
□ Product feature announcements

✅ NEW:
☑ Email me when my account changes (password, email, etc.)
□ Notify me when I reach my daily scan limit
□ Tell me about new features and updates
```

---

### Account

#### Signed In As

```
❌ OLD:
"Current Authentication State"

✅ NEW:
"Signed in as"
```

**Display (read-only):**
```
"you@example.com"
```

---

#### Sign Out

```
❌ OLD:
[Logout]

✅ NEW:
[Sign out]
```

**Confirmation dialog (on click):**
```
"Sign out of Resunova?"

You'll need to sign in again to access your analyses and saved jobs.
Your profile is saved and will be there when you return.

[Cancel] [Sign out]
```

---

#### Delete Account

```
❌ OLD:
[Remove Account]

✅ NEW:
[Delete account]
```

**Warning state:**
- Button is disabled initially: "Delete account (you'll need to confirm)"

**On click → confirmation dialog:**
```
"⚠️ Delete your account?"

This will permanently delete:
• Your profile
• All saved analyses
• All tailored resumes
• All job saved

This cannot be undone.

Type your email to confirm: [you@example.com]

[Cancel] [Delete my account]
```

---

## Inline Validation Patterns

### Email Validation

```
On focus: Remove any error highlighting
On blur: Check if valid email
❌ Invalid: "Use a valid email like you@example.com"
✅ Valid: (no message, or green checkmark)
```

### URL Validation

```
On blur: Check if valid URL
❌ Invalid: "Looks off — try linkedin.com/in/your-handle"
✅ Valid: (no message)
Can also auto-prepend https:// if not present
```

### Phone Number

```
On blur: Optionally format as user types
❌ Invalid: Non-blocking (it's optional, no error)
✅ Valid: (no message)
```

---

## Save Indicators

### Auto-Save Status

**Bottom of page, sticky footer:**

```
State: Saving
[spinner] Saving…

State: Saved
✓ All changes saved · auto-save on

State: Unsaved (has changes)
[amber dot] Auto-saving shortly…

State: Error (retry)
[spinner] Retrying… (if save fails, show retry)
⚠️ Couldn't save — [Retry]
```

---

## Progressive Disclosure

### Initially Collapsed

- EEO section (marked "Optional")
- Tailoring Defaults (marked "Preview")
- Account settings (marked "Danger zone")

### On Click → Expand with Smooth Animation

```
[▼] For job applications (optional)
    ↓ (expands)
    [▲] For job applications (optional)
    
    Are you authorized to work in the U.S.?
    ( ) Yes  ( ) No  [Clear]
    
    (more questions...)
```

---

## Empty States

### Sparse Profile

```
"Your profile is still pretty empty"
Upload a PDF or use the guided form — we only fill empty fields.
[Upload PDF] [Try guided form]
```

### No Recent Activity

```
"No recent activity yet"
Start by analyzing a résumé or tailoring to a job.
[Analyze Resume] [Tailor to Job]
```

### No Jobs Saved

```
"You haven't saved any jobs yet"
Go to 'Tailor to Job' and save a job to track it here.
[Tailor to Job]
```

---

## Error Messages

### Generic Error

```
❌ "Something went wrong"
[Retry]

(If persists after 2 retries)
"Still having trouble? [Contact support]"
```

### Upload Errors

```
❌ "That file is too large (max 10MB)"
❌ "We couldn't read that file — try a PDF or Word doc"
❌ "That upload took too long — try again or [contact support]"
```

### Network Errors

```
❌ "No internet connection"
Check your connection and [try again]
```

---

## Success Messages

### Profile Saved

```
✓ "Changes saved!"
(disappears after 2 seconds)
```

### PDF Exported

```
✓ "resume.pdf downloaded!"
(disappears after 3 seconds)
```

---

## Keyboard & Accessibility

### Screen Reader Announcements (aria-live regions)

```
"Profile strength updated: You're 3 fields away from complete"
"Section expanded: For job applications"
"Changes saved automatically"
"Error saving profile — please retry"
```

### Tooltip Accessibility

```
<button aria-describedby="tooltip-1">
  Save phone on résumé PDFs
  <span id="tooltip-1" role="tooltip">
    When off, your phone number is hidden on exported PDFs.
  </span>
</button>
```

---

## Summary: Before vs. After Language

| Current | New | Why |
|---------|-----|-----|
| "Profile strength 75%" | "3 fields away from complete" | Actionable, not percentage |
| "EEO answers" | "For job applications" | Real-world term |
| "Tailoring defaults" | "When you tailor a resume, use…" | Explains purpose |
| "Equal employment" | (no label, hidden section) | Jargon-free |
| "Upload PDF, we fill empty fields" | "Have a recent resume? Upload it — we auto-fill the basics" | Benefit-focused |
| "LinkedIn Profile URL" | "LinkedIn (optional)" | Simple + optional label |
| "Canonical section layout" | "Section order" | Plain English |

---

## Testing Checklist

- [ ] All prompts tested with users (ages 18–40)
- [ ] No jargon remains (ask: "What does X mean?")
- [ ] All labels are < 50 characters
- [ ] Inline helpers explain the *why*, not just the *what*
- [ ] Error messages suggest a fix, not just the problem
- [ ] Mobile: all text readable at 12px font size
- [ ] Dark mode: all text meets 4.5:1 contrast ratio

