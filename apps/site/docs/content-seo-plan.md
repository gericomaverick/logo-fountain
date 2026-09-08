# Logo Fountain content and SEO plan

Date: 2026-09-08
Scope: Eleventy marketing site in `apps/site`

## Summary

The current homepage has a strong visual direction and a clear offer, but the content is still more brand-led than search-led. It says the right things in places, but it does not yet give Google or buyers enough structured evidence around intent, service fit, process, pricing, proof, locations, and decision questions.

The best next move is not to stuff keywords into the current layout. It is to reshape the page into a more buyer-useful service page that still feels warm and human.

Primary content goal:

> Rank and convert for UK logo design searches by clearly explaining who the service is for, what the buyer gets, how much it costs, why it is safe to buy, and why Logo Fountain is a better choice than cheap logo marketplaces or large agency retainers.

## Current content scan

### Current homepage structure

1. Hero
2. Marquee values
3. Why Logo Fountain
4. Process
5. Recent work
6. Packages
7. Testimonials
8. About
9. FAQ
10. Final CTA

### Current strengths

- The positioning is distinctive: hand-drawn, UK-based, named designer, fixed prices, clear usage rights.
- The package structure is clear and avoids unrealistic unlimited revision promises.
- The tone is already friendly and calm.
- The homepage has good trust hooks: review score, delivery timeline, team size, experience, usage rights, Stripe checkout.
- The FAQ already includes a strong SEO query: “How much does a logo cost in the UK?”

### Current weaknesses

- The H1 leads with “Bespoke logo design” but does not include “logo designer” or “logo design service”, which are likely search terms.
- The page does not explicitly answer enough commercial-intent queries above the fold.
- “London & UK” appears, but there is no dedicated service-area section with natural local terms.
- There is no “who this is for” section, even though this works well on service pages.
- The proof sections feel a bit decorative. They need more concrete buyer reassurance.
- The work examples appear fictional or placeholder-like. That is risky if presented as real work.
- The testimonials and “127 verified reviews” claim need substantiation or softening before launch.
- Blog and supporting SEO pages are not yet built.

### Keyword presence in current homepage

Approximate scan of `apps/site/src/index.md`:

- “logo design”: 7 uses
- “bespoke logo”: 5 uses
- “logo designer”: 0 uses
- “custom logo”: 0 uses
- “small business”: 0 uses
- “brand identity”: 0 uses
- “hand-drawn”: 2 uses
- “London”: 8 uses
- “UK”: 22 uses

This is not terrible, but it is missing common buyer language. We should add phrases naturally, not repeatedly.

## External reference findings

### The Lonely Pixel

Fetched page: `https://www.thelonelypixel.co.uk/`

Useful patterns:

- Clear H1 around the exact service: “Freelance Web Designer”.
- Strong supporting H2: “Handcrafted Websites. Built for growth”.
- Personal founder-led copy: “Hi. I'm Chris”.
- Specific experience claims: 15 years, 200+ websites.
- Work section with project-specific outcomes.
- Service list near the top.
- Dedicated “Who I work with” section.
- FAQ section targeting service-intent questions.
- Recent posts to support long-tail search.
- Service areas in the footer/page.
- Friendly language that still sells outcomes.

What to borrow:

- Personal, named expert feel.
- Exact service term in the H1.
- A “who I work with” style section.
- Outcome-led work intros.
- Plain-English pricing and process.
- Stronger blog support around buying questions.

What not to copy:

- The service category and exact wording.
- Any claims we cannot evidence.
- Too many broad services. Logo Fountain should stay focused.

### Logo-design competitor patterns

Fetched or checked via search snippets and page headings:

- Inkbot Design: fixed-price bespoke logo design, trademark-ready, expertise-sector positioning, audit-led CTA, deep educational sections.
- Bespoke Logo: affordable custom logos, UK experts, packages, free consultation, unlimited revisions messaging.
- Pixel Freak: logo design prices and packages, upfront pricing, “what I will do”, “what I won't do”, timescales.
- Luxbranding: flat fixed price, fast turnaround, comparison table, logo types, steps, reviews, FAQs.
- LogoInn: cheap logo design from low price, satisfaction and money-back emphasis.

Common ranking and conversion patterns:

- Exact service keyword in title, H1, H2s, intro copy, and FAQ.
- Pricing clarity.
- Process clarity.
- “What is included” sections.
- Logo type education such as wordmark, lettermark, emblem, combination mark.
- Comparison content, especially cheap logo maker vs professional designer.
- Trust proof with reviews, work, stats, guarantees, or named clients.
- Location terms such as UK, London, near me, small business.
- Supporting blog/articles for long-tail questions.

## Recommended homepage restructure

### 1. Hero: exact service plus human promise

Purpose: capture search intent and buyer desire quickly.

Suggested H1 direction:

> Bespoke logo design for UK small businesses

Alternative:

> A friendly UK logo designer for businesses ready to look established

Supporting copy should mention:

- Logo design service
- UK and London naturally
- Fixed packages
- Named designer
- Clear usage rights
- Hand-drawn process

CTA labels:

- Primary: View logo design packages
- Secondary: See recent logos

### 2. Trust strip directly below hero

Purpose: make the review line a stronger trust signal.

Keep the improved avatars and stars, but make the copy proof-backed.

If claims are verified:

> Rated 4.9 from 127 verified logo design reviews

If not verified yet:

> Trusted by independent UK businesses since 2018

Add 3 small proof points nearby:

- Fixed prices from £349
- Commercial usage rights included
- Typical turnaround from 10 working days

### 3. “Is this right for you?” section

Purpose: mirror the “Who I work with” pattern and convert the right buyers.

Suggested cards:

- New businesses that need to look credible
- Existing businesses that have outgrown their first logo
- Solo founders and small teams who want a real designer, not a marketplace

This section should use relaxed body copy and clear buyer language.

### 4. “What you get” section

Purpose: rank for included-service searches and reduce uncertainty.

Content points:

- Custom logo design, not templates
- Initial sketch exploration
- Vector files: SVG, EPS, PDF
- Web files: PNG, JPG, favicon
- Colour and type guidance where included
- Commercial usage rights
- Private client portal

This could replace or reshape the current marquee/values section.

### 5. Packages

Purpose: commercial conversion.

Keep the three-card pricing section, but add short intro copy that includes “logo design packages UK” and “fixed price logo design”.

Add a short note below packages:

> Not sure which package fits? Send a short brief and we will recommend the lightest sensible option.

This is sales-friendly and trust-building.

### 6. Process

Purpose: reassure buyers and rank for process searches.

Keep four steps, but adjust headings to be more search-friendly:

1. Brief and discovery
2. Hand-drawn logo concepts
3. Refinement and feedback
4. Final files and usage rights

Add a line explaining that buyers review everything in a private portal.

### 7. Work and outcomes

Purpose: proof.

If current examples are placeholders, label them as sample marks or replace with real work. Do not present invented projects as real clients.

Better content pattern per item:

- Business type
- Challenge
- Logo direction
- Practical use case

Example:

> A warm wordmark for an independent bakery that needed to work on packaging, signage and social profiles.

### 8. Founder or studio section

Purpose: human trust.

This should feel more like “Hi, I'm Chris” from The Lonely Pixel.

Current “studio of four” copy is good, but we should make it less agency-like and more personal.

Suggested direction:

> You will not be passed around a big agency team. Your project is handled by a named UK designer who sketches, refines and prepares your final files.

### 9. Comparison section

Purpose: strong SEO and sales assist.

New section idea:

> Logo maker, marketplace, or professional logo designer?

Compare:

- AI logo maker: cheap, fast, limited originality and usage-rights clarity
- Marketplace: lots of options, mixed quality, inconsistent process
- Logo Fountain: fixed scope, named designer, handmade, clear usage rights, final files

This is likely useful for organic traffic and buyer education.

### 10. FAQ expansion

Purpose: capture long-tail searches.

Keep current FAQs and add or rewrite around:

- How much does logo design cost in the UK?
- What files do I receive with my logo?
- What usage rights do I get with my logo?
- How long does a logo design project take?
- What is the difference between a logo and brand identity?
- Can you design a logo for a small business?
- Do you work with businesses outside London?
- What happens after I buy a package?
- Can I speak to the designer before choosing?
- Why not use an AI logo maker?

### 11. Service areas

Purpose: local SEO without pretending to have offices everywhere.

Add a natural section near the footer:

> Logo design for London and businesses across the UK

Mention:

- London
- Bristol
- Manchester
- Birmingham
- Leeds
- Edinburgh
- Glasgow
- Cardiff
- UK-wide remote process

Keep it honest. The point is not to fake local presence. It is to say the service works well remotely.

## Supporting SEO pages to add

Priority 1:

1. `/logo-design-prices-uk/`
   - Target: logo design prices UK, how much does a logo cost UK
   - Sales role: explain package value and drive to pricing.

2. `/logo-design-for-small-business/`
   - Target: small business logo design UK
   - Sales role: answer early-stage founder concerns.

3. `/logo-design-london/`
   - Target: logo design London, logo designer London
   - Sales role: capture London intent while explaining UK-wide remote delivery.

Priority 2:

4. `/logo-maker-vs-logo-designer/`
   - Target: AI logo maker vs designer, professional logo design
   - Sales role: educate against cheap alternatives without sounding snobby.

5. `/what-files-do-i-need-for-a-logo/`
   - Target: logo file formats, SVG EPS PNG logo files
   - Sales role: make the file pack feel valuable.

6. `/brand-identity-vs-logo/`
   - Target: brand identity vs logo
   - Sales role: explain why Professional or Complete may fit better.

## Tone guide

Use:

- Friendly, plain English
- Short sentences
- Specific buyer reassurance
- Honest caveats
- “You” and “we” language
- British spelling

Avoid:

- Em dashes
- Overly polished agency language
- “World-class”, “revolutionary”, “game-changing”
- Fake urgency
- Unlimited revisions
- Claims without proof

Example tone:

> If you are starting a business, your logo does not need to be loud. It needs to feel considered, trustworthy and easy to use. We help you get there with a clear fixed-price process and a designer you can actually talk to.

## SEO metadata recommendations

Current title:

> Logo Design London & UK | Bespoke Logo Design

Recommended title:

> Bespoke Logo Design UK | Logo Designer for Small Businesses

Alternative London-focused title:

> Logo Design London & UK | Bespoke Logos for Small Businesses

Recommended meta description:

> Friendly bespoke logo design for UK small businesses. Hand-drawn concepts, fixed packages from £349, clear commercial usage rights and final files ready for web and print.

## Tracking attributes for GA

Use lightweight `data-track` attributes on important links and conversion elements so GA can be wired without changing the templates again.

Recommended event map:

| Element | Attribute pattern | Suggested GA event |
| --- | --- | --- |
| Header brand | `data-track="nav_brand" data-track-location="header"` | `nav_brand_click` |
| Header section links | `data-track="nav_link" data-track-location="header" data-track-label="Packages"` | `nav_link_click` |
| Hero primary CTA | `data-track="cta_click" data-track-location="hero" data-track-label="View logo design packages"` | `cta_click` |
| Hero secondary CTA | `data-track="cta_click" data-track-location="hero" data-track-label="See sample logos"` | `cta_click` |
| Package buttons | `data-track="package_select" data-track-package="professional" data-track-value="795"` | `package_select` |
| Final CTA buttons | `data-track="cta_click" data-track-location="final_cta"` | `cta_click` |
| Email links | `data-track="contact_click" data-track-method="email"` | `contact_click` |
| Client login | `data-track="login_click" data-track-location="footer"` | `login_click` |

Useful GA parameters:

- `location`
- `label`
- `package`
- `value`
- `href`
- `page_path`

Avoid using personal data in tracking labels or URLs.

## JSON and LLM metadata

Add structured data where it genuinely matches the page:

- `Organization`
- `WebSite`
- `ProfessionalService`
- `OfferCatalog` with package prices
- `FAQPage` generated from the homepage FAQ

Add an `llms.txt` file to give AI search and answer engines a short, plain-English description of the service, packages, trust points and primary URLs. This is not a guaranteed ranking factor, but it is a low-risk machine-readable context file.

## Content implementation sequence

1. Fix proof and trust claims first.
   - Verify or soften review count, testimonials, named work examples and team/location claims.

2. Rewrite hero and trust strip.
   - Add exact service terms and clearer buyer promise.

3. Add “who this is for” and “what you get” blocks.
   - These should sit before packages.

4. Tighten package intro and post-package reassurance.
   - Keep packages clear and commercially focused.

5. Add comparison section.
   - This is high-value for both SEO and sales.

6. Expand FAQ.
   - Use real buyer questions and search-intent wording.

7. Add service area section.
   - Honest UK-wide remote service language.

8. Build the first three supporting SEO pages.
   - Prices, small business, London.

## Proposed new homepage order

1. Hero
2. Trust strip
3. Who it is for
4. What you get
5. Packages
6. Process
7. Work
8. Comparison
9. About the studio
10. Reviews
11. FAQ
12. Service areas
13. Final CTA

## Key decision needed before writing copy

We need to confirm which proof claims are true and usable:

- Is “127 verified reviews” real and where are the reviews hosted?
- Are the current named work examples real client work or placeholders?
- Is the “studio of four” and Bristol studio detail accurate?
- Can we name the designer or founder in the hero/about copy?

If any answer is no, we should soften the content before launch rather than risk trust issues.
