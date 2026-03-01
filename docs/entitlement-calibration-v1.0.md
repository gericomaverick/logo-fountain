# Logo Fountain — Entitlement Calibration v1.0

**Date:** 2026-03-01

Inputs (provided):
- 1 initial concept ≈ **5 hours**
- 1 revision round ≈ **2 hours**

Current package entitlements (from site.json snippet):
- Essential: **2 concepts**, **2 revisions** — £299
- Professional: **4 concepts**, **3 revisions** — £499
- Complete: **4 concepts**, **10 revisions** — £749

---

## 1) Workload math (expected delivery hours)
Assuming the client uses the full allowance.

### Essential
- Concepts: 2 × 5h = 10h
- Revisions: 2 × 2h = 4h
- **Total = 14h**
- Effective revenue/hour = 299 / 14 = **£21.36/h**

### Professional
- Concepts: 4 × 5h = 20h
- Revisions: 3 × 2h = 6h
- **Total = 26h**
- Effective revenue/hour = 499 / 26 = **£19.19/h**

### Complete
- Concepts: 4 × 5h = 20h
- Revisions: 10 × 2h = 20h
- **Total = 40h**
- Effective revenue/hour = 749 / 40 = **£18.73/h**

**Conclusion:** As currently configured, higher tiers become **less profitable per hour** and Complete can easily become a 1-week+ effort.

---

## 2) Recommendation: rebalance entitlements or rebalance pricing
You have three levers:
1) Reduce included **concepts** on higher tiers
2) Reduce included **revisions** on higher tiers
3) Increase price (or enforce add-ons earlier)

Given you want premium tone but realistic workload, the simplest is to **reduce included work** and sell add-ons.

### Recommended entitlement bands (realistic for solo operator)
These are designed to keep each tier within ~10–20h expected max, and push heavy iteration into paid add-ons.

#### Option A (minimal changes)
- Essential: 2 concepts, 2 revisions (keep)
- Professional: **3 concepts**, **3 revisions** (reduce concepts from 4→3)
- Complete: **4 concepts**, **6 revisions** (reduce revisions 10→6)

Hours:
- Essential: 14h (£21/h)
- Professional: 3*5 + 3*2 = 21h (£23.8/h)
- Complete: 4*5 + 6*2 = 32h (£23.4/h)

#### Option B (more aggressive; best margin protection)
- Essential: 2 concepts, 2 revisions
- Professional: **3 concepts**, **2 revisions**
- Complete: **3 concepts**, **5 revisions**

Hours:
- Essential: 14h (£21/h)
- Professional: 19h (£26.3/h)
- Complete: 25h (£30/h)

This option better aligns “Complete” with premium deliverables rather than infinite iteration.

---

## 3) Add-on strategy (aligns to your JSON)
You already have **Extra revision £49**.

At 2h per revision, £49 is **£24.50/h** before overhead. That’s workable.

Recommend:
- Make “extra revision” a pack of **1** (as you have), but consider a **3-pack** at a slight discount to reduce checkout friction.
- When revisions remaining hits 0, UI offers:
  - Approve
  - Buy extra revision
  - Message admin

---

## 4) Upgrade strategy
Upgrades:
- Essential→Professional (£180)
- Professional→Complete (£225)

Define policy:
- If user upgrades mid-project, entitlements become the **max** of the new tier (or add the delta), and deliverables expand.

Recommendation:
- Treat upgrades as “move to tier” (set entitlements to tier defaults), not “stack”.

---

## 5) Decision needed
Pick one:
- **Keep current entitlements** and accept lower effective hourly rate.
- Choose Option A or Option B (or provide your own).

If you pick Option A/B, I’ll update PRD and the package JSON assumptions accordingly (we’ll also need to update the marketing copy + Stripe price IDs mapping to reflect any tier changes).
