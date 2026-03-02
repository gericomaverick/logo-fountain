import Link from "next/link";

const logoMarks = [
  "ATLAS",
  "NOVA",
  "APEX",
  "LUMEN",
  "KYTE",
  "MOTION",
  "SABLE",
  "AURIC",
  "FLINT",
  "OSLO",
  "BOLT",
  "VERVE",
];

const segments = [
  {
    icon: "◉",
    title: "Founders launching fast",
    body: "Need a premium logo now so your product can ship with authority, not placeholders.",
  },
  {
    icon: "◆",
    title: "Agencies scaling output",
    body: "White-label logo production without hiring another full-time designer.",
  },
  {
    icon: "◌",
    title: "Teams rebranding",
    body: "New positioning, new visual system, and a logo that actually signals the move.",
  },
];

const faqs = [
  {
    q: "How fast can we start?",
    a: "Immediately after checkout. You submit the brief and we begin concept work right away.",
  },
  {
    q: "How many revisions do we get?",
    a: "Enough to land on the right direction. Revision rounds are scoped per package.",
  },
  {
    q: "Do we get source files?",
    a: "Yes — final delivery includes production-ready exports and editable source files.",
  },
  {
    q: "Can you match an existing brand system?",
    a: "Yes. Share brand guidelines, references, and target audience notes in your brief.",
  },
];

const stats = [
  ["48h", "First concept delivery"],
  ["500+", "Logo directions shipped"],
  ["4.9/5", "Client satisfaction (placeholder)"],
];

const learnMoreClass = "inline-flex items-center gap-2 text-sm font-semibold text-black underline underline-offset-4";

export default function Home() {
  return (
    <main className="bg-white text-black">
      <div className="mx-auto w-full max-w-[1160px] px-8 py-14 md:px-12 md:py-20">
        <section className="rounded-[20px] border border-black bg-white px-6 py-12 md:px-12 md:py-16">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Built for brands that refuse to look average
          </p>
          <h1 className="font-display mx-auto mt-4 max-w-4xl text-center text-5xl tracking-tight md:text-7xl">
            Logo Fountain
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-center text-base text-muted md:text-lg">
            Direct-response logo design that turns &ldquo;we should fix our brand&rdquo; into &ldquo;we&apos;re live and
            winning.&rdquo; Fast turnaround. Sharp concepts. Zero fluff.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/pricing" className="rounded-full border border-black bg-black px-7 py-3 text-sm font-semibold text-white">
              Get started
            </Link>
            <Link href="/work" className="rounded-full border border-black bg-white px-7 py-3 text-sm font-semibold text-black">
              Our work
            </Link>
          </div>

          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {stats.map(([stat, label]) => (
              <div key={label} className="rounded-[20px] border border-black p-5">
                <p className="font-display text-4xl">{stat}</p>
                <p className="mt-2 text-sm text-muted">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Logo examples</p>
            <h2 className="font-display mx-auto mt-3 max-w-3xl text-4xl md:text-5xl">Recent marks we&apos;ve crafted</h2>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {logoMarks.map((mark) => (
              <div key={mark} className="rounded-[20px] border border-black p-5 text-center">
                <div className="font-display text-3xl">{mark.slice(0, 1)}</div>
                <div className="mt-2 text-xs font-semibold tracking-[0.16em] text-muted">{mark}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <div className="rounded-[20px] border border-black p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Who this is for</p>
            <h2 className="font-display mt-3 text-4xl md:text-5xl">Built for teams that ship fast</h2>
            <div className="mt-7 grid gap-3">
              {segments.map((segment) => (
                <article key={segment.title} className="rounded-[20px] border border-black p-5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-xl">{segment.icon}</span>
                    <div>
                      <h3 className="text-lg font-semibold">{segment.title}</h3>
                      <p className="mt-2 text-sm text-muted">{segment.body}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <Link href="/work" className={`${learnMoreClass} mt-6`}>
              Learn more <span aria-hidden>→</span>
            </Link>
          </div>

          <article className="rounded-[20px] border border-black p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Testimonial</p>
            <p className="mt-4 text-base leading-relaxed text-muted">
              &ldquo;They took us from messy DIY branding to a mark we can confidently put in front of
              investors. The jump in perceived quality was immediate.&rdquo;
            </p>
            <p className="mt-6 text-sm font-semibold">— Placeholder testimonial, B2B SaaS Founder</p>
            <Link href="/pricing" className={`${learnMoreClass} mt-6`}>
              Learn more <span aria-hidden>→</span>
            </Link>
          </article>
        </section>

        <section className="mt-16">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Process</p>
            <h2 className="font-display mt-3 text-4xl md:text-5xl">How it works</h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ["01", "Submit brief", "Share audience, style preferences, and references in minutes."],
              ["02", "Review concepts", "Get bold directions fast and choose the strongest route."],
              ["03", "Refine + launch", "Request revisions, approve, and receive full logo assets."],
            ].map(([step, title, body]) => (
              <article key={step} className="rounded-[20px] border border-black p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Step {step}</p>
                <h3 className="mt-2 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted">{body}</p>
                <Link href="/work" className={`${learnMoreClass} mt-4`}>
                  Learn more <span aria-hidden>→</span>
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-4xl md:text-5xl">FAQ</h2>
          <div className="mt-6 space-y-3">
            {faqs.map((faq) => (
              <details key={faq.q} className="rounded-[20px] border border-black p-5">
                <summary className="cursor-pointer text-sm font-semibold md:text-base">{faq.q}</summary>
                <p className="mt-3 text-sm text-muted">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section
          className="mt-16 rounded-[20px] border border-black px-6 py-12 text-white md:px-12"
          style={{
            backgroundImage:
              "linear-gradient(120deg, rgba(0,0,0,0.88), rgba(0,0,0,0.6)), url('https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1600&q=60')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <h2 className="font-display max-w-3xl text-4xl md:text-6xl">Ready to look like the market leader?</h2>
          <p className="mt-4 max-w-2xl text-sm text-white/85 md:text-base">
            Stop shipping weak visuals. Start with a logo system built to convert attention into trust.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/pricing" className="rounded-full border border-white bg-white px-7 py-3 text-sm font-semibold text-black">
              Get started
            </Link>
            <Link href="/work" className="rounded-full border border-white/80 bg-white/10 px-7 py-3 text-sm font-semibold text-white backdrop-blur-sm">
              See our work
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
