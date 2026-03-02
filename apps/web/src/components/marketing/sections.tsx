import Link from "next/link";

type Cta = {
  href: string;
  label: string;
};

export function HeroCenter({
  eyebrow,
  title,
  body,
  primary,
  secondary,
}: {
  eyebrow: string;
  title: string;
  body: string;
  primary: Cta;
  secondary: Cta;
}) {
  return (
    <section className="mx-auto max-w-[1160px] px-6 py-18 text-center md:px-10 md:py-24">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
      <h1 className="font-display mx-auto mt-5 max-w-5xl text-[48px] leading-[1.06] tracking-tight md:text-[76px]">{title}</h1>
      <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted md:text-lg">{body}</p>
      <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href={primary.href} className="rounded-[20px] border border-black bg-black px-7 py-3 text-sm font-semibold text-white">
          {primary.label}
        </Link>
        <Link href={secondary.href} className="rounded-[20px] border border-black bg-white px-7 py-3 text-sm font-semibold text-black">
          {secondary.label}
        </Link>
      </div>
    </section>
  );
}

export function ProofStatsRow({
  quote,
  byline,
  stats,
}: {
  quote: string;
  byline: string;
  stats: Array<{ value: string; label: string }>;
}) {
  return (
    <section className="mx-auto max-w-[1160px] px-6 py-14 md:px-10 md:py-18">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <article className="rounded-[20px] border border-black bg-[#f6f6f6] p-7 md:p-9">
          <p className="font-display text-[30px] leading-tight md:text-[38px]">“{quote}”</p>
          <p className="mt-5 text-sm font-semibold text-muted">{byline}</p>
        </article>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-[20px] border border-black bg-white p-6">
              <p className="font-display text-4xl md:text-5xl">{stat.value}</p>
              <p className="mt-2 text-sm text-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LogoWall({ title, logos }: { title: string; logos: string[] }) {
  return (
    <section className="mx-auto max-w-[1160px] px-6 py-14 md:px-10 md:py-18">
      <h2 className="font-display mx-auto max-w-3xl text-center text-[36px] leading-tight md:text-[52px]">{title}</h2>
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {logos.map((logo) => (
          <div key={logo} className="rounded-[20px] border border-black bg-white p-5 text-center">
            <p className="font-display text-3xl">{logo.slice(0, 1)}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{logo}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SegmentCards({
  eyebrow,
  title,
  items,
}: {
  eyebrow: string;
  title: string;
  items: Array<{ title: string; body: string; icon: string }>;
}) {
  return (
    <section className="mx-auto max-w-[1160px] px-6 py-14 md:px-10 md:py-18">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
      <h2 className="font-display mx-auto mt-3 max-w-3xl text-center text-[36px] leading-tight md:text-[52px]">{title}</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {items.map((item) => (
          <article key={item.title} className="rounded-[20px] border border-black bg-white p-6">
            <span className="text-xl">{item.icon}</span>
            <h3 className="mt-3 text-lg font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function TestimonialCardsRow({
  title,
  items,
}: {
  title: string;
  items: Array<{ quote: string; byline: string }>;
}) {
  return (
    <section className="mx-auto max-w-[1160px] px-6 py-14 md:px-10 md:py-18">
      <h2 className="font-display mx-auto max-w-3xl text-center text-[36px] leading-tight md:text-[52px]">{title}</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {items.map((item) => (
          <article key={item.byline} className="rounded-[20px] border border-black bg-[#f9f9f9] p-6">
            <p className="text-sm leading-relaxed text-muted">“{item.quote}”</p>
            <p className="mt-4 text-sm font-semibold">{item.byline}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DarkFeatureSection({
  eyebrow,
  title,
  body,
  cards,
  primary,
  secondary,
}: {
  eyebrow: string;
  title: string;
  body: string;
  cards: Array<{ title: string; body: string }>;
  primary: Cta;
  secondary: Cta;
}) {
  return (
    <section className="bg-black text-white">
      <div className="mx-auto max-w-[1160px] px-6 py-16 md:px-10 md:py-22">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">{eyebrow}</p>
        <h2 className="font-display mt-3 max-w-4xl text-[38px] leading-tight md:text-[56px]">{title}</h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/80 md:text-base">{body}</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {cards.map((card) => (
            <article key={card.title} className="rounded-[20px] border border-white/25 bg-white/5 p-6 backdrop-blur-sm md:sticky md:top-8">
              <h3 className="text-lg font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{card.body}</p>
            </article>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href={primary.href} className="rounded-[20px] border border-white bg-white px-7 py-3 text-sm font-semibold text-black">
            {primary.label}
          </Link>
          <Link href={secondary.href} className="rounded-[20px] border border-white/70 bg-white/10 px-7 py-3 text-sm font-semibold text-white">
            {secondary.label}
          </Link>
        </div>
      </div>
    </section>
  );
}

export function FAQ({
  title,
  items,
}: {
  title: string;
  items: Array<{ q: string; a: string }>;
}) {
  return (
    <section className="mx-auto max-w-[1160px] px-6 py-14 md:px-10 md:py-18">
      <h2 className="font-display mx-auto max-w-3xl text-center text-[36px] leading-tight md:text-[52px]">{title}</h2>
      <div className="mx-auto mt-7 max-w-4xl space-y-3">
        {items.map((item) => (
          <details key={item.q} className="rounded-[20px] border border-black bg-white p-5">
            <summary className="cursor-pointer text-sm font-semibold md:text-base">{item.q}</summary>
            <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function FinalCTA({ title, body, primary, secondary }: { title: string; body: string; primary: Cta; secondary: Cta }) {
  return (
    <section className="bg-[#f3f3f3]">
      <div className="mx-auto max-w-[1160px] px-6 py-16 text-center md:px-10 md:py-22">
        <h2 className="font-display mx-auto max-w-4xl text-[40px] leading-tight md:text-[62px]">{title}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted">{body}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href={primary.href} className="rounded-[20px] border border-black bg-black px-8 py-3 text-sm font-semibold text-white">
            {primary.label}
          </Link>
          <Link href={secondary.href} className="rounded-[20px] border border-black bg-white px-8 py-3 text-sm font-semibold text-black">
            {secondary.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
