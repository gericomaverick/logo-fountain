import { ComponentPropsWithoutRef, ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#faf9f5]">{children}</div>;
}

export function Card({ children, className = "", ...props }: { children: ReactNode; className?: string } & ComponentPropsWithoutRef<"section">) {
  return <section className={`portal-card mt-3 ${className}`} {...props}>{children}</section>;
}

export function SubCard({ children, className = "", ...props }: { children: ReactNode; className?: string } & ComponentPropsWithoutRef<"section">) {
  return <section className={`portal-subcard ${className}`} {...props}>{children}</section>;
}
