"use client";

import { useEffect, useState } from "react";

/** Tablet: icon-compact sidebar per design (768–1023px). Mobile uses CSS-only bottom nav. */
export function useAppBreakpoints() {
  const [tablet, setTablet] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");
    const sync = () => setTablet(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return { isTablet: tablet };
}
