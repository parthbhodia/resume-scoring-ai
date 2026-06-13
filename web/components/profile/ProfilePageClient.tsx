"use client";

/**
 * Profile Page — New dashboard + settings hub
 *
 * Three tabs:
 * 1. Dashboard — KPIs, Quick Start, Recent Activity
 * 2. Career Profile — Structured profile editing
 * 3. Settings — Notifications, privacy, account
 *
 * Replaces the old form-heavy ProfilePage.tsx
 */

import { useState, useEffect } from "react";
import { DashboardTab } from "./DashboardTab";
import { CareerProfileTab } from "./CareerProfileTab";
import { SettingsTab } from "./SettingsTab";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TabValue = "dashboard" | "career" | "settings";

export default function ProfilePageClient() {
  const [activeTab, setActiveTab] = useState<TabValue>("dashboard");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // TODO: Load profile + stats on mount
    setIsLoading(false);
  }, []);

  return (
    <div className="min-h-screen bg-[#f5f5f6]">
      {/* Header */}
      <div className="bg-white border-b border-[#e5e5e7]">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <h1 className="text-3xl font-bold text-[#141416] mb-2">Profile</h1>
          <p className="text-sm text-[#72727a]">
            Manage your career info, preferences, and account settings.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-8 py-6">
        <Tabs
          value={activeTab}
          onValueChange={(v: string) => setActiveTab(v as TabValue)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3 mb-8 bg-transparent border-b border-[#e5e5e7]">
            <TabsTrigger
              value="dashboard"
              className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-[#3366FF] rounded-none"
            >
              Dashboard
            </TabsTrigger>
            <TabsTrigger
              value="career"
              className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-[#3366FF] rounded-none"
            >
              Career Profile
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-[#3366FF] rounded-none"
            >
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Content */}
          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center gap-2 text-[#72727a]">
                <div className="w-4 h-4 border-2 border-[#e5e5e7] border-t-[#3366FF] rounded-full animate-spin" />
                Loading profile…
              </div>
            </div>
          ) : (
            <>
              <TabsContent value="dashboard">
                <DashboardTab />
              </TabsContent>

              <TabsContent value="career">
                <CareerProfileTab />
              </TabsContent>

              <TabsContent value="settings">
                <SettingsTab />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </div>
  );
}
