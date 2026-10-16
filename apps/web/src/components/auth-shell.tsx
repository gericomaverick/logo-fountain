"use client";

import Image, { StaticImageData } from "next/image";
import { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  subtitle?: string;
  sideImageSrc?: string | StaticImageData;
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
    <div className="min-h-screen bg-app px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center justify-center sm:min-h-[calc(100vh-4rem)]">
        <section className="w-full overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_12px_40px_-12px_rgba(33,33,31,0.18)] lg:grid lg:grid-cols-12">
          <aside className="relative hidden min-h-full border-r border-line bg-[#1c1b19] text-white lg:col-span-6 lg:block">
            {/* Half of the 1152px shell, with 24px outer gutters; hidden below lg.
                Keep default lazy loading instead of preloading artwork hidden on mobile. */}
            {sideImageSrc ? (
              <Image
                src={sideImageSrc}
                alt={sideImageAlt ?? ""}
                fill
                sizes="(min-width: 1200px) 576px, (min-width: 1024px) calc(50vw - 24px), 0px"
                className="object-cover"
              />
            ) : null}
            <div className="absolute inset-x-0 bottom-0 p-7 lg:p-8">
              {sideTitle ? <h2 className="text-3xl font-semibold tracking-tight text-white drop-shadow-sm">{sideTitle}</h2> : null}
              {sideDescription ? <p className="mt-3 text-base text-white/90 drop-shadow-sm">{sideDescription}</p> : null}
            </div>
          </aside>

          <div className="lg:col-span-6">
            <div className="mx-auto w-full max-w-lg px-6 py-7 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
              <div className="mb-5 flex items-center justify-center sm:mb-6">
                <span className="flex dark:invert">
                  <Image src="/img/logo.svg" alt="Logo Fountain" width={410} height={386} unoptimized className="h-9 w-auto" />
                </span>
              </div>

              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-fg">{title}</h1>
                {subtitle ? <p className="mt-2 text-base text-fg-2">{subtitle}</p> : null}
                <div className="mt-5 sm:mt-6">{children}</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
