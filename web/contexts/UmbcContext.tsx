"use client";
import { createContext, useContext, ReactNode } from "react";

interface UmbcContextType {
  isUmbc: boolean;
}

const UmbcContext = createContext<UmbcContextType | null>(null);

export function UmbcProvider({ isUmbc, children }: { isUmbc: boolean; children: ReactNode }) {
  return <UmbcContext.Provider value={{ isUmbc }}>{children}</UmbcContext.Provider>;
}

export function useUmbcVariant() {
  const ctx = useContext(UmbcContext);
  if (!ctx) return { isUmbc: false };
  return ctx;
}
