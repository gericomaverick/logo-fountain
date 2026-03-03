import Link from "next/link";
import type { ReactNode } from "react";
import { MarketingNav } from "@/components/marketing/nav";

type Cta = {
  href: string;
  label: string;
};

type StatItem = { value: string; label: string };

type TrustItem = {
  label: string;
  icon?: ReactNode;
};

const sectionTokens = {
  shell: "mx-auto max-w-[1160px] px-6 md:px-10",
  sectionY: "py-14 md:py-18",
  radius: "rounded-[20px]",
  border: "border border-black",
  subtleBorder: "border border-[#e8e8e8]",
  mutedCard: "bg-[#f9f9f9]",
};

const defaultHeroTrustItems: TrustItem[] = [
  { label: "Trusted by 120+ founders" },
  { label: "4.9/5 average rating" },
  { label: "Delivered in 48 hours" },
  { label: "500+ concepts shipped" },
];

function SectionContainer({ children, className = "", yClass = sectionTokens.sectionY }: { children: ReactNode; className?: string; yClass?: string }) {
  return <div className={`${sectionTokens.shell} ${yClass} ${className}`.trim()}>{children}</div>;
}

function PretitlePill({
  children,
  variant = "dark",
}: {
  children: ReactNode;
  variant?: "dark" | "light";
}) {
  const shell =
    variant === "dark"
      ? "inline-flex rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-[length:var(--step--2)] font-semibold uppercase tracking-[0.18em]"
      : "inline-flex rounded-full border border-black/10 bg-black/[0.03] px-4 py-1.5 text-[length:var(--step--2)] font-semibold uppercase tracking-[0.18em]";

  return (
    <p className={shell}>
      <span className="bg-[image:var(--lf-gradient-rainbow)] bg-clip-text text-transparent">{children}</span>
    </p>
  );
}

function HeroEyebrowPill({ children }: { children: ReactNode }) {
  return <PretitlePill variant="dark">{children}</PretitlePill>;
}

function HeroHello({ children = "Hello" }: { children?: ReactNode }) {
  return <h2 className="mt-5 font-display text-[length:var(--step-4)] font-medium text-white/70">{children}</h2>;
}

function HeroTrustRow({
  items = defaultHeroTrustItems,
  lead = "Results teams see",
}: {
  items?: TrustItem[];
  lead?: ReactNode;
}) {
  return (
    <div className="grid gap-4 rounded-[20px] bg-white p-5 text-black shadow-[0_18px_55px_rgba(0,0,0,0.22)] md:grid-cols-[1fr_1.2fr] md:items-center md:gap-6 md:p-6">
      <div>
        <p className="text-[length:var(--step--2)] font-semibold uppercase tracking-[0.16em] text-black/60">{lead}</p>
        <p className="mt-2 font-display text-[length:var(--step-1)] leading-tight">&ldquo;We finally look like the category leader.&rdquo;</p>
        <div className="mt-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[#f2f2f2] text-sm font-semibold">AC</div>
          <div>
            <p className="text-[length:var(--step--1)] font-semibold leading-none">Alex C.</p>
            <p className="mt-1 text-[length:var(--step--2)] text-black/60">B2B SaaS founder</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[length:var(--step--2)] font-semibold uppercase tracking-[0.16em] text-black/60">Proof points</p>
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-[#f8f8f8] px-3 py-1 text-[length:var(--step--2)] font-semibold text-black/80"
            >
              {item.icon}
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

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

function StatCard({ item }: { item: StatItem }) {
  return (
    <article className={`${sectionTokens.radius} ${sectionTokens.subtleBorder} ${sectionTokens.mutedCard} px-8 pb-8 pt-4`}>
      <p className="font-display text-[length:var(--step-3)] leading-none tracking-tight text-black">{item.value}</p>
      <div className="mt-4 h-px w-full bg-black/10" aria-hidden />
      <p className="mt-3 text-[length:var(--step--1)] font-medium text-muted">{item.label}</p>
    </article>
  );
}

export function HeroCenter({
  eyebrow = "",
  hello,
  title,
  body,
  primary,
  secondary,
  trust,
}: {
  eyebrow?: string;
  hello?: ReactNode;
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

      <SectionContainer yClass="pb-24 pt-12 md:pb-32 md:pt-16">
        {eyebrow?.trim() ? <HeroEyebrowPill>{eyebrow}</HeroEyebrowPill> : null}
        <HeroHello>{hello}</HeroHello>
        <h1 className="font-display mt-3 max-w-5xl text-[length:var(--step-8)] leading-[1.02] tracking-tight">{title}</h1>
        <p className="mt-6 max-w-2xl text-[length:var(--step-0)] leading-relaxed text-white/80">{body}</p>
        <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Link href={primary.href} className="lf-btn lf-btn--primary">
            {primary.label}
          </Link>
          <Link href={secondary.href} className="lf-btn lf-btn--ghost">
            {secondary.label}
          </Link>
        </div>

        <div className="mt-8">{trust ?? <HeroTrustRow />}</div>
      </SectionContainer>
    </section>
  );
}

export function ProofStatsRow({ quote, byline, stats }: { quote: string; byline: string; stats: StatItem[] }) {
  return (
    <section className="bg-white">
      <SectionContainer>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <article className={`${sectionTokens.radius} ${sectionTokens.subtleBorder} ${sectionTokens.mutedCard} px-8 pb-10 pt-4`}>
            <div className="mb-6">
              <div className="aspect-[16/9] w-full rounded-[16px] border border-black/10 bg-white/60" aria-hidden />
              <p className="mt-2 text-[length:var(--step--2)] font-semibold uppercase tracking-[0.16em] text-black/50">Drop in a graphic/logo</p>
            </div>
            <p className="font-display text-[length:var(--step-3)] leading-[1.2] text-black">“{quote}”</p>
            <p className="mt-5 text-[length:var(--step--1)] font-semibold text-muted">{byline}</p>
          </article>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {stats.map((stat) => (
              <StatCard key={stat.label} item={stat} />
            ))}
          </div>
        </div>
      </SectionContainer>
    </section>
  );
}

export function LogoWall({ title, logos }: { title: string; logos: string[] }) {
  return <section className="bg-[#f7f7f7]"><SectionContainer><h2 className="font-display mx-auto max-w-3xl text-center text-[length:var(--step-4)] leading-tight">{title}</h2><div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">{logos.map((logo) => (<div key={logo} className="rounded-[20px] border border-black bg-white p-5 text-center"><p className="font-display text-[length:var(--step-2)]">{logo.slice(0, 1)}</p><p className="mt-2 text-[length:var(--step--2)] font-semibold uppercase tracking-[0.14em] text-muted">{logo}</p></div>))}</div></SectionContainer></section>;
}

export function SegmentCards({ eyebrow, title, items }: { eyebrow: string; title: string; items: Array<{ title: string; body: string; icon: string }> }) {
  return (
    <section className="bg-white">
      <SectionContainer>
        <div className="flex justify-center">{eyebrow?.trim() ? <PretitlePill variant="light">{eyebrow}</PretitlePill> : null}</div>
        <h2 className="font-display mx-auto mt-3 max-w-3xl text-center text-[length:var(--step-4)] leading-tight">{title}</h2>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {items.map((item) => (
            <article key={item.title} className={`${sectionTokens.radius} ${sectionTokens.subtleBorder} ${sectionTokens.mutedCard} p-7`}>
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white/70 text-[rgb(0,153,255)]">
                <span className="text-lg">{item.icon}</span>
              </div>
              <h3 className="font-display mt-4 text-[length:var(--step-1)] leading-tight text-black">{item.title}</h3>
              <p className="mt-2 text-[length:var(--step-0)] leading-relaxed text-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </SectionContainer>
    </section>
  );
}

export function TestimonialCardsRow({ title, items }: { title: string; items: Array<{ quote: string; byline: string }> }) {
  return <section className="bg-white"><SectionContainer><h2 className="font-display mx-auto max-w-3xl text-center text-[length:var(--step-4)] leading-tight">{title}</h2><div className="mt-8 grid gap-4 md:grid-cols-3">{items.map((item) => (<article key={item.byline} className="rounded-[20px] border border-black bg-[#f9f9f9] p-6"><p className="text-[length:var(--step-3)] leading-relaxed text-muted">“{item.quote}”</p><BylineWithAccent byline={item.byline} /></article>))}</div></SectionContainer></section>;
}

export function DarkFeatureSection({ eyebrow, title, body, cards, primary, secondary }: { eyebrow: string; title: string; body: string; cards: Array<{ title: string; body: string }>; primary: Cta; secondary: Cta }) {
  return (
    <section className="bg-black text-white">
      <SectionContainer yClass="py-16 md:py-22">
        {eyebrow?.trim() ? <PretitlePill variant="dark">{eyebrow}</PretitlePill> : null}
        <h2 className="font-display mt-3 max-w-4xl text-[length:var(--step-4)] leading-tight">{title}</h2>
        <p className="mt-4 max-w-2xl text-[length:var(--step-0)] leading-relaxed text-white/80">{body}</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">{cards.map((card) => (<article key={card.title} className="rounded-[20px] border border-white/25 bg-white/5 p-6 backdrop-blur-sm md:sticky md:top-8"><h3 className="text-[length:var(--step-1)] font-semibold">{card.title}</h3><p className="mt-2 text-[length:var(--step-0)] leading-relaxed text-white/75">{card.body}</p></article>))}</div>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href={primary.href} className="lf-btn lf-btn--primary">{primary.label}</Link>
          <Link href={secondary.href} className="lf-btn lf-btn--ghost">{secondary.label}</Link>
        </div>
      </SectionContainer>
    </section>
  );
}

export function FAQ({ title, items }: { title: string; items: Array<{ q: string; a: string }> }) {
  return <section className="bg-white"><SectionContainer><h2 className="font-display mx-auto max-w-3xl text-center text-[length:var(--step-4)] leading-tight">{title}</h2><div className="mx-auto mt-7 max-w-4xl space-y-3">{items.map((item) => (<details key={item.q} className="rounded-[20px] border border-black bg-white p-5"><summary className="cursor-pointer text-[length:var(--step-1)] font-semibold">{item.q}</summary><p className="mt-3 text-[length:var(--step-0)] leading-relaxed text-muted">{item.a}</p></details>))}</div></SectionContainer></section>;
}

export function FinalCTA({ title, body, primary, secondary }: { title: string; body: string; primary: Cta; secondary: Cta }) {
  return <section className="bg-[image:linear-gradient(140deg,rgba(81,80,247,0.14)_0%,rgba(148,148,247,0.08)_38%,rgba(0,153,255,0.1)_100%)]"><SectionContainer yClass="py-16 text-center md:py-22"><h2 className="font-display mx-auto max-w-4xl text-[length:var(--step-4)] leading-tight">{title}</h2><p className="mx-auto mt-4 max-w-2xl text-[length:var(--step-0)] leading-relaxed text-muted">{body}</p><div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"><Link href={primary.href} className="lf-btn bg-[image:var(--lf-gradient-purple)] text-white">{primary.label}</Link><Link href={secondary.href} className="lf-btn border border-black bg-white text-black">{secondary.label}</Link></div></SectionContainer></section>;
}
