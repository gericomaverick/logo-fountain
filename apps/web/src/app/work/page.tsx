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

const logos = ["PIXEL", "KORU", "FJORD", "NEXA", "RIVET", "EMBER", "DRIFT", "ARROW", "VERSE", "CINDER", "ALTOS", "HARBOR"];

const verticals = [
  {
    icon: "◉",
    title: "SaaS + AI",
    body: "Identity systems built for product-led growth and high-velocity launch cycles.",
  },
  {
    icon: "◆",
    title: "Ecommerce",
    body: "Marks designed to survive ads, packaging, storefronts, and retention surfaces.",
  },
  {
    icon: "◌",
    title: "Professional services",
    body: "Premium logo direction for firms that need credibility at first glance.",
  },
];

const testimonials = [
  {
    quote: "The chosen concept pulled our whole rebrand together in under two weeks.",
    byline: "— DTC Brand Operator",
  },
  {
    quote: "Every direction felt intentional and easy to pressure-test with our internal team.",
    byline: "— Head of Marketing, B2B Services",
  },
  {
    quote: "We shipped the new brand system faster than any prior design engagement.",
    byline: "— Startup Co-founder",
  },
];

export default function WorkPage() {
  return (
    <main className="bg-white text-black">
      <HeroCenter
        eyebrow="Logo Fountain portfolio"
        title="Work built for conversion and category authority"
        body="A HYROS-style section flow applied to our gallery: proof, segmentation, testimonials, and a dark value block before conversion CTA."
        primary={{ href: "/pricing", label: "Start your project" }}
        secondary={{ href: "/", label: "Back to homepage" }}
      />

      <ProofStatsRow
        quote="Our new logo lifted response rates across paid traffic and sales decks in the same month."
        byline="— Placeholder testimonial, ecommerce founder"
        stats={[
          { value: "12", label: "Industries served" },
          { value: "300+", label: "Concepts refined" },
          { value: "72h", label: "Average first pass" },
        ]}
      />

      <LogoWall title="Selected logo directions" logos={logos} />

      <SegmentCards eyebrow="Segments we support" title="Designed for teams that move quickly" items={verticals} />

      <TestimonialCardsRow title="What clients say after launch" items={testimonials} />

      <DarkFeatureSection
        eyebrow="How we deliver"
        title="Structured process, premium output, and predictable turnaround"
        body="This dark section mirrors HYROS cadence with simplified sticky-card feel and transparent production steps."
        cards={[
          {
            title: "Brief + positioning",
            body: "We align logo direction with your audience, offer, and market category cues.",
          },
          {
            title: "Concept batch",
            body: "You receive multiple routes designed for clarity, memorability, and practical usage.",
          },
          {
            title: "Refinement + handoff",
            body: "Approved direction is polished and delivered with complete source and export files.",
          },
        ]}
        primary={{ href: "/pricing", label: "Book your logo sprint" }}
        secondary={{ href: "/", label: "See full site" }}
      />

      <FAQ
        title="Work page FAQ"
        items={[
          {
            q: "Can you design inside our current visual system?",
            a: "Yes. We can extend existing brand elements or evolve them into a cleaner logo direction.",
          },
          {
            q: "Do you support agencies?",
            a: "Yes, with white-label workflows and predictable delivery windows for client handoff.",
          },
          {
            q: "What files are included?",
            a: "Vector source files and common web/print exports, organized for immediate use.",
          },
        ]}
      />

      <FinalCTA
        title="Want your logo featured here next?"
        body="Start now and get your first concept directions fast."
        primary={{ href: "/pricing", label: "Get started" }}
        secondary={{ href: "/", label: "Homepage" }}
      />
    </main>
  );
}
