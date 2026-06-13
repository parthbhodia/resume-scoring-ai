"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Link from "next/link";

interface DashboardStats {
  scansUsedToday: number;
  scansLimitDaily: number;
  analysesTotal: number;
  jobsSaved: number;
  resumesBuilt: number;
}

interface Activity {
  type: "analysis" | "job_saved" | "resume_built";
  date: string;
  details: Record<string, any>;
}

export function DashboardTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch from /api/profile-dashboard
    // For now, use mock data
    setStats({
      scansUsedToday: 4,
      scansLimitDaily: 5,
      analysesTotal: 12,
      jobsSaved: 3,
      resumesBuilt: 2,
    });

    setActivity([
      {
        type: "analysis",
        date: new Date().toISOString(),
        details: { filename: "resume.pdf", score: 78, previousScore: 72 },
      },
      {
        type: "job_saved",
        date: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        details: { jobTitle: "SWE at Stripe" },
      },
      {
        type: "resume_built",
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        details: { templateName: "Modern Tech Résumé" },
      },
    ]);

    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="text-center py-8 text-[#72727a]">
        <div className="inline-flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-[#e5e5e7] border-t-[#3366FF] rounded-full animate-spin" />
          Loading stats…
        </div>
      </div>
    );
  }

  if (!stats) {
    return <div className="text-center py-8 text-[#72727a]">Failed to load stats</div>;
  }

  const scansRemaining = stats.scansLimitDaily - stats.scansUsedToday;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6">
        <h2 className="text-xl font-semibold text-[#141416] mb-2">
          Welcome back! 👋
        </h2>
        <p className="text-sm text-[#72727a]">
          Ready for your next career move? You've got{" "}
          <strong className="text-[#141416]">{scansRemaining} scans left today</strong>. Reset at midnight PT.
        </p>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Scans */}
        <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6 flex flex-col items-start gap-3">
          <div className="text-2xl">📊</div>
          <div className="text-xs font-semibold text-[#99999e] uppercase tracking-wide">
            Scans Left Today
          </div>
          <div className="text-2xl font-bold text-[#3366FF]">
            {scansRemaining} / {stats.scansLimitDaily}
          </div>
          <div className="text-xs text-[#99999e] mt-auto">
            Resets at midnight PT
          </div>
        </Card>

        {/* Jobs */}
        <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6 flex flex-col items-start gap-3">
          <div className="text-2xl">💼</div>
          <div className="text-xs font-semibold text-[#99999e] uppercase tracking-wide">
            Jobs Saved
          </div>
          <div className="text-2xl font-bold text-[#33CC88]">
            {stats.jobsSaved}
          </div>
          <div className="text-xs text-[#99999e] mt-auto">
            From Tailor flow
          </div>
        </Card>

        {/* Resumes */}
        <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6 flex flex-col items-start gap-3">
          <div className="text-2xl">📄</div>
          <div className="text-xs font-semibold text-[#99999e] uppercase tracking-wide">
            Resumes Built
          </div>
          <div className="text-2xl font-bold text-[#FF9933]">
            {stats.resumesBuilt}
          </div>
          <div className="text-xs text-[#99999e] mt-auto">
            Via Template Builder
          </div>
        </Card>
      </div>

      {/* Quick Start */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[#141416]">Quick Start</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link href="/?view=analyze">
            <Button
              className="w-full bg-[#3366FF] hover:bg-[#2952cc] text-white font-semibold py-2 h-auto"
              size="lg"
            >
              🔍 Analyze Resume
            </Button>
          </Link>
          <Link href="/?view=tailor">
            <Button
              variant="outline"
              className="w-full border border-[#e5e5e7] text-[#141416] hover:bg-[#f5f5f6] font-semibold py-2 h-auto"
              size="lg"
            >
              👔 Tailor to Job
            </Button>
          </Link>
        </div>
        <Link href="/template-builder">
          <Button
            variant="outline"
            className="w-full border border-[#e5e5e7] text-[#141416] hover:bg-[#f5f5f6] font-semibold py-2 h-auto"
            size="lg"
          >
            ✨ Use Template Builder
          </Button>
        </Link>
      </div>

      {/* Recent Activity */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[#141416]">Recent Activity</h3>
        <Card className="bg-white border border-[#e5e5e7] rounded-lg p-4 divide-y divide-[#e5e5e7]">
          {activity.length === 0 ? (
            <p className="text-sm text-[#72727a] py-4">
              No recent activity. Start by analyzing a résumé or tailoring to a job!
            </p>
          ) : (
            activity.map((item, idx) => (
              <div key={idx} className="py-3 first:pt-0 last:pb-0">
                {item.type === "analysis" && (
                  <p className="text-sm text-[#72727a]">
                    • Analyzed{" "}
                    <strong className="text-[#141416]">
                      {item.details.filename}
                    </strong>{" "}
                    — Score:{" "}
                    <strong className="text-[#3366FF]">{item.details.score}</strong>
                    {item.details.previousScore && (
                      <span className="text-[#33CC88]">
                        {" "}
                        (↑ from {item.details.previousScore})
                      </span>
                    )}
                  </p>
                )}
                {item.type === "job_saved" && (
                  <p className="text-sm text-[#72727a]">
                    • Saved job:{" "}
                    <strong className="text-[#141416]">
                      "{item.details.jobTitle}"
                    </strong>
                  </p>
                )}
                {item.type === "resume_built" && (
                  <p className="text-sm text-[#72727a]">
                    • Built{" "}
                    <strong className="text-[#141416]">
                      "{item.details.templateName}"
                    </strong>
                  </p>
                )}
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
