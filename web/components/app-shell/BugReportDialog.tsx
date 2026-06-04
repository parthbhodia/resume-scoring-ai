"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSupabaseClient } from "@/lib/supabase";
import { apiUrl } from "@/lib/utils";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "analyze", label: "Analyze / scoring" },
  { value: "tailor", label: "Tailor / builder" },
  { value: "export", label: "PDF export" },
  { value: "auth", label: "Login / account" },
  { value: "performance", label: "Slow / crash" },
  { value: "other", label: "Other" },
];

type Status = "idle" | "submitting" | "success" | "error";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BugReportDialog({ open, onOpenChange }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setTitle("");
      setDescription("");
      setCategory("general");
      setStatus("idle");
      setErrorMsg("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setStatus("submitting");
    setErrorMsg("");

    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(apiUrl("/api/bug-report"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          page_url: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }

      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Report a bug</DialogTitle>
          <DialogDescription>
            Spotted something broken? Tell us what happened and we'll look into it.
          </DialogDescription>
        </DialogHeader>

        {status === "success" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="text-2xl">✓</span>
            <p className="font-medium">Thanks — report received!</p>
            <p className="text-sm text-muted-foreground">We'll look into it.</p>
            <DialogClose render={<Button variant="outline" size="sm" className="mt-2" />}>
              Close
            </DialogClose>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="br-category" className="text-sm font-medium">
                Category
              </label>
              <select
                id="br-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="br-title" className="text-sm font-medium">
                Short title <span className="text-destructive">*</span>
              </label>
              <input
                id="br-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Score panel doesn't load"
                maxLength={200}
                required
                className="rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="br-description" className="text-sm font-medium">
                What happened? <span className="text-destructive">*</span>
              </label>
              <textarea
                id="br-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Steps to reproduce, what you expected, what you saw…"
                rows={5}
                maxLength={3000}
                required
                className="resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {status === "error" && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMsg}
              </p>
            )}

            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" size="sm" />}>
                Cancel
              </DialogClose>
              <Button
                type="submit"
                size="sm"
                disabled={status === "submitting" || !title.trim() || !description.trim()}
              >
                {status === "submitting" ? "Sending…" : "Send report"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
