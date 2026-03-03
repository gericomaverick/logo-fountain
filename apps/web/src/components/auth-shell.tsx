"use client";

import { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#faf9f5] px-6 py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/logo.svg" alt="Logo Fountain" className="h-9 w-auto" />
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-neutral-600">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
