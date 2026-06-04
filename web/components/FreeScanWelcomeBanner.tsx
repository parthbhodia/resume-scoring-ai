"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const FREE_SCAN_BANNER_KEY_PREFIX = "rn-free-scan-banner-dismissed";

type FreeScanWelcomeBannerProps = {
  userId?: string | null;
  isUmbc: boolean;
};

export function FreeScanWelcomeBanner({ userId, isUmbc }: FreeScanWelcomeBannerProps) {
  const [dismissed, setDismissed] = useState(true);
  const storageKey = useMemo(() => {
    if (!userId) return null;
    return `${FREE_SCAN_BANNER_KEY_PREFIX}:${userId}`;
  }, [userId]);

  useEffect(() => {
    if (!storageKey || isUmbc) {
      setDismissed(true);
      return;
    }
    try {
      setDismissed(localStorage.getItem(storageKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [isUmbc, storageKey]);

  if (!userId || isUmbc || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-blue-200/60 bg-blue-50 px-4 py-3 text-[13px] text-blue-900 dark:border-blue-800/70 dark:bg-blue-950/40 dark:text-blue-100">
      <p className="flex-1">
        <span className="mr-1.5">🎉</span>
        <strong>New here?</strong> You can scan your resume up to <strong>5 times per day for free</strong>.
      </p>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Dismiss free scan message"
        className="h-6 w-6 shrink-0 text-blue-900 hover:bg-blue-100 hover:text-blue-900 dark:text-blue-100 dark:hover:bg-blue-900/40 dark:hover:text-blue-100"
        onClick={() => {
          if (storageKey) {
            try {
              localStorage.setItem(storageKey, "1");
            } catch {
              // Best effort persistence only.
            }
          }
          setDismissed(true);
        }}
      >
        <X size={14} />
      </Button>
    </div>
  );
}
