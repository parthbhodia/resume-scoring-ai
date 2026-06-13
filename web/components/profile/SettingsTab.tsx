"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Preferences {
  notifyAccountChanges: boolean;
  notifyScanLimit: boolean;
  notifyFeatures: boolean;
  showPhoneOnPdf: boolean;
  fontSize: "compact" | "standard" | "spacious";
  accentColor: string;
}

export function SettingsTab() {
  const [prefs, setPrefs] = useState<Preferences>({
    notifyAccountChanges: true,
    notifyScanLimit: false,
    notifyFeatures: false,
    showPhoneOnPdf: false,
    fontSize: "standard",
    accentColor: "amber",
  });

  const [email] = useState("sarah@example.com");

  const togglePref = (key: keyof Preferences) => {
    setPrefs((prev) => ({
      ...prev,
      [key]: typeof prev[key] === "boolean" ? !prev[key] : prev[key],
    }));
  };

  const colors = [
    { value: "amber", label: "Amber", bg: "bg-[#FFB81C]" },
    { value: "blue", label: "Blue", bg: "bg-[#3366FF]" },
    { value: "teal", label: "Teal", bg: "bg-[#17A398]" },
    { value: "red", label: "Red", bg: "bg-[#FF3B30]" },
  ];

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Sharing & Privacy */}
      <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6">
        <h3 className="text-lg font-semibold text-[#141416] mb-4">
          Sharing & Privacy
        </h3>

        <div className="space-y-4">
          {/* Phone on PDF */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[#141416]">
                Show my phone on résumé PDFs
              </p>
              <p className="text-xs text-[#72727a] mt-1">
                When off, your phone is hidden on exported PDFs. Email is always visible.
              </p>
            </div>
            <button
              onClick={() => togglePref("showPhoneOnPdf")}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                prefs.showPhoneOnPdf
                  ? "bg-[#33CC88]"
                  : "bg-[#e5e5e7]"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  prefs.showPhoneOnPdf ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </Card>

      {/* Display Defaults */}
      <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6">
        <h3 className="text-lg font-semibold text-[#141416] mb-4">
          Résumé Display Defaults
        </h3>
        <p className="text-sm text-[#72727a] mb-4">
          Used when tailoring or creating a résumé.
        </p>

        {/* Font Size */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-[#141416] mb-3">
            Font size
          </label>
          <div className="flex gap-3">
            {([
              { value: "compact", label: "92% (Compact)" },
              { value: "standard", label: "100% (Standard)" },
              { value: "spacious", label: "110% (Spacious)" },
            ] as const).map((option) => (
              <button
                key={option.value}
                onClick={() =>
                  setPrefs((prev) => ({ ...prev, fontSize: option.value }))
                }
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  prefs.fontSize === option.value
                    ? "bg-[#3366FF] text-white"
                    : "bg-[#f5f5f6] text-[#141416] hover:bg-[#e5e5e7]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#99999e] mt-2">
            Standard is best for most résumés.
          </p>
        </div>

        {/* Accent Color */}
        <div>
          <label className="block text-sm font-semibold text-[#141416] mb-3">
            Accent color
          </label>
          <div className="flex gap-3">
            {colors.map((color) => (
              <button
                key={color.value}
                onClick={() =>
                  setPrefs((prev) => ({ ...prev, accentColor: color.value }))
                }
                className={`relative w-10 h-10 rounded-lg transition-all border-2 ${
                  prefs.accentColor === color.value
                    ? "border-[#141416] scale-110"
                    : "border-transparent"
                } ${color.bg}`}
                title={color.label}
              />
            ))}
          </div>
        </div>
      </Card>

      {/* Notifications */}
      <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6">
        <h3 className="text-lg font-semibold text-[#141416] mb-2">
          Email Preferences
        </h3>
        <p className="text-xs text-[#99999e] mb-4">
          We'll send at most 1-2 emails per week.
        </p>

        <div className="space-y-4">
          {[
            {
              key: "notifyAccountChanges" as const,
              label: "Email me when my account changes",
              hint: "(password, email, profile updates)",
            },
            {
              key: "notifyScanLimit" as const,
              label: "Notify me when I reach my daily scan limit",
              hint: "",
            },
            {
              key: "notifyFeatures" as const,
              label: "Tell me about new features and updates",
              hint: "",
            },
          ].map((item) => (
            <div key={item.key} className="flex items-start gap-3">
              <input
                type="checkbox"
                id={item.key}
                checked={prefs[item.key]}
                onChange={() => togglePref(item.key)}
                className="mt-1 w-4 h-4 cursor-pointer"
              />
              <label htmlFor={item.key} className="flex-1 cursor-pointer">
                <p className="text-sm font-medium text-[#141416]">
                  {item.label}
                </p>
                {item.hint && (
                  <p className="text-xs text-[#99999e] mt-1">{item.hint}</p>
                )}
              </label>
            </div>
          ))}
        </div>
      </Card>

      {/* Account */}
      <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6">
        <h3 className="text-lg font-semibold text-[#141416] mb-4">Account</h3>

        <div className="space-y-4">
          {/* Signed In As */}
          <div>
            <p className="text-sm font-medium text-[#141416] mb-2">
              Signed in as
            </p>
            <p className="text-sm text-[#72727a] bg-[#f5f5f6] rounded px-3 py-2">
              {email}
            </p>
          </div>

          {/* Sign Out */}
          <Button
            variant="outline"
            className="w-full justify-start text-[#141416] border-[#e5e5e7] hover:bg-[#f5f5f6]"
            onClick={() => {
              // TODO: Implement sign out
              console.log("Signing out...");
            }}
          >
            Sign out
          </Button>

          {/* Delete Account */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full justify-start bg-[#FF3B30]/10 text-[#FF3B30] border-[#FF3B30]/20 hover:bg-[#FF3B30]/20"
              >
                Delete account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-4">
                <p>
                  This will permanently delete:
                </p>
                <ul className="list-disc list-inside space-y-2 text-sm text-[#72727a]">
                  <li>Your profile</li>
                  <li>All saved analyses</li>
                  <li>All tailored resumes</li>
                  <li>All saved jobs</li>
                </ul>
                <p className="font-semibold text-[#141416]">
                  This cannot be undone.
                </p>
                <div>
                  <label className="block text-sm font-medium text-[#141416] mb-2">
                    Type your email to confirm:
                  </label>
                  <input
                    type="email"
                    placeholder={email}
                    className="w-full px-3 py-2 border border-[#e5e5e7] rounded text-sm"
                  />
                </div>
              </AlertDialogDescription>
              <div className="flex gap-3 justify-end">
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-[#FF3B30] hover:bg-[#FF3B30]/90">
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
