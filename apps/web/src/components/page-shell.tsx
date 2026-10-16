import { ComponentPropsWithoutRef, ReactNode } from "react";

import { AppFrame } from "@/components/app-frame";

export function PageShell({ children }: { children: ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}

export function Card({ children, className = "", ...props }: { children: ReactNode; className?: string } & ComponentPropsWithoutRef<"section">) {
  return <section className={`portal-card mt-3 ${className}`} {...props}>{children}</section>;
}

export function SubCard({ children, className = "", ...props }: { children: ReactNode; className?: string } & ComponentPropsWithoutRef<"section">) {
  return <section className={`portal-subcard ${className}`} {...props}>{children}</section>;
}
