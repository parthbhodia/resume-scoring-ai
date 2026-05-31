"use client";
import { useUmbcVariant } from "@/contexts/UmbcContext";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export function UmbcWelcomeBanner() {
  const { isUmbc } = useUmbcVariant();
  const [dismissed, setDismissed] = useState(false);

  if (!isUmbc || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-[13px] text-white border-b border-black/10"
      style={{ background: "linear-gradient(135deg, #b8860b 0%, #daa520 100%)" }}
    >
      <p className="flex-1">
        <span className="mr-1.5">⚡</span>
        <strong>Tailored for UMBC students</strong> — Our analysis follows UMBC Career Center resume guidelines.
        <a href="https://careers.umbc.edu/" target="_blank" rel="noopener noreferrer"
          className="underline ml-2 opacity-90 hover:opacity-100"
        >Learn more</a>
      </p>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss banner"
        className="shrink-0 h-6 w-6 text-white hover:bg-white/20 hover:text-white"
      >
        <X size={14} />
      </Button>
    </div>
  );
}
