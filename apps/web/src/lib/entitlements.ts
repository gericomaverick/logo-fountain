export type EntitlementRow = {
  key: string;
  limitInt: number | null;
  consumedInt: number;
  reservedInt?: number | null;
};

export type EntitlementUsage = {
  concepts: { limit: number; consumed: number; reserved: number; remaining: number; unlimited?: boolean; configured?: boolean };
  revisions: { limit: number; consumed: number; reserved: number; remaining: number; unlimited?: boolean; configured?: boolean };
};

const PACKAGE_DEFAULTS: Record<string, { concepts: number; revisions: number }> = {
  essential: { concepts: 1, revisions: 1 },
  professional: { concepts: 2, revisions: 2 },
  complete: { concepts: 3, revisions: 3 },
};

export function computeEntitlementUsage(entitlements: EntitlementRow[], packageCode: string): EntitlementUsage {
  const usage: EntitlementUsage = {
    concepts: { limit: 0, consumed: 0, reserved: 0, remaining: 0, configured: false },
    revisions: { limit: 0, consumed: 0, reserved: 0, remaining: 0, configured: false },
  };

  for (const entitlement of entitlements) {
    const unlimited = entitlement.limitInt === null;
    const configured = true;
    const limit = Math.max(entitlement.limitInt ?? 0, 0);
    const consumed = Math.max(entitlement.consumedInt ?? 0, 0);
    const reserved = Math.max(entitlement.reservedInt ?? 0, 0);
    const remaining = Math.max(limit - consumed - reserved, 0);

    if (entitlement.key === "concepts") usage.concepts = { limit, consumed, reserved, remaining, unlimited, configured };
    if (entitlement.key === "revisions") usage.revisions = { limit, consumed, reserved, remaining, unlimited, configured };
  }

  if (!entitlements.some(e => e.key === "concepts" || e.key === "revisions")) {
    const defaults = PACKAGE_DEFAULTS[packageCode] ?? null;
    if (defaults) {
      usage.concepts = { limit: defaults.concepts, consumed: 0, reserved: 0, remaining: defaults.concepts, configured: false };
      usage.revisions = { limit: defaults.revisions, consumed: 0, reserved: 0, remaining: defaults.revisions, configured: false };
    }
  }

  return usage;
}
