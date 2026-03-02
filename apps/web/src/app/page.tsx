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
    title: "Founders launching fast",
    body: "Need a premium logo now so your product can ship with authority, not placeholders.",
  },
  {
    title: "Agencies scaling output",
    body: "White-label logo production without hiring another full-time designer.",
  },
  {
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

export default function Home() {
  return (
    <main className="bg-neutral-950 text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <section className="rounded-3xl border border-white/15 bg-gradient-to-b from-white/10 to-transparent p-6 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Built for brands that refuse to look average
          </p>
          <h1 className="mt-3 text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl md:text-8xl">
            Logo Fountain
          </h1>
          <p className="mt-5 max-w-2xl text-base text-neutral-200 sm:text-lg">
            Direct-response logo design that turns &ldquo;we should fix our brand&rdquo; into &ldquo;we&apos;re live and
            winning.&rdquo; Fast turnaround. Sharp concepts. Zero fluff.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-xl bg-cyan-400 px-6 py-3 text-base font-bold text-black transition hover:bg-cyan-300"
            >
              Get started
            </Link>
            <Link
              href="/work"
              className="inline-flex items-center justify-center rounded-xl border border-white/30 px-6 py-3 text-base font-semibold text-white transition hover:border-white"
            >
              Our work
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ["48h", "First concept delivery"],
              ["500+", "Logo directions shipped"],
              ["4.9/5", "Client satisfaction (placeholder)"],
            ].map(([stat, label]) => (
              <div key={label} className="rounded-xl border border-white/20 bg-white/5 p-4">
                <div className="text-3xl font-extrabold text-cyan-300">{stat}</div>
                <div className="mt-1 text-sm text-neutral-300">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">
                Logo examples
              </p>
              <h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">Recent marks we&apos;ve crafted</h2>
            </div>
            <Link href="/work" className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">
              View full gallery
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {logoMarks.map((mark) => (
              <div
                key={mark}
                className="group rounded-xl border border-white/15 bg-neutral-900 p-4 text-center transition hover:border-cyan-300/60 hover:bg-neutral-800"
              >
                <div className="text-xl font-black tracking-wider text-white">{mark.slice(0, 1)}</div>
                <div className="mt-1 text-xs font-semibold tracking-[0.18em] text-neutral-400">
                  {mark}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Who this is for</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {segments.map((segment) => (
              <article key={segment.title} className="rounded-2xl border border-white/15 bg-white/5 p-5">
                <h3 className="text-lg font-bold">{segment.title}</h3>
                <p className="mt-2 text-sm text-neutral-300">{segment.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">
              Packages teaser
            </p>
            <h2 className="mt-2 text-2xl font-extrabold">Pick your speed and depth</h2>
            <ul className="mt-4 space-y-2 text-sm text-neutral-200">
              <li>• Starter — one direction, rapid launch</li>
              <li>• Growth — multiple directions + revision rounds</li>
              <li>• Scale — complete identity lockup system</li>
            </ul>
            <Link href="/pricing" className="mt-5 inline-block text-sm font-semibold text-cyan-300">
              Compare packages →
            </Link>
          </div>

          <div className="rounded-2xl border border-cyan-300/40 bg-cyan-300/10 p-6">
            <p className="text-sm italic text-cyan-100">
              &ldquo;They took us from messy DIY branding to a mark we can confidently put in front of
              investors. The jump in perceived quality was immediate.&rdquo;
            </p>
            <p className="mt-4 text-sm font-semibold text-white">— Placeholder testimonial, B2B SaaS Founder</p>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-extrabold sm:text-3xl">How it works</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              ["01", "Submit brief", "Share audience, style preferences, and references in minutes."],
              ["02", "Review concepts", "Get bold directions fast and choose the strongest route."],
              ["03", "Refine + launch", "Request revisions, approve, and receive full logo assets."],
            ].map(([step, title, body]) => (
              <div key={step} className="rounded-xl border border-white/15 bg-white/5 p-5">
                <div className="text-xs font-bold tracking-[0.15em] text-cyan-300">STEP {step}</div>
                <h3 className="mt-2 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm text-neutral-300">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-extrabold sm:text-3xl">FAQ</h2>
          <div className="mt-5 space-y-3">
            {faqs.map((faq) => (
              <details key={faq.q} className="rounded-xl border border-white/15 bg-white/5 p-4">
                <summary className="cursor-pointer text-sm font-semibold sm:text-base">{faq.q}</summary>
                <p className="mt-2 text-sm text-neutral-300">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-14 rounded-3xl border border-white/20 bg-gradient-to-r from-cyan-400 to-blue-500 p-8 text-black">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Ready to look like the market leader?</h2>
          <p className="mt-2 max-w-2xl text-sm font-medium sm:text-base">
            Stop shipping weak visuals. Start with a logo system built to convert attention into
            trust.
          </p>
          <div className="mt-6">
            <Link
              href="/pricing"
              className="inline-flex rounded-xl bg-black px-6 py-3 text-base font-bold text-white transition hover:bg-neutral-800"
            >
              Get started
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
