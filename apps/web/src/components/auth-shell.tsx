"use client";

import Image from "next/image";
import { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  subtitle?: string;
  sideImageSrc?: string;
  sideImageAlt?: string;
  sideTitle?: string;
  sideDescription?: string;
  children: ReactNode;
};

export function AuthShell({
  title,
  subtitle,
  sideImageSrc,
  sideImageAlt,
  sideTitle,
  sideDescription,
  children,
}: AuthShellProps) {
  return (
    <div className="lf-bg-parchment min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <section className="w-full overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-lg shadow-neutral-900/5 lg:grid lg:grid-cols-12">
          <aside className="relative hidden min-h-full border-r border-neutral-200 bg-neutral-950 text-white lg:col-span-5 lg:block">
            {sideImageSrc ? (
              <Image
                src={sideImageSrc}
                alt={sideImageAlt ?? ""}
                fill
                priority
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="object-cover"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-tr from-black/70 via-black/45 to-black/20" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 p-8">
              {sideTitle ? <h2 className="text-2xl font-semibold">{sideTitle}</h2> : null}
              {sideDescription ? <p className="mt-3 text-sm text-neutral-200">{sideDescription}</p> : null}
            </div>
          </aside>

          <div className="lg:col-span-7">
            <div className="mx-auto w-full max-w-md px-6 py-8 sm:px-8 sm:py-10">
              <div className="mb-6 flex items-center justify-center">
                <Image src="/img/logo.svg" alt="Logo Fountain" width={156} height={36} className="h-9 w-auto" priority />
              </div>

              <div>
                <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
                {subtitle ? <p className="mt-2 text-sm text-neutral-600">{subtitle}</p> : null}
                <div className="mt-6">{children}</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
