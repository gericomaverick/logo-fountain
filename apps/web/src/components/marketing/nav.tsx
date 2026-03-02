import Image from "next/image";
import Link from "next/link";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/work", label: "Work" },
  { href: "/pricing", label: "Pricing" },
];

export function MarketingNav() {
  return (
    <header className="relative z-20 h-20 text-white">
      <nav className="mx-auto flex h-full w-full max-w-[1160px] items-center justify-between px-6">
        <Link href="/" className="inline-flex items-center">
          <Image src="/img/logo.svg" alt="Logo Fountain" width={156} height={36} className="h-9 w-auto invert" priority />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <Link href="/pricing" className="lf-btn lf-btn--primary ml-1">
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}
