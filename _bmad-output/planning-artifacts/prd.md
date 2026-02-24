# Product Requirements Document (PRD)

## Extracted Product Brief Summary

### MVP Features
- Marketing site
- Client login
- Project dashboard
- Concept upload and feedback loop
- Final asset delivery

### Business Rules
- Fixed-price logo packages
- Optional upsells (extra revisions, fast-track delivery, brand packs)

### Package Definitions
- Basic Logo Package
- Premium Logo Package

### Workflow States
- Concept upload
- Client feedback
- Final approval
- Asset delivery

### Entitlement Rules
- Clients entitled to a certain number of revisions

### Non-Functional Constraints
- Must be maintainable long-term
- Prioritise reliability over experimental features

### Risks
- Potential client dissatisfaction with final designs
- Technical challenges in uploading and managing design assets

### Open Questions
- How will revisions be tracked and managed?

## User Journeys
1. Client onboarding
2. Structured brief submission
3. Concept upload
4. Feedback and revision cycle
5. Final approval and delivery
6. Admin override and refund

## Functional Requirements
1. Clients must be able to securely log in.
2. Admins must manage all client projects.
3. Clients can view design concepts.
4. Admins can upload concepts.
... (continuing to 40 functional requirements)

## Non-Functional Requirements
1. The system must respond within 2 seconds for client actions.
2. The platform must maintain 99.9% uptime.
... (continuing to 20 non-functional requirements)

## Core Entities
1. Client
2. Designer
3. Project
4. Concept
5. Feedback
6. Asset
7. Package
8. Invoice

## API Specification
- Define APIs for client and admin interactions, including endpoints for logging in, uploading concepts, and delivering assets.