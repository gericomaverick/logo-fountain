import {
  DarkFeatureSection,
  FAQ,
  FinalCTA,
  HeroCenter,
  LogoWall,
  ProofStatsRow,
  SegmentCards,
  TestimonialCardsRow,
} from "@/components/marketing/sections";

const logoMarks = ["ATLAS", "NOVA", "APEX", "LUMEN", "KYTE", "MOTION", "SABLE", "AURIC", "FLINT", "OSLO", "BOLT", "VERVE"];

const stats = [
  { value: "48h", label: "First concept delivery" },
  { value: "500+", label: "Directions shipped" },
  { value: "4.9/5", label: "Client satisfaction" },
];

const segments = [
  {
    icon: "◉",
    title: "Founders launching fast",
    body: "Premium identity work that ships with your product launch instead of holding it back.",
  },
  {
    icon: "◆",
    title: "Agencies scaling output",
    body: "White-label logo systems produced with consistent quality and direct-response intent.",
  },
  {
    icon: "◌",
    title: "Teams rebranding",
    body: "A new mark and visual direction aligned with your market positioning and offer.",
  },
];

const testimonials = [
  {
    quote: "They replaced our placeholder brand in a week. Investor calls instantly felt more credible.",
    byline: "— B2B SaaS Founder",
  },
  {
    quote: "The concepts were sharp, strategic, and easy to present to our board in one pass.",
    byline: "— Fintech Marketing Lead",
  },
  {
    quote: "Fastest design partner we’ve worked with and still the cleanest execution.",
    byline: "— Agency Operator",
  },
];

const faqs = [
  {
    q: "How fast can we start?",
    a: "Immediately after checkout. You submit your brief and we begin concept work right away.",
  },
  {
    q: "How many revisions do we get?",
    a: "Revision rounds are scoped per package, with enough room to land on a clear final direction.",
  },
  {
    q: "Do we get source files?",
    a: "Yes — delivery includes production-ready exports and editable source files.",
  },
  {
    q: "Can you align to our existing brand?",
    a: "Absolutely. Share your current brand system, references, and audience context in your brief.",
  },
];

export default function Home() {
  return (
    <main className="bg-white text-black">
      <HeroCenter
        eyebrow="The UK's best logo design service"
        hello="Hello"
        title="Built for brands that refuse to look average"
        body="Direct-response logo design that turns ‘we should fix our brand’ into ‘we launched and it converts.’"
        primary={{ href: "/pricing", label: "Get started" }}
        secondary={{ href: "/work", label: "Our work" }}
      />

      <ProofStatsRow
        quote="They made us look like the category leader before we raised our next round."
        byline="— Placeholder testimonial, SaaS founder"
        stats={stats}
      />

      <LogoWall title="Recent marks we’ve crafted" logos={logoMarks} />

      <SegmentCards eyebrow="Who this is for" title="Built for teams that ship fast" items={segments} />

      <TestimonialCardsRow title="Trusted by teams shipping serious offers" items={testimonials} />

      <DarkFeatureSection
        eyebrow="Why teams switch"
        title="A faster, sharper logo process with less back-and-forth"
        body="A proven conversion cadence, adapted for Logo Fountain: clear strategic segments, proof-heavy trust blocks, and a dark product section to anchor value."
        cards={[
          {
            title: "Strategic first pass",
            body: "Concepts are positioned against your market and offer before visuals are polished.",
          },
          {
            title: "Feedback that moves",
            body: "Revision cycles are structured around commercial clarity, not subjective taste loops.",
          },
          {
            title: "Launch-ready delivery",
            body: "You get complete logo assets prepared for product, web, and paid media usage.",
          },
        ]}
        primary={{ href: "/pricing", label: "Start project" }}
        secondary={{ href: "/work", label: "See examples" }}
      />

      <FAQ title="Frequently asked questions" items={faqs} />

      <FinalCTA
        title="Ready to look like the market leader?"
        body="Stop shipping weak visuals. Start with a logo system built to turn attention into trust."
        primary={{ href: "/pricing", label: "Get started" }}
        secondary={{ href: "/work", label: "View work" }}
      />
    </main>
  );
}
