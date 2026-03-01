# Logo Fountain — Upgrade/Add-on Entitlement Deltas v1.0

**Date:** 2026-03-01

Policy: **additive-from-current**. Keep `consumed` as-is. Increase `limit` by delta needed to reach target tier (Option B).

## Tier limits (Option B)
- Essential: concepts=2, revisions=2
- Professional: concepts=3, revisions=2
- Complete: concepts=3, revisions=5

## Deltas
### Essential → Professional
- concepts: +1
- revisions: +0

### Professional → Complete
- concepts: +0
- revisions: +3

### Extra revision add-on
- revisions: +1

## Notes
- If a user has already purchased extra revisions, upgrade should not reduce limits; only increase where below target.
- If consumed > new limit (shouldn’t happen with additive), do not block; simply maintain consumed and require add-on/override for further usage.
