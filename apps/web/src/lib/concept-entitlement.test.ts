import { describe, expect, it, vi } from "vitest";
import { ConceptEntitlementError, consumeConceptEntitlement } from "./concept-entitlement";

function transaction(changed: number, row: { id: string; limitInt: number | null; consumedInt: number; reservedInt: number } | null) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(changed),
    projectEntitlement: { findFirst: vi.fn().mockResolvedValue(row) },
  };
}

describe("consumeConceptEntitlement", () => {
  it("accepts a finite available slot and returns the atomic post-update value", async () => {
    const tx = transaction(1, { id: "e1", limitInt: 2, consumedInt: 2, reservedInt: 0 });
    await expect(consumeConceptEntitlement(tx, "p1")).resolves.toMatchObject({ consumedInt: 2 });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("accepts an unlimited entitlement", async () => {
    const tx = transaction(1, { id: "e1", limitInt: null, consumedInt: 101, reservedInt: 0 });
    await expect(consumeConceptEntitlement(tx, "p1")).resolves.toMatchObject({ limitInt: null, consumedInt: 101 });
  });

  it("distinguishes missing from exhausted", async () => {
    await expect(consumeConceptEntitlement(transaction(0, null), "p1"))
      .rejects.toEqual(expect.objectContaining({ code: "CONCEPTS_ENTITLEMENT_MISSING" }));
    await expect(consumeConceptEntitlement(transaction(0, { id: "e1", limitInt: 1, consumedInt: 1, reservedInt: 0 }), "p1"))
      .rejects.toEqual(expect.objectContaining({ code: "CONCEPT_ENTITLEMENT_EXHAUSTED" }));
  });

  it("lets only one concurrent claimant succeed when the database reports one conditional update", async () => {
    const winner = transaction(1, { id: "e1", limitInt: 1, consumedInt: 1, reservedInt: 0 });
    const loser = transaction(0, { id: "e1", limitInt: 1, consumedInt: 1, reservedInt: 0 });
    const outcomes = await Promise.allSettled([
      consumeConceptEntitlement(winner, "p1"),
      consumeConceptEntitlement(loser, "p1"),
    ]);
    expect(outcomes.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect((outcomes[1] as PromiseRejectedResult).reason).toBeInstanceOf(ConceptEntitlementError);
  });
});
