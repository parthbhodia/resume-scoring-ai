"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useUmbcVariant } from "@/contexts/UmbcContext";
import { UMBC_BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";

const UMBC_BANNER_KEY_PREFIX = "rn-umbc-banner-dismissed";

type UmbcWelcomeBannerProps = {
  userId?: string | null;
};

export function UmbcWelcomeBanner({ userId }: UmbcWelcomeBannerProps) {
  const { isUmbc } = useUmbcVariant();
  const [dismissed, setDismissed] = useState(true);

  const storageKey = useMemo(() => {
    if (!userId) return null;
    return `${UMBC_BANNER_KEY_PREFIX}:${userId}`;
  }, [userId]);

  useEffect(() => {
    if (!isUmbc) {
      setDismissed(true);
      return;
    }
    if (!storageKey) {
      setDismissed(false);
      return;
    }
    try {
      setDismissed(localStorage.getItem(storageKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [isUmbc, storageKey]);

  if (!isUmbc || dismissed) return null;

  return (
    <div
      className="relative flex items-center justify-between gap-4 border-b px-4 py-3 text-[13px] leading-snug"
      style={{
        background: `linear-gradient(90deg, ${UMBC_BRAND.gold} 0%, ${UMBC_BRAND.goldDeep} 100%)`,
        color: UMBC_BRAND.black,
        borderBottomColor: UMBC_BRAND.black,
        borderBottomWidth: 3,
      }}
      role="region"
      aria-label="UMBC student welcome"
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ background: UMBC_BRAND.black }}
        aria-hidden
      />

      <div className="flex min-w-0 flex-1 items-center gap-3 pl-2">
        <span
          className="shrink-0 rounded px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.14em]"
          style={{
            background: UMBC_BRAND.black,
            color: UMBC_BRAND.gold,
          }}
        >
          UMBC
        </span>
        <p className="m-0 min-w-0 text-[13px]" style={{ color: UMBC_BRAND.black }}>
          <strong className="font-semibold">Retriever resume insights</strong>
          {" — "}
          Analysis follows UMBC Career Center guidelines. Unlimited scans for{" "}
          <span className="font-medium">@umbc.edu</span> accounts.
          <a
            href="https://careers.umbc.edu/students/resumes/"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 font-medium underline underline-offset-2 hover:opacity-80"
            style={{ color: UMBC_BRAND.black }}
          >
            Career Center resources
          </a>
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          if (storageKey) {
            try {
              localStorage.setItem(storageKey, "1");
            } catch {
              /* best effort */
            }
          }
          setDismissed(true);
        }}
        aria-label="Dismiss UMBC banner"
        className="h-7 w-7 shrink-0 hover:opacity-90"
        style={{
          color: UMBC_BRAND.black,
        }}
      >
        <X size={15} strokeWidth={2.25} />
      </Button>
    </div>
  );
}
