export type EntitlementRow = {
  key: string;
  limitInt: number | null;
  consumedInt: number;
  reservedInt?: number | null;
};

export type EntitlementUsage = {
  concepts: { limit: number; consumed: number; reserved: number; remaining: number };
  revisions: { limit: number; consumed: number; reserved: number; remaining: number };
};

const PACKAGE_DEFAULTS: Record<string, { concepts: number; revisions: number }> = {
  essential: { concepts: 2, revisions: 2 },
  professional: { concepts: 3, revisions: 2 },
  complete: { concepts: 3, revisions: 5 },
};

export function computeEntitlementUsage(entitlements: EntitlementRow[], packageCode: string): EntitlementUsage {
  const usage: EntitlementUsage = {
    concepts: { limit: 0, consumed: 0, reserved: 0, remaining: 0 },
    revisions: { limit: 0, consumed: 0, reserved: 0, remaining: 0 },
  };

  for (const entitlement of entitlements) {
    const limit = Math.max(entitlement.limitInt ?? 0, 0);
    const consumed = Math.max(entitlement.consumedInt ?? 0, 0);
    const reserved = Math.max(entitlement.reservedInt ?? 0, 0);
    const remaining = Math.max(limit - consumed - reserved, 0);

    if (entitlement.key === "concepts") usage.concepts = { limit, consumed, reserved, remaining };
    if (entitlement.key === "revisions") usage.revisions = { limit, consumed, reserved, remaining };
  }

  if (usage.concepts.limit === 0 && usage.revisions.limit === 0) {
    const defaults = PACKAGE_DEFAULTS[packageCode] ?? null;
    if (defaults) {
      usage.concepts = { limit: defaults.concepts, consumed: 0, reserved: 0, remaining: defaults.concepts };
      usage.revisions = { limit: defaults.revisions, consumed: 0, reserved: 0, remaining: defaults.revisions };
    }
  }

  return usage;
}
