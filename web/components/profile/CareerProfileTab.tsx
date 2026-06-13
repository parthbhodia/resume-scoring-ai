"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Profile {
  displayName: string;
  tagline: string;
  email: string;
  phone: string;
  linkedin: string;
  portfolio: string;
  headline: string;
  roles: string;
  locations: string;
  school: string;
  degree: string;
  graduation: string;
  gpa: string;
}

export function CareerProfileTab() {
  const [profile, setProfile] = useState<Profile>({
    displayName: "Sarah Chen",
    tagline: "Data engineer · Python & SQL · NYC",
    email: "sarah@example.com",
    phone: "+1 (555) 123-4567",
    linkedin: "linkedin.com/in/sarah-chen",
    portfolio: "github.com/sarahchen",
    headline: "CS graduate · ML internships · Python & Rust",
    roles: "Backend engineer, Data engineer, SRE",
    locations: "Remote · San Francisco · New York",
    school: "University of Maryland, College Park",
    degree: "B.S. Computer Science",
    graduation: "May 2027",
    gpa: "3.8",
  });

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );

  const toggleSection = (section: string) => {
    const newSections = new Set(expandedSections);
    if (newSections.has(section)) {
      newSections.delete(section);
    } else {
      newSections.add(section);
    }
    setExpandedSections(newSections);
  };

  const handleInputChange = (field: keyof Profile, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
    // TODO: Implement auto-save
  };

  const profileStrength = Math.round(
    ((Object.values(profile).filter((v) => v && v.trim()).length /
      Object.keys(profile).length) *
      100) /
      100 * 75
  );

  return (
    <div className="space-y-5">
      {/* Section 1: Who You Are */}
      <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6">
        <h3 className="text-lg font-semibold text-[#141416] mb-4">
          Who You Are
        </h3>
        <p className="text-sm text-[#72727a] mb-4">
          Appears at the top of exported PDFs and shared links.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#141416] mb-2">
              Your name
            </label>
            <Input
              value={profile.displayName}
              onChange={(e) =>
                handleInputChange("displayName", e.target.value)
              }
              className="w-full text-lg font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#141416] mb-2">
              One-liner (optional)
            </label>
            <Input
              value={profile.tagline}
              onChange={(e) => handleInputChange("tagline", e.target.value)}
              placeholder="Data engineer · Python & SQL · NYC"
              className="text-sm"
            />
            <p className="text-xs text-[#99999e] mt-2">
              A short phrase that describes you. ~20–40 characters is best.
            </p>
          </div>

          {/* Profile Strength */}
          <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold text-[#141416]">
                Profile strength
              </label>
              <span className="text-xs font-semibold text-[#141416]">
                {profileStrength}%
              </span>
            </div>
            <div className="w-full bg-[#e5e5e7] rounded-full h-2">
              <div
                className="bg-[#33CC88] h-2 rounded-full transition-all"
                style={{ width: `${profileStrength}%` }}
              />
            </div>
            <p className="text-xs text-[#72727a] mt-2">
              You're {Math.max(0, 3 - Object.values(profile).filter((v) => v && v.trim()).length)} fields away from complete.
            </p>
          </div>
        </div>
      </Card>

      {/* Section 2: Contact & Links */}
      <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6">
        <h3 className="text-lg font-semibold text-[#141416] mb-4">
          Contact & Links
        </h3>
        <p className="text-sm text-[#72727a] mb-4">
          Where employers reach you and find your work.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#141416] mb-2">
              Email
            </label>
            <Input
              type="email"
              value={profile.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
            />
            <p className="text-xs text-[#99999e] mt-1">
              From your account. Change if you want a different email on your résumé.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#141416] mb-2">
              Phone (optional)
            </label>
            <Input
              type="tel"
              value={profile.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#141416] mb-2">
              LinkedIn (optional)
            </label>
            <Input
              value={profile.linkedin}
              onChange={(e) => handleInputChange("linkedin", e.target.value)}
              placeholder="linkedin.com/in/your-handle"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#141416] mb-2">
              Portfolio or GitHub (optional)
            </label>
            <Input
              value={profile.portfolio}
              onChange={(e) => handleInputChange("portfolio", e.target.value)}
              placeholder="github.com/yourusername"
            />
          </div>
        </div>
      </Card>

      {/* Section 3: What You're Looking For */}
      <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6">
        <h3 className="text-lg font-semibold text-[#141416] mb-4">
          What You're Looking For
        </h3>
        <p className="text-sm text-[#72727a] mb-4">
          Guides tailoring suggestions and (soon) job recommendations.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#141416] mb-2">
              Target roles
            </label>
            <Input
              value={profile.roles}
              onChange={(e) => handleInputChange("roles", e.target.value)}
              placeholder="Backend engineer, Data engineer, SRE"
            />
            <p className="text-xs text-[#99999e] mt-1">
              Comma-separated. E.g., Software Engineer, Product Manager
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#141416] mb-2">
              Preferred locations
            </label>
            <Input
              value={profile.locations}
              onChange={(e) => handleInputChange("locations", e.target.value)}
              placeholder="Remote · San Francisco, CA · New York, NY"
            />
            <p className="text-xs text-[#99999e] mt-1">
              Cities, regions, or "Remote". Separate with · or commas.
            </p>
          </div>
        </div>
      </Card>

      {/* Section 4: Your Background */}
      <Card className="bg-white border border-[#e5e5e7] rounded-lg p-6">
        <h3 className="text-lg font-semibold text-[#141416] mb-4">
          Your Background
        </h3>
        <p className="text-sm text-[#72727a] mb-4">
          Education info. Leave blank if currently in school.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#141416] mb-2">
              School
            </label>
            <Input
              value={profile.school}
              onChange={(e) => handleInputChange("school", e.target.value)}
              placeholder="University of Maryland"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#141416] mb-2">
              Degree (optional)
            </label>
            <Input
              value={profile.degree}
              onChange={(e) => handleInputChange("degree", e.target.value)}
              placeholder="B.S. Computer Science"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#141416] mb-2">
              When are you graduating?
            </label>
            <Input
              value={profile.graduation}
              onChange={(e) => handleInputChange("graduation", e.target.value)}
              placeholder="May 2027"
            />
            <p className="text-xs text-[#99999e] mt-1">
              Graduating May 2027 (in ~1.2 years)
            </p>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-semibold text-[#141416] mb-2">
            GPA (optional)
          </label>
          <Input
            value={profile.gpa}
            onChange={(e) => handleInputChange("gpa", e.target.value)}
            placeholder="3.8"
            maxLength={4}
          />
          <p className="text-xs text-[#99999e] mt-1">
            Only include if 3.5 or higher.
          </p>
        </div>
      </Card>

      {/* Section 5: For Job Applications (Expandable) */}
      <Card className="bg-white border border-[#e5e5e7] rounded-lg">
        <button
          onClick={() => toggleSection("eeo")}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#f9f9fa] transition-colors"
        >
          <div className="text-left">
            <h3 className="text-lg font-semibold text-[#141416]">
              For Job Applications
            </h3>
            <p className="text-sm text-[#72727a]">
              Optional — saves time on job forms
            </p>
          </div>
          <span className="text-xl text-[#72727a]">
            {expandedSections.has("eeo") ? "▼" : "▶"}
          </span>
        </button>

        {expandedSections.has("eeo") && (
          <div className="px-6 pb-6 border-t border-[#e5e5e7] space-y-6 pt-6">
            <p className="text-sm text-[#72727a]">
              Your answers help auto-fill job forms on supported job boards. We never share these with employers or use them for scoring.
            </p>

            {[
              {
                label: "Are you authorized to work in the U.S.?",
                field: "eeoWorkUs",
              },
              {
                label: "Will you need visa sponsorship?",
                field: "eeoSponsor",
              },
            ].map((q) => (
              <div key={q.field}>
                <label className="block text-xs font-semibold text-[#141416] mb-3">
                  {q.label}
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name={q.field} value="yes" />
                    <span className="text-sm text-[#72727a]">Yes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name={q.field} value="no" />
                    <span className="text-sm text-[#72727a]">No</span>
                  </label>
                </div>
              </div>
            ))}

            <p className="text-xs text-[#99999e] border-t border-[#e5e5e7] pt-4">
              Employers use this information for compliance and diversity reporting.
            </p>
          </div>
        )}
      </Card>

      {/* Save Indicator */}
      <div className="sticky bottom-0 bg-white/80 backdrop-blur-sm border-t border-[#e5e5e7] px-8 py-3 flex items-center justify-between">
        <div className="text-xs text-[#72727a] flex items-center gap-2">
          <span className="w-2 h-2 bg-[#33CC88] rounded-full" />
          All changes saved · auto-save on
        </div>
        <Button size="sm" variant="outline">
          Save now
        </Button>
      </div>
    </div>
  );
}
