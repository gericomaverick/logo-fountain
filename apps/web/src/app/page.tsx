import Link from "next/link";

import { PackageCheckoutButton } from "@/components/marketing/package-checkout-button";

const workMarks = ["Bracken", "Northline", "Alder & Co", "Morrow", "Fable Yard", "Cairn", "Oval House", "Wick Studio", "Threadwell", "The Good Plot", "Orra", "Bristol Fold"];

const values = [
  {
    title: "Drawn, not generated.",
    body: "Every concept begins with human sketching and senior design judgement. No Midjourney, DALL·E, logo generators or prompt packs at any stage.",
  },
  {
    title: "A proper UK studio process.",
    body: "Clear brief, named designer, private client portal, visible milestones and structured revision rounds — not a faceless freelancer marketplace.",
  },
  {
    title: "Marks that age well.",
    body: "We test every direction from tiny favicons to signage scale, then hand over clean source files, exports and practical usage guidance.",
  },
];

const steps = [
  ["01", "Brief", "A focused questionnaire captures your audience, competitors, tone and where the mark needs to live."],
  ["02", "Concepts", "Your designer explores distinct directions and explains the rationale behind each route."],
  ["03", "Refinement", "You review work in your portal, leave feedback and track revisions without messy email threads."],
  ["04", "Delivery", "Final artwork is supplied as vector and raster files with full ownership transferred to you."],
];

const packages = [
  {
    code: "essential" as const,
    name: "Essential",
    price: "£299",
    strap: "For sole traders and first-year founders finding their feet.",
    bullets: ["2 concept directions", "2 revision rounds", "Primary logo + favicon", "Vector & raster file pack", "Full copyright transferred"],
  },
  {
    code: "professional" as const,
    name: "Professional",
    price: "£499",
    strap: "For growing businesses ready to look like a serious brand.",
    bullets: ["3 concept directions", "2 revision rounds", "Primary + secondary lockups", "Colour and type pairing", "Usage guide and source files"],
    featured: true,
  },
  {
    code: "complete" as const,
    name: "Complete",
    price: "£749",
    strap: "For established firms launching, rebranding or going public.",
    bullets: ["3 concept directions", "5 revision rounds", "Expanded mark suite", "Priority designer turnaround", "Complete launch-ready file pack"],
  },
];

const faqs = [
  ["Are the designers UK based?", "Yes. Logo Fountain is built around British designers and a tight, accountable studio process."],
  ["Do you use AI for concepts?", "No. Concepts are made by designers, not generated from prompts or logo-template tools."],
  ["Who owns the final logo?", "You do. Final delivery includes the files needed to use the mark and ownership is transferred to your business."],
  ["How do payments work?", "Choose a package and you are sent through secure Stripe checkout. After payment, your private project portal opens for the brief."],
];

function Spark() {
  return <span className="lf2-spark" aria-hidden />;
}

export default function Home() {
  return (
    <main className="lf2-page">
      <header className="lf2-nav">
        <Link href="/" className="lf2-brand"><Spark /> Logo Fountain</Link>
        <nav aria-label="Main navigation">
          <Link href="#work">Work</Link>
          <Link href="#process">Process</Link>
          <Link href="#packages">Packages</Link>
          <Link href="#faq">FAQ</Link>
          <Link href="/login">Client login</Link>
        </nav>
        <Link href="#packages" className="lf2-nav-cta">Book your logo</Link>
      </header>

      <section className="lf2-hero">
        <div className="lf2-container lf2-hero-grid">
          <div>
            <p className="lf2-eyebrow"><Spark /> British logo design · no AI · no outsourcing</p>
            <h1>Logos designed in Britain. By people, never by prompts.</h1>
            <p className="lf2-lede">Logo Fountain is a small studio building distinctive identities for independent businesses across the UK. Every mark is sketched, refined and prepared for real-world use by a named designer.</p>
            <div className="lf2-actions">
              <Link href="#packages" className="lf2-button lf2-button-primary">View packages</Link>
              <Link href="#work" className="lf2-button lf2-button-ghost">See recent work</Link>
            </div>
          </div>
          <div className="lf2-hero-card" aria-label="Logo Fountain process summary">
            <div className="lf2-hero-orb"><Spark /></div>
            <p>Private portal</p>
            <h2>Brief → concepts → revisions → final files</h2>
            <div className="lf2-mini-grid">
              <span>Named designer</span><span>Stripe checkout</span><span>Full ownership</span><span>UK process</span>
            </div>
          </div>
        </div>
      </section>

      <section className="lf2-section" id="values">
        <div className="lf2-container lf2-split">
          <div>
            <p className="lf2-eyebrow"><Spark /> Studio values</p>
            <h2>A quieter kind of craft.</h2>
            <p className="lf2-lede">The market is flooded with generated marks and templated lookalikes. We build the opposite: identities made carefully, by people who understand the market you trade in.</p>
          </div>
          <div className="lf2-card-grid">
            {values.map((item) => <article className="lf2-card" key={item.title}><h3>{item.title}</h3><p>{item.body}</p></article>)}
          </div>
        </div>
      </section>

      <section className="lf2-section lf2-paper" id="process">
        <div className="lf2-container">
          <p className="lf2-eyebrow"><Spark /> Process</p>
          <h2>Four steps. No surprises.</h2>
          <p className="lf2-lede">A predictable path from first brief to final delivery. You always know where your project sits, what happens next and who is working on it.</p>
          <div className="lf2-step-grid">
            {steps.map(([number, title, body]) => <article key={number} className="lf2-step"><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}
          </div>
        </div>
      </section>

      <section className="lf2-section" id="work">
        <div className="lf2-container">
          <div className="lf2-section-head"><div><p className="lf2-eyebrow"><Spark /> Recent work</p><h2>Marks we have drawn this year.</h2></div><p>A small selection of identity directions for founders, independents and family businesses.</p></div>
          <div className="lf2-logo-wall">{workMarks.map((mark) => <div key={mark}>{mark}</div>)}</div>
        </div>
      </section>

      <section className="lf2-section lf2-paper" id="packages">
        <div className="lf2-container">
          <p className="lf2-eyebrow"><Spark /> Packages</p>
          <h2>Three clear packages. Fixed prices. Full ownership.</h2>
          <p className="lf2-lede">All packages use the current Stripe checkout links and include full copyright transfer plus the files you need to launch.</p>
          <div className="lf2-pricing-grid">
            {packages.map((plan) => (
              <article className={`lf2-price-card ${plan.featured ? "is-featured" : ""}`} key={plan.code}>
                {plan.featured ? <span className="lf2-ribbon">Most popular</span> : null}
                <h3>{plan.name}</h3>
                <p>{plan.strap}</p>
                <div className="lf2-price">{plan.price}</div>
                <ul>{plan.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
                <PackageCheckoutButton packageCode={plan.code} className="lf2-button lf2-button-primary lf2-button-full">Choose {plan.name}</PackageCheckoutButton>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lf2-section">
        <div className="lf2-container lf2-studio">
          <div><p className="lf2-eyebrow"><Spark /> About</p><h2>A small studio, not a logo factory.</h2></div>
          <p>Logo Fountain keeps the team and process intentionally tight: considered design work, plain-English communication, private project tracking and a final handover that is easy to use.</p>
        </div>
      </section>

      <section className="lf2-section lf2-paper" id="faq">
        <div className="lf2-container lf2-faq-grid">
          <div><p className="lf2-eyebrow"><Spark /> FAQ</p><h2>Answered honestly.</h2></div>
          <div>{faqs.map(([q, a]) => <details key={q} className="lf2-faq"><summary>{q}</summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      <section className="lf2-final">
        <div className="lf2-container">
          <h2>Let’s draw something worth keeping.</h2>
          <p>Choose a package, complete secure checkout and start your brief in the client portal.</p>
          <Link href="#packages" className="lf2-button lf2-button-primary">Start your brief</Link>
        </div>
      </section>
    </main>
  );
}
