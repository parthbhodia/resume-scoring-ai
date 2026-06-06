"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useInterviewPrepStore } from "@/store/interviewPrepStore";
import { SUGGESTED_COMPANIES } from "./constants";

/**
 * Target Role — company + role inputs and selectable suggested-company chips,
 * bound to the Interview Prep store for use by later steps.
 */
export default function TargetRoleCard() {
  const company = useInterviewPrepStore((s) => s.company);
  const role = useInterviewPrepStore((s) => s.role);
  const setCompany = useInterviewPrepStore((s) => s.setCompany);
  const setRole = useInterviewPrepStore((s) => s.setRole);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Target Role</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Company Name</span>
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Stripe"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Role</span>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Senior Software Engineer"
            />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">
            Suggested Companies
          </span>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_COMPANIES.map((name) => {
              const selected = company === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setCompany(selected ? "" : name)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-transparent text-foreground hover:bg-muted",
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
