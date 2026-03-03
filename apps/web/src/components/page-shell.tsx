import { ComponentPropsWithoutRef, ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#faf9f5]">{children}</div>;
}

export function Card({ children, className = "", ...props }: { children: ReactNode; className?: string } & ComponentPropsWithoutRef<"section">) {
  return <section className={`mt-3 rounded-2xl border border-neutral-200 bg-white p-6  ${className}`} {...props}>{children}</section>;
}

export function SubCard({ children, className = "", ...props }: { children: ReactNode; className?: string } & ComponentPropsWithoutRef<"section">) {
  return <section className={`rounded-xl border border-neutral-200 bg-neutral-50 p-4 ${className}`} {...props}>{children}</section>;
}
