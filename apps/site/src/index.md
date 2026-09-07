---
layout: layouts/page.njk
title: Home
blocks:
  - type: hero
    showCanvas: true
    eyebrow: Est. 2018 · Logo design studio for London & the UK
    meta:
      - strong: "127"
        text: marks delivered
      - strong: 10 to 14 days
        text: typical turnaround
    title: Bespoke logo design,<br>drawn by hand for London <span class="ampersand">&amp;</span> the <span class="italic">UK.</span>
    ratingLabel: 4.9 out of 5
    ratingText: 4.9/5 · 127 verified reviews
    content: <strong>Logo Fountain</strong> is a small, experienced studio creating bespoke logos and brand identities for independent businesses in London and right across the UK. Every logo is sketched and refined by hand by a designer you will know by name, from the first idea through to your final files.
    primary:
      text: View packages
      url: "#packages"
    secondary:
      text: See recent work
      url: "#work"

  - type: marquee
    label: Values
    items:
      - text: Drawn by hand in the UK
      - text: Experienced senior designers
        icon: x
      - text: Serving London & the whole UK
      - text: Fixed prices, no surprises
        icon: x
      - text: Named designer on every project
      - text: Full ownership & copyright transferred
        icon: x

  - type: values
    eyebrow: Why Logo Fountain
    title: A warmer kind <span class="italic" style="color:var(--purple)">of craft.</span>
    content: Your logo is often the first thing people notice and the last thing they forget. We take real care over it, drawing every idea by hand and shaping it with you, so you end up with something that feels genuinely yours and keeps working for years to come.
    items:
      - kicker: Made by hand
        title: Drawn, not churned out.
        content: Every logo starts as pencil sketches from an experienced designer, then grows into a handful of considered directions. You get genuine craft and real thinking, not a template with your name dropped into it.
        tag: Hand-drawn craft
      - kicker: A real relationship
        title: One designer, start to finish.
        content: You will know your designer by name from day one, and they are the person who sketches, refines and delivers your logo. It stays personal, friendly and easy to talk through at every step.
        tag: UK-based team
      - kicker: Built to last
        title: Logos that age well.
        content: We design for the long run, not this year's trend. Every logo is tested everywhere it needs to work, from a tiny favicon to a shop front, and comes with clear guidelines so it stays consistent as you grow.
        tag: Timeless by default

  - type: process
    id: process
    showCanvas: true
    eyebrow: The process
    title: Four steps. <span class="italic" style="color:var(--purple)">No surprises.</span>
    content: A clear, predictable path from first brief to final delivery. You will always know where your project is, what happens next, and who is working on it. Most logos land in <strong>10 to 14 working days</strong>.
    items:
      - title: Brief & discovery
        content: A friendly questionnaire covering your audience, your market and where your logo needs to live. We ask in plain English, with no jargon and nothing to trip you up.
        meta: Day 1 · around 30 mins
      - title: Sketch & concept
        content: Your designer sketches by hand, then refines a few directions in the studio. Each concept comes with a short written note explaining the thinking behind it.
        meta: Days 2 to 7 · drawn in-house
      - title: Refine & review
        content: You review concepts in your private portal, leave clear feedback, and we refine towards a single final logo. Everything lives in one place, so nothing gets lost.
        meta: Days 8 to 12 · 1 to 3 rounds
      - title: Deliver & handover
        content: Final artwork arrives as vector and raster files, along with a simple usage guide. Full copyright is transferred, so the logo is unambiguously yours.
        meta: Days 13 to 14 · full ownership

  - type: work
    id: work
    eyebrow: Recent work
    title: Marks we've drawn <span class="italic" style="color:var(--purple)">this year.</span>
    content: A small selection of logos delivered to founders, independents and family businesses across the UK. Each one was drawn in our studio, owned outright by the client, and built to last.
    items:
      - class: work-a
        label: Alderman & Co, solicitors in Bath
        mark: A&Co
        client: Alderman & Co · Bath
        sector: Solicitors
      - class: work-b
        label: Kelpie, coastal café in Whitstable
        mark: Kelpie
        italic: true
        client: Kelpie · Whitstable
        sector: Hospitality
      - class: work-c
        label: Forth, engineering in Edinburgh
        mark: Forth.
        client: Forth · Edinburgh
        sector: Engineering
        metaStyle: color:rgba(255,255,255,.6)
        tagStyle: background:rgba(255,255,255,.12);color:#fff
      - class: work-d
        label: Nimbus, insurance in Manchester
        mark: N
        client: Nimbus · Manchester
        sector: Insurance
      - class: work-e
        label: Wren Bakery, artisan bakery in Bristol
        mark: Wren.
        italic: true
        client: Wren Bakery · Bristol
        sector: Food & drink
        metaStyle: color:rgba(255,255,255,.8)
        tagStyle: background:rgba(255,255,255,.15);color:#fff
      - class: work-f
        label: Hedge Row, garden design in the Cotswolds
        mark: H/R
        client: Hedge Row · Cotswolds
        sector: Landscape

  - type: packages
    id: packages
    eyebrow: Packages
    title: Three clear packages.<br><span class="italic" style="color:var(--purple)">Fixed prices. Full ownership.</span>
    content: Every package includes an experienced UK designer, full copyright transfer, and all the files you need to launch. Secure checkout is handled by Stripe.
    items:
      - name: Essential
        packageCode: essential
        tagline: For sole traders and first-year founders finding their feet.
        price: "349"
        priceNote: one-off
        vatNote: one-off · secure Stripe checkout
        features:
          - 2 strategic concept directions
          - 2 rounds of refinements
          - Primary logo + favicon
          - Vector & raster file pack
          - Full copyright transferred
          - About 10 working days
        button:
          text: Choose Essential
          url: "#packages"
        footnote: Best for single-founder start-ups
      - name: Professional
        packageCode: professional
        featured: true
        ribbon: Most popular
        tagline: For growing UK businesses ready to look like a serious brand.
        price: "795"
        priceNote: one-off
        vatNote: one-off · secure Stripe checkout
        features:
          - 3 distinct concept directions
          - 2 rounds of refinements
          - Primary + secondary lockups, monogram, favicon
          - Colour system + typography pairing
          - 8-page usage guide (PDF)
          - Full copyright transferred
          - About 14 working days
        button:
          text: Choose Professional
          url: "#packages"
        footnote: Best balance of depth and speed
      - name: Complete
        packageCode: complete
        tagline: For founders who want the full brand foundation before launch.
        price: "1495"
        priceNote: one-off
        vatNote: one-off · secure Stripe checkout
        features:
          - 3 premium concept directions
          - 5 rounds of refinements
          - Complete logo suite and responsive lockups
          - Brand colours, type pairing and usage system
          - 16-page mini brand guide
          - Social profile artwork and launch assets
          - Full copyright transferred
          - About 18 to 21 working days
        button:
          text: Choose Complete
          url: "#packages"
        footnote: Best for launch-ready brands

  - type: testimonials
    eyebrow: What clients say
    title: Real businesses.<br><span class="italic" style="color:var(--purple)">Real British high streets.</span>
    content: A handful of the 127 studios, shops, practices and start-ups we have worked with since 2018. Every review is collected through verified channels, with no incentives and no cherry-picking.
    items:
      - sector: Hospitality · Yorkshire
        quote: It felt like working with an old friend who happens to be brilliant at drawing. People photograph our shopfront every Saturday now, and <em>that</em> is the logo doing its job.
        initials: EH
        name: Eleanor Hartley
        role: Owner, Hartley's Tea Rooms · Harrogate
      - sector: Professional services
        quote: They took time to understand a fairly traditional profession and gave us something modern without losing our sense of trust. A real pleasure from start to finish.
        initials: JM
        name: James Montgomery
        role: Partner, Montgomery & Finch · London
      - sector: Retail · Scotland
        quote: Properly thoughtful. The designer rang me after spotting my shop on Google Street View, and that is the level of care throughout.
        initials: RA
        name: Rhona Abernethy
        role: Founder, The Fiddlehead · Inverness

  - type: about
    id: about
    eyebrow: The studio
    title: A studio of four, <span class="italic" style="color:var(--purple)">not forty.</span>
    content: |
      We are a small team of experienced UK designers working from a studio above a café in Bristol. We keep the team deliberately small, because it is the surest way to make sure every project gets the designer you hired and the care you are paying for.

      Between us we have 47 years at studios including Pentagram, DesignStudio and SomeOne, plus work for the V&A, John Lewis, Channel 4 and dozens of independent UK businesses. All of that experience goes into every logo we draw.
    signature: The Logo Fountain team
    card:
      eyebrow: By the numbers
      title: Eight years of drawing logos by hand.
      content: A transparent look at the studio since we opened in 2018.
      stats:
        - value: "127"
          label: UK brands identified
        - value: "4.9"
          label: Avg. review score
        - value: "98%"
          label: On-time delivery
        - value: "47"
          label: Years of experience

  - type: faq
    id: faq
    eyebrow: FAQ
    title: Answered <span class="italic" style="color:var(--purple)">honestly.</span>
    content: The questions we are asked most often by businesses in London and across the UK who are thinking about a new logo. Still unsure? <a href="mailto:hello@logofountain.co.uk" style="color:var(--ink);text-decoration:underline;text-underline-offset:3px">Email the studio directly</a>.
    items:
      - question: Are all your designers actually based in the UK?
        answer: Yes. Every designer on the team is UK-based, and the person you brief is the person who draws your logo.
      - question: Is every logo really drawn by hand?
        answer: Yes. Every logo begins with pencil on paper and is developed by a named designer, from the first rough sketches through to the final colour and type.
      - question: How much does a logo cost in the UK?
        answer: Bespoke logo design from a UK studio usually ranges from around £400 for a sole-trader logo up to £15,000 or more for a large brand system. Our packages sit at the accessible end of that range without cutting corners on craft.
      - question: Who owns the copyright to my finished logo?
        answer: You do, in full, without restriction and worldwide. On final delivery we transfer copyright to your limited company or sole-trader name through a signed deed of assignment.
      - question: How long does the whole process take?
        answer: Roughly 10 working days for Essential, 14 for Professional, and 18 to 21 for Complete.
      - question: Can you register the trademark for us?
        answer: We do not file trademarks ourselves, but we will supply the export files and ownership paperwork a trademark attorney will usually need.

  - type: final-cta
    showCanvas: true
    eyebrow: Take the first step
    title: Let's draw something <span class="italic">worth keeping.</span>
    content: Tell us about your business in a short, five-minute brief. An experienced UK designer will reply within one working day with honest thoughts, a realistic timeline, and a suggestion for the package that fits where you are.
    primary:
      text: Start your brief
      url: "#packages"
    secondary:
      text: Email the studio
      url: mailto:hello@logofountain.co.uk
    stampText: Made in the UK • Drawn by hand • Bespoke logo design • Est. 2018 •
meta:
  title: Logo Design London & UK | Bespoke Logo Design
  desc: Bespoke, hand-drawn logo design for businesses in London and across the UK. Experienced designers, fixed prices, full copyright transfer, and a named designer on every project.
---
