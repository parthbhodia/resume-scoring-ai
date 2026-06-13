"use client";

/**
 * Profile Page — NEW dashboard + settings hub (v2)
 *
 * Three tabs:
 * 1. Dashboard — KPIs, Quick Start, Recent Activity
 * 2. Career Profile — Structured profile editing
 * 3. Settings — Notifications, privacy, account
 *
 * This replaces the old form-heavy ProfilePage.tsx entirely.
 * To use: rename ProfilePage.tsx → ProfilePageOld.tsx, then rename this → ProfilePage.tsx
 */

import dynamic from "next/dynamic";

// Import the new ProfilePageClient with dynamic loading for faster initial render
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
