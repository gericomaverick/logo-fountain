import Link from "next/link";
import type { ReactNode } from "react";
import { MarketingNav } from "@/components/marketing/nav";

type Cta = {
  href: string;
  label: string;
};

function BylineWithAccent({ byline }: { byline: string }) {
  const cleaned = byline.replace(/^[-—]\s*/, "");
  const [name, ...rest] = cleaned.split(",");

  return (
    <p className="mt-4 text-[length:var(--step--1)] font-semibold text-black">
      — <span className="bg-[image:var(--lf-gradient-purple)] bg-clip-text text-transparent">{name.trim()}</span>
      {rest.length ? <span className="text-muted">, {rest.join(",").trim()}</span> : null}
    </p>
  );
}

export function HeroCenter({
  eyebrow,
  title,
  body,
  primary,
  secondary,
  trust,
}: {
  eyebrow: string;
  title: string;
  body: string;
  primary: Cta;
  secondary: Cta;
  trust?: ReactNode;
}) {
  return (
    <section
      className="relative overflow-hidden text-white"
      style={{
        backgroundColor: "#5150f7",
        backgroundImage:
          "radial-gradient(circle at 20% 0%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.0) 55%), radial-gradient(circle at 80% 0%, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.0) 55%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-35" aria-hidden>
        <div className="absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(circle_at_top,_rgba(148,148,247,0.55)_0%,_rgba(81,80,247,0.0)_70%)]" />
      </div>

      <MarketingNav />

      <div className="mx-auto max-w-[1160px] px-6 pb-24 pt-12 md:px-10 md:pb-32 md:pt-16">
        <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-[length:var(--step--2)] font-semibold uppercase tracking-[0.18em] text-white">
          {eyebrow}
        </p>
        <h2 className="mt-5 font-display text-[length:var(--step-4)] font-medium text-white/70">Hello</h2>
        <h1 className="font-display mt-3 max-w-5xl text-[length:var(--step-7)] leading-[1.02] tracking-tight">{title}</h1>
        <p className="mt-6 max-w-2xl text-[length:var(--step-0)] leading-relaxed text-white/80">{body}</p>
        <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Link href={primary.href} className="lf-btn lf-btn--primary">
            {primary.label}
          </Link>
          <Link href={secondary.href} className="lf-btn lf-btn--ghost">
            {secondary.label}
          </Link>
        </div>

        {/* Trust-building slot (HYROS-style). Pass `trust` for custom content. */}
        <div className="mt-10">
          {trust ?? (
            <div className="flex flex-col gap-3 text-white/80 sm:flex-row sm:items-center sm:gap-4">
              <p className="text-[length:var(--step--2)] font-semibold uppercase tracking-[0.16em] text-white/60">Trusted by</p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[length:var(--step--2)] font-semibold">Founders</span>
                <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[length:var(--step--2)] font-semibold">Agencies</span>
                <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[length:var(--step--2)] font-semibold">Growth teams</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function ProofStatsRow({ quote, byline, stats }: { quote: string; byline: string; stats: Array<{ value: string; label: string }> }) {
  return <section className="bg-white"><div className="mx-auto max-w-[1160px] px-6 py-14 md:px-10 md:py-18"><div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]"><article className="rounded-[20px] border border-black bg-[#f6f6f6] p-7 md:p-9"><p className="font-display text-[length:var(--step-3)] leading-tight">“{quote}”</p><p className="mt-5 text-[length:var(--step--1)] font-semibold text-muted">{byline}</p></article><div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">{stats.map((stat) => (<div key={stat.label} className="relative rounded-[20px] border border-black bg-white p-6 before:absolute before:bottom-0 before:left-6 before:h-[3px] before:w-14 before:rounded-full before:bg-[image:var(--lf-gradient-purple)]"><p className="font-display text-[length:var(--step-2)]">{stat.value}</p><p className="mt-2 text-[length:var(--step--1)] text-muted">{stat.label}</p></div>))}</div></div></div></section>;
}

export function LogoWall({ title, logos }: { title: string; logos: string[] }) {
  return <section className="bg-[#f7f7f7]"><div className="mx-auto max-w-[1160px] px-6 py-14 md:px-10 md:py-18"><h2 className="font-display mx-auto max-w-3xl text-center text-[length:var(--step-4)] leading-tight">{title}</h2><div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">{logos.map((logo) => (<div key={logo} className="rounded-[20px] border border-black bg-white p-5 text-center"><p className="font-display text-[length:var(--step-2)]">{logo.slice(0, 1)}</p><p className="mt-2 text-[length:var(--step--2)] font-semibold uppercase tracking-[0.14em] text-muted">{logo}</p></div>))}</div></div></section>;
}

export function SegmentCards({ eyebrow, title, items }: { eyebrow: string; title: string; items: Array<{ title: string; body: string; icon: string }> }) {
  return <section className="bg-white"><div className="mx-auto max-w-[1160px] px-6 py-14 md:px-10 md:py-18"><p className="text-center text-[length:var(--step--2)] font-semibold uppercase tracking-[0.18em] text-muted">{eyebrow}</p><h2 className="font-display mx-auto mt-3 max-w-3xl text-center text-[length:var(--step-4)] leading-tight">{title}</h2><div className="mt-8 grid gap-4 md:grid-cols-3">{items.map((item) => (<article key={item.title} className="rounded-[20px] border border-black bg-white p-6"><span className="text-xl text-[rgb(0,153,255)]">{item.icon}</span><h3 className="mt-3 text-[length:var(--step-1)] font-semibold">{item.title}</h3><p className="mt-2 text-[length:var(--step-0)] leading-relaxed text-muted">{item.body}</p></article>))}</div></div></section>;
}

export function TestimonialCardsRow({ title, items }: { title: string; items: Array<{ quote: string; byline: string }> }) {
  return <section className="bg-white"><div className="mx-auto max-w-[1160px] px-6 py-14 md:px-10 md:py-18"><h2 className="font-display mx-auto max-w-3xl text-center text-[length:var(--step-4)] leading-tight">{title}</h2><div className="mt-8 grid gap-4 md:grid-cols-3">{items.map((item) => (<article key={item.byline} className="rounded-[20px] border border-black bg-[#f9f9f9] p-6"><p className="text-[length:var(--step-3)] leading-relaxed text-muted">“{item.quote}”</p><BylineWithAccent byline={item.byline} /></article>))}</div></div></section>;
}

export function DarkFeatureSection({ eyebrow, title, body, cards, primary, secondary }: { eyebrow: string; title: string; body: string; cards: Array<{ title: string; body: string }>; primary: Cta; secondary: Cta }) {
  return (
    <section className="bg-black text-white">
      <div className="mx-auto max-w-[1160px] px-6 py-16 md:px-10 md:py-22">
        <p className="inline-flex rounded-full border border-white/35 bg-[image:var(--lf-gradient-purple)] px-4 py-1.5 text-[length:var(--step--2)] font-semibold uppercase tracking-[0.18em] text-white">{eyebrow}</p>
        <h2 className="font-display mt-3 max-w-4xl text-[length:var(--step-4)] leading-tight">{title}</h2>
        <p className="mt-4 max-w-2xl text-[length:var(--step-0)] leading-relaxed text-white/80">{body}</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">{cards.map((card) => (<article key={card.title} className="rounded-[20px] border border-white/25 bg-white/5 p-6 backdrop-blur-sm md:sticky md:top-8"><h3 className="text-[length:var(--step-1)] font-semibold">{card.title}</h3><p className="mt-2 text-[length:var(--step-0)] leading-relaxed text-white/75">{card.body}</p></article>))}</div>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href={primary.href} className="lf-btn lf-btn--primary">{primary.label}</Link>
          <Link href={secondary.href} className="lf-btn lf-btn--ghost">{secondary.label}</Link>
        </div>
      </div>
    </section>
  );
}

export function FAQ({ title, items }: { title: string; items: Array<{ q: string; a: string }> }) {
  return <section className="bg-white"><div className="mx-auto max-w-[1160px] px-6 py-14 md:px-10 md:py-18"><h2 className="font-display mx-auto max-w-3xl text-center text-[length:var(--step-4)] leading-tight">{title}</h2><div className="mx-auto mt-7 max-w-4xl space-y-3">{items.map((item) => (<details key={item.q} className="rounded-[20px] border border-black bg-white p-5"><summary className="cursor-pointer text-[length:var(--step-1)] font-semibold">{item.q}</summary><p className="mt-3 text-[length:var(--step-0)] leading-relaxed text-muted">{item.a}</p></details>))}</div></div></section>;
}

export function FinalCTA({ title, body, primary, secondary }: { title: string; body: string; primary: Cta; secondary: Cta }) {
  return <section className="bg-[image:linear-gradient(140deg,rgba(81,80,247,0.14)_0%,rgba(148,148,247,0.08)_38%,rgba(0,153,255,0.1)_100%)]"><div className="mx-auto max-w-[1160px] px-6 py-16 text-center md:px-10 md:py-22"><h2 className="font-display mx-auto max-w-4xl text-[length:var(--step-4)] leading-tight">{title}</h2><p className="mx-auto mt-4 max-w-2xl text-[length:var(--step-0)] leading-relaxed text-muted">{body}</p><div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"><Link href={primary.href} className="lf-btn bg-[image:var(--lf-gradient-purple)] text-white">{primary.label}</Link><Link href={secondary.href} className="lf-btn border border-black bg-white text-black">{secondary.label}</Link></div></div></section>;
}
