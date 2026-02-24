# Product Brief: Logo Fountain

**Date:** 2026-02-24  
**Author:** Product Owner Agent

## Vision
Build a reliable, repeatable system for delivering bespoke logos to UK small businesses, reducing manual coordination and email-based workflows while maintaining high perceived quality.

## Problem Statement
Many small businesses struggle to create a professional identity due to lack of access to quality design services. Traditional processes lead to slow communication and inefficiencies. 

## Target Users
### Persona 1: Small Business Owner
- **Role:** Owner/Founder  
- **Pain Points:** Difficulty in finding quality design; communication delays with designers.  
- **Goals:** Obtain a professional logo efficiently without hassle.

### Persona 2: Start-up Entrepreneur
- **Role:** CEO/Co-founder  
- **Pain Points:** Limited budget; need for rapid branding; difficulty in navigating design options.  
- **Goals:** Establish a brand identity quickly and affordably.

## Value Proposition
For small business owners and start-up entrepreneurs who need a professional logo quickly and affordably, Logo Fountain is a premium logo design service that leverages local UK designers. Unlike generic template services, our product offers bespoke designs and a streamlined feedback process.

## Business Model
- Fixed-price logo packages (tiered by revisions and delivery speed)
- Optional paid upsells (extra revisions, expedited delivery, brand packs)
- Payment collected upfront via Stripe
- No subscription model in Phase 1

## MVP Features
### Must-Have
1. Client login — essential for project management.  
2. Concept upload and feedback mechanism — critical for design iterations.  
3. Final asset delivery — necessary for project completion.

### Should-Have
1. Project dashboard for tracking progress — significantly enhances user experience.  
2. Automated notifications for updates — improves responsiveness.

### Nice-to-Have (Post-MVP)
1. Advanced analytics to track user engagement.  
2. CRM features for better client relations.

## Out of Scope (MVP)
- Marketplace for third-party designers
- Self-service logo generation
- Public client-to-client interaction
- Multi-brand asset management
- White-label solutions

## Success Metrics
| Metric                 | Target (3 months) | Rationale |
|------------------------|------------------|-----------|
| Paying clients         | 50–100           | Early validation |
| Project completion     | ≥85%             | Process health |
| Repeat customers       | ≥20%             | Service quality |
| Admin time per project | <2h/week          | Scalability |

## Core Workflows (High-Level)

- Client purchases package → submits brief → receives concepts → provides feedback → approves → downloads assets.
- Admin receives brief → produces concepts → uploads revisions → manages entitlements → completes delivery.

## Differentiators
- UK-based designers only
- Human-led, no templates or AI generation
- Structured, transparent workflow
- Fixed pricing with clear entitlements
- High-end design

## Compliance Considerations
- GDPR compliance
- Secure asset storage
- Clear refund and dispute handling

## Key Assumptions
- Clients are willing to manage projects via dashboard
- Email + app notifications are sufficient
- Designers can adapt to structured workflow
- Most projects complete in ≤3 revision cycles

## Delivery Constraints
- Solo founder + limited contractor support
- No dedicated DevOps team
- Must run on managed services (Supabase/Vercel)
- Minimise ongoing maintenance burden
- Avoid complex microservice architectures

## Open Questions
- How will we handle upsell processes?
- What user support will be necessary?

## Next Steps
1. Business Analyst to create detailed PRD
2. Architect to design technical architecture
3. UX Designer to create design specification
