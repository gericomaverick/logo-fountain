type ConceptEntitlementTx = {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  projectEntitlement: {
    findFirst: (args: {
      where: { projectId: string; key: string };
      select: { id: true; limitInt: true; consumedInt: true; reservedInt: true };
    }) => Promise<{
      id: string;
      limitInt: number | null;
      consumedInt: number | null;
      reservedInt: number | null;
    } | null>;
  };
};

export class ConceptEntitlementError extends Error {
  constructor(public readonly code: "CONCEPTS_ENTITLEMENT_MISSING" | "CONCEPT_ENTITLEMENT_EXHAUSTED") {
    super(code);
  }
}

/**
 * Atomically consumes one concept publication. The conditional UPDATE is the
 * concurrency boundary: a finite final slot can only be claimed once, while a
 * null limit is unlimited. Call this in the same transaction as the first
 * draft->published transition or concept creation.
 */
export async function consumeConceptEntitlement(tx: ConceptEntitlementTx, projectId: string) {
  const changed = await tx.$executeRaw`
    UPDATE "ProjectEntitlement"
    SET "consumedInt" = COALESCE("consumedInt", 0) + 1,
        "updatedAt" = NOW()
    WHERE "projectId" = ${projectId}::uuid
      AND "key" = 'concepts'
      AND (
        "limitInt" IS NULL
        OR COALESCE("consumedInt", 0) + COALESCE("reservedInt", 0) < "limitInt"
      )
  `;

  if (changed === 1) {
    return tx.projectEntitlement.findFirst({
      where: { projectId, key: "concepts" },
      select: { id: true, limitInt: true, consumedInt: true, reservedInt: true },
    });
  }

  const entitlement = await tx.projectEntitlement.findFirst({
    where: { projectId, key: "concepts" },
    select: { id: true, limitInt: true, consumedInt: true, reservedInt: true },
  });
  throw new ConceptEntitlementError(entitlement ? "CONCEPT_ENTITLEMENT_EXHAUSTED" : "CONCEPTS_ENTITLEMENT_MISSING");
}
