import { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#faf9f5]">{children}</div>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm ${className}`}>{children}</section>;
}

export function SubCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-neutral-200 bg-neutral-50 p-4 ${className}`}>{children}</section>;
}
