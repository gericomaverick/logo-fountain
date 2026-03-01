# Logo Fountain — Decisions Log

Format:
YYYY-MM-DD — <Decision>. Rationale: <why>. Impact: <what changes>. #decision

---

2026-02-24 — Decision logging enabled. Rationale: Establish governance and traceability. Impact: All major Logo Fountain decisions are recorded here. #decision
2026-02-24 — Product Brief v1.0 approved. Rationale: Establish stable scope and MVP boundaries. Impact: Enables PRD and architecture phases. #decision
2026-03-01 — Logo Fountain set as primary business goal. Rationale: User prioritization. Impact: Focus execution/planning on Logo Fountain. #decision
2026-03-01 — Stack set to Next.js + Supabase + Prisma + Stripe. Rationale: User preference + speed. Impact: PRD/architecture and implementation assume this stack. #decision
2026-03-01 — Codex 5.3 restricted to development/coding stages only. Rationale: Control limits/costs and reserve Codex for code. Impact: Planning uses non-Codex models; coding stages explicitly switch. #decision
2026-03-01 — Workflow: Do not use Codex at all during pre-dev planning/spec stages; only consider it when explicitly starting implementation. Rationale: User request. Impact: All current work stays in docs/specs using non-Codex models. #decision
2026-03-01 — Auth: email+password with optional magic-link sign-in. Rationale: User preference. Impact: PRD/architecture supports both. #decision
2026-03-01 — Revisions are consumed at the moment the client submits a revision request. Rationale: Immediate feedback implies revision used. Impact: Entitlements decrement on request creation, not fulfillment. #decision
2026-03-01 — VAT: not VAT registered initially; capture client VAT number and show “VAT not charged (supplier not VAT registered)”. Rationale: User setup + client needs. Impact: Data model + invoice/receipt text logic include VAT number field. #decision
2026-03-01 — Package entitlements calibrated (Option B): Essential £299 (2 concepts/2 revisions), Professional £499 (3 concepts/2 revisions), Complete £749 (3 concepts/5 revisions). Rationale: Workload math (concept≈5h, revision≈2h) showed prior tiers too generous. Impact: PRD/architecture enforce these entitlements; marketing copy must match. #decision
2026-03-01 — Upgrades/add-ons defined: Essential→Professional £180; Professional→Complete £225; Extra revision £49 (Stripe price ids tracked in PRD). Rationale: User provided upgrade catalog. Impact: Implement add-on purchase + entitlement adjustments. #decision
2026-03-01 — Upgrade entitlement policy: additive-from-current (preserve consumed; apply deltas). Rationale: User preference; avoids punishing early progress. Impact: Fulfillment computes deltas and updates `project_entitlements`. #decision
2026-03-01 — Promo code PRO40FIRST5 limited to first 5 redemptions total (Stripe redemption limit = 5). Rationale: User confirmed. Impact: Configure in Stripe; no custom counting logic. #decision
2026-03-01 — Scope: add event/campaign landing pages outside the dashboard for targeting local business events and running offers. Rationale: User go-to-market need. Impact: Add `/c/[slug]` public route + campaign content model + attribution into checkout/orders. #decision
