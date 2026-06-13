"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getSupabaseClient } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotifyPrefs {
  accountChanges: boolean;
  scanLimit: boolean;
  features: boolean;
}

interface DisplayPrefs {
  fontSize: "compact" | "standard" | "spacious";
  accentColor: string;
  showPhoneOnPdf: boolean;
}

const DEFAULT_NOTIFY: NotifyPrefs = { accountChanges: true, scanLimit: false, features: false };
const DEFAULT_DISPLAY: DisplayPrefs = { fontSize: "standard", accentColor: "amber", showPhoneOnPdf: false };

const NOTIFY_KEY = "rn_notify_prefs_v1";
const DISPLAY_KEY = "rn_display_prefs_v1";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SettingsTab() {
  const router = useRouter();

  // Notification prefs — persisted to localStorage
  const [notify, setNotify] = useState<NotifyPrefs>(() => loadLocal(NOTIFY_KEY, DEFAULT_NOTIFY));

  // Display prefs — persisted to localStorage
  const [display, setDisplay] = useState<DisplayPrefs>(() => loadLocal(DISPLAY_KEY, DEFAULT_DISPLAY));

  // Real signed-in user email from Supabase
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Delete account confirmation input
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  // Load user email on mount
  useEffect(() => {
    const db = getSupabaseClient();
    db.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, []);

  // Persist notify prefs
  useEffect(() => { saveLocal(NOTIFY_KEY, notify); }, [notify]);

  // Persist display prefs
  useEffect(() => { saveLocal(DISPLAY_KEY, display); }, [display]);

  const toggleNotify = useCallback((key: keyof NotifyPrefs) => {
    setNotify(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const db = getSupabaseClient();
      await db.auth.signOut();
      router.push("/");
    } catch {
      setSigningOut(false);
    }
  }, [router]);

  const COLORS = [
    { value: "amber", label: "Amber", bg: "bg-[#FFB81C]" },
    { value: "blue",  label: "Blue",  bg: "bg-[#3366FF]" },
    { value: "teal",  label: "Teal",  bg: "bg-[#17A398]" },
    { value: "red",   label: "Red",   bg: "bg-[#FF3B30]" },
  ];

  const FONT_SIZES = [
    { value: "compact",  label: "92% (Compact)"  },
    { value: "standard", label: "100% (Standard)" },
    { value: "spacious", label: "110% (Spacious)" },
  ] as const;

  const NOTIFY_ITEMS: { key: keyof NotifyPrefs; label: string; hint?: string }[] = [
    { key: "accountChanges", label: "Email me when my account changes", hint: "password, email, profile updates" },
    { key: "scanLimit",      label: "Notify me when I reach my daily scan limit" },
    { key: "features",       label: "Tell me about new features and updates" },
  ];

  return (
    <div className="space-y-5 max-w-2xl">

      {/* ── Email Preferences ─────────────────────────────────────────────── */}
      <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6">
        <h3 className="text-lg font-semibold text-[#141416] mb-1">
          Email Preferences
        </h3>
        <p className="text-xs text-[#99999e] mb-5">
          We&apos;ll send at most 1–2 emails per week.
        </p>

        <div className="flex flex-col gap-4">
          {NOTIFY_ITEMS.map(item => (
            <label
              key={item.key}
              className="flex items-start gap-3 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={notify[item.key]}
                onChange={() => toggleNotify(item.key)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-[#3366FF] rounded"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[#141416] leading-snug">
                  {item.label}
                </span>
                {item.hint && (
                  <span className="block text-xs text-[#99999e] mt-0.5">
                    ({item.hint})
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </Card>

      {/* ── Sharing & Privacy ─────────────────────────────────────────────── */}
      <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6">
        <h3 className="text-lg font-semibold text-[#141416] mb-4">
          Sharing &amp; Privacy
        </h3>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#141416]">
              Show my phone on résumé PDFs
            </p>
            <p className="text-xs text-[#72727a] mt-1">
              When off, your phone is hidden on exported PDFs.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={display.showPhoneOnPdf}
            onClick={() => setDisplay(p => ({ ...p, showPhoneOnPdf: !p.showPhoneOnPdf }))}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              display.showPhoneOnPdf ? "bg-[#33CC88]" : "bg-[#e5e5e7]"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                display.showPhoneOnPdf ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </Card>

      {/* ── Résumé Display Defaults ───────────────────────────────────────── */}
      <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6">
        <h3 className="text-lg font-semibold text-[#141416] mb-1">
          Résumé Display Defaults
        </h3>
        <p className="text-sm text-[#72727a] mb-5">
          Used when tailoring or creating a résumé.
        </p>

        {/* Font Size */}
        <div className="mb-6">
          <p className="text-sm font-semibold text-[#141416] mb-3">Font size</p>
          <div className="flex gap-2">
            {FONT_SIZES.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDisplay(p => ({ ...p, fontSize: opt.value }))}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  display.fontSize === opt.value
                    ? "bg-[#3366FF] text-white"
                    : "bg-[#f5f5f6] text-[#141416] hover:bg-[#e5e5e7]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#99999e] mt-2">Standard is best for most résumés.</p>
        </div>

        {/* Accent Color */}
        <div>
          <p className="text-sm font-semibold text-[#141416] mb-3">Accent color</p>
          <div className="flex gap-3">
            {COLORS.map(color => (
              <button
                key={color.value}
                type="button"
                title={color.label}
                onClick={() => setDisplay(p => ({ ...p, accentColor: color.value }))}
                className={`relative h-10 w-10 rounded-lg border-2 transition-all ${color.bg} ${
                  display.accentColor === color.value
                    ? "border-[#141416] scale-110"
                    : "border-transparent hover:scale-105"
                }`}
              />
            ))}
          </div>
        </div>
      </Card>

      {/* ── Account ───────────────────────────────────────────────────────── */}
      <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6">
        <h3 className="text-lg font-semibold text-[#141416] mb-4">Account</h3>

        <div className="flex flex-col gap-4">
          {/* Signed In As */}
          <div>
            <p className="text-sm font-medium text-[#141416] mb-2">Signed in as</p>
            <p className="text-sm text-[#72727a] bg-[#f5f5f6] rounded px-3 py-2 truncate">
              {userEmail ?? "Loading…"}
            </p>
          </div>

          {/* Sign Out */}
          <Button
            variant="outline"
            disabled={signingOut}
            className="w-full justify-start text-[#141416] border-[#e5e5e7] hover:bg-[#f5f5f6]"
            onClick={() => void handleSignOut()}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>

          {/* Delete Account */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start bg-[#FF3B30]/10 text-[#FF3B30] border-[#FF3B30]/20 hover:bg-[#FF3B30]/20"
              >
                Delete account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4 text-sm text-[#72727a]">
                  <p>This will permanently delete:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Your profile</li>
                    <li>All saved analyses</li>
                    <li>All tailored résumés</li>
                    <li>All saved jobs</li>
                  </ul>
                  <p className="font-semibold text-[#141416]">This cannot be undone.</p>
                  <div>
                    <label className="block text-sm font-medium text-[#141416] mb-2">
                      Type your email to confirm:
                    </label>
                    <input
                      type="email"
                      placeholder={userEmail ?? "your@email.com"}
                      value={deleteConfirmEmail}
                      onChange={e => setDeleteConfirmEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-[#e5e5e7] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]/30"
                    />
                  </div>
                </div>
              </AlertDialogDescription>
              <div className="flex gap-3 justify-end mt-4">
                <AlertDialogCancel onClick={() => setDeleteConfirmEmail("")}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleteConfirmEmail !== userEmail}
                  className="bg-[#FF3B30] hover:bg-[#FF3B30]/90 disabled:opacity-40"
                >
                  Delete my account
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Card>
    </div>
  );
}
