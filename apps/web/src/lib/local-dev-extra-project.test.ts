import { randomUUID } from "node:crypto";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { afterAll, describe, expect, it, vi } from "vitest";

import { readPrivateLocalIdentities, requirePrivateLocalCluster } from "./local-dev-fixture-guard";

// A manual, disposable-cluster-only fixture: an EXTRA project for the customer
// the first seed already created, at a stage the owner wants to look at without
// driving the app there by hand. It creates no identity and sets no password,
// so no mailbox proof is needed — and the transport is stubbed to throw rather
// than quietly capture a link.
vi.mock("@/lib/auth/mail", () => ({ sendAuthEmail: async () => { throw new Error("This fixture must neither send nor capture mail"); } }));
// The package the helper asked for, through the price lookup fulfillment uses.
vi.mock("@/lib/stripe", () => ({
  PRICE_ID_TO_PACKAGE: { price_local_fixture: process.env.PG_LOCAL_DEV_PACKAGE ?? "essential" },
  stripe: { checkout: { sessions: { listLineItems: async () => ({ data: [{ price: { id: "price_local_fixture" } }] }) } } },
}));

/** The stages a fixture project can be left at, in the state machine's words. */
const STAGES = {
  "awaiting-brief": "AWAITING_BRIEF",
  "brief-submitted": "BRIEF_SUBMITTED",
  // Concepts sent, so allowances have been drawn down and there is usage to see.
  "concepts-ready": "CONCEPTS_READY",
} as const;

/** What each package was sold for, in pence, so the order is not a round lie. */
const PACKAGE_PRICE: Record<string, number> = { essential: 34900, professional: 79500, complete: 149500 };

const requested = process.env.PG_LOCAL_DEV_EXTRA_PROJECT ?? "";
const stage = Object.hasOwn(STAGES, requested) ? STAGES[requested as keyof typeof STAGES] : null;
const packageCode = process.env.PG_LOCAL_DEV_PACKAGE ?? "essential";
const count = (name: string) => Math.max(Number.parseInt(process.env[name] ?? "0", 10) || 0, 0);
const usage = {
  concepts: count("PG_LOCAL_DEV_CONCEPTS_USED"),
  revisionsUsed: count("PG_LOCAL_DEV_REVISIONS_USED"),
  revisionsPending: count("PG_LOCAL_DEV_REVISIONS_PENDING"),
};
const enabled = stage !== null;
// Fail CLOSED before any fixture import or Prisma write.
if (enabled) await requirePrivateLocalCluster();

/**
 * A complete brief, as someone who took it seriously would leave it: every
 * question answered, because a half-filled fixture makes the designer's view of
 * a submitted brief look broken rather than finished.
 */
const ANSWERS = {
  brandName: "Harrow & Finch",
  tagline: "Small-batch coffee, roasted in Leeds",
  industry: "Speciality coffee roastery",
  offerSummary:
    "We roast single-origin coffee in small batches and sell it through our own shop, a subscription, and about thirty independent cafes across Yorkshire. Wholesale is roughly two thirds of the business and growing faster than retail.",
  audiencePrimary:
    "Cafe owners and baristas who choose a roaster on taste and reliability, and who will put our bags on a shelf customers can see.",
  audienceSecondary: "Home subscribers in their thirties and forties who already own a grinder and know what they like.",
  businessGoals:
    "Look like an established roaster rather than a side project, so wholesale conversations start from credibility. The mark has to hold up on a 1kg wholesale bag and on a shop sign.",
  brandPersonality: "Confident, warm, a little old-fashioned. Not rustic, not corporate, and definitely not another minimal sans-serif wordmark.",
  styleDirection:
    "Leaning towards a wordmark with real character in the letterforms, possibly with a small emblem that can stand alone on cups and stamps. Happy to be shown something more illustrative if it still works small.",
  colorPreferences: "Deep green and a warm off-white, with a copper or brass accent. Nothing bright. One ink printing needs to work too.",
  mustInclude: "The ampersand matters to us — both family names stay. An emblem that works on its own would be useful.",
  avoidanceNotes: "No coffee beans, no cups, no steam swooshes, no mountains. Nothing that reads as a 2015 hipster badge.",
  usageContexts:
    "Shop signage, 250g and 1kg bags, takeaway cups, a rubber stamp, van livery, Instagram, and the website header.",
  deliverablesContext: "Printer needs vector files for the bags; the sign maker wants a single-colour version.",
  competitors: "We like how North Star and Assembly look without wanting to be mistaken for either.",
  additionalNotes: "The shop opens in March, so signage artwork is the first thing we need.",
};

/** Designer notes on the concepts, so the gallery is not a row of blanks. */
const CONCEPT_NOTES = [
  "Wordmark with the ampersand drawn as the fountain. Single-colour version included.",
  "Emblem-led route — the monogram works at stamp size, which the bags need.",
  "A quieter take on the first, with the letterforms opened up for signage.",
];

/** What a customer actually writes when asking for a change. */
const REVISION_BODIES = [
  "Love the direction. Could the ampersand be a touch heavier? It disappears on the 250g bag at actual size.",
  "Second round looks great. One thing: the green feels a little cold next to the copper — warmer?",
  "Nearly there. Can we see the emblem on its own, centred, for the stamp?",
];

describe.skipIf(!enabled)(`local-only extra project at the ${requested} stage`, () => {
  let db: typeof import("@/lib/prisma").prisma;
  afterAll(async () => { await db?.$disconnect(); });

  it("attaches a paid project at the requested stage to the seeded customer", async () => {
    const file = process.env.LOCAL_DEV_SECRETS_FILE!;
    if (((await stat(file)).mode & 0o777) !== 0o600) throw new Error("Private credential file required");
    const handoff = JSON.parse(await readFile(file, "utf8"));
    // The first seed must have finished: this fixture extends that customer and
    // must never be the thing that creates one.
    if (handoff.status !== "ready") throw new Error("Run seed to completion first");
    // One fixture per distinct shape. Repeating a command is almost always a
    // mistake rather than a request for an identical second project, but a
    // different package or a different usage is a different thing to look at.
    const shape = `${requested}:${packageCode}:${usage.concepts}:${usage.revisionsUsed}:${usage.revisionsPending}`;
    const made: Array<{ shape: string; projectId: string }> = Array.isArray(handoff.customer?.fixtureProjects) ? handoff.customer.fixtureProjects : [];
    const legacy: Record<string, string> = { "awaiting-brief": "awaitingBriefProjectId", "brief-submitted": "briefSubmittedProjectId" };
    const legacyKey = legacy[requested];
    if (made.some((entry) => entry.shape === shape)) throw new Error(`A ${requested} fixture project of this shape already exists locally`);
    if (legacyKey && handoff.customer?.[legacyKey] && packageCode === "essential" && usage.concepts === 0) {
      throw new Error(`A ${requested} fixture project already exists locally`);
    }

    db = (await import("@/lib/prisma")).prisma;
    const { customerEmail } = await readPrivateLocalIdentities();
    if (handoff.customer?.email !== customerEmail) throw new Error("Handoff file and identities file disagree on the local customer");
    const existing = await db.authUser.findUnique({ where: { email: customerEmail }, select: { id: true } });
    if (!existing) throw new Error("Seeded local customer not found");

    const { fulfillCheckoutSession, ensureAccessProvisioning } = await import("@/lib/checkout-fulfillment");
    const { validateBriefSubmission } = await import("@/lib/brief");
    const { applyTransition } = await import("@/lib/project-state-machine");
    const { createProjectSystemMessage } = await import("@/lib/system-messages");
    const { logAudit } = await import("@/lib/audit");

    /** Refuse to write a move the real app would not allow. */
    const step = (from: string, to: string) => {
      const transition = applyTransition(from, to);
      if (!transition.ok) throw new Error(`${to} is no longer reachable from ${from}`);
    };

    // The same synthetic paid-session path the first seed uses: mocked price
    // lookup, no network, no charge, no Stripe webhook.
    const paid = await fulfillCheckoutSession({ id: "cs_local_" + randomUUID(), payment_status: "paid",
      customer_details: { email: customerEmail, name: "Local Test Customer" }, amount_total: PACKAGE_PRICE[packageCode] ?? 34900,
      currency: "gbp", payment_intent: "pi_local_" + randomUUID() } as never);
    const customer = await ensureAccessProvisioning(paid.clientId, customerEmail);
    expect(customer.userId).toBe(existing.id);
    expect(customer.existed).toBe(true);
    expect(await db.clientMembership.count({ where: { clientId: paid.clientId, userId: customer.userId } })).toBe(1);
    expect(await db.projectEntitlement.count({ where: { projectId: paid.projectId } })).toBe(2);
    const sold = await db.project.findUniqueOrThrow({ where: { id: paid.projectId }, select: { packageCode: true } });
    expect(sold.packageCode).toBe(packageCode);

    // The package decides what can be drawn down, so an impossible fixture is
    // refused here rather than written and puzzled over later.
    const limits = Object.fromEntries((await db.projectEntitlement.findMany({
      where: { projectId: paid.projectId }, select: { key: true, limitInt: true },
    })).map((row) => [row.key, row.limitInt ?? 0]));
    if (usage.concepts > (limits.concepts ?? 0)) throw new Error(`The ${packageCode} package includes ${limits.concepts} concepts, not ${usage.concepts}`);
    if (usage.revisionsUsed + usage.revisionsPending > (limits.revisions ?? 0)) {
      throw new Error(`The ${packageCode} package includes ${limits.revisions} revisions, not ${usage.revisionsUsed + usage.revisionsPending}`);
    }

    // Fulfillment leaves a project at AWAITING_BRIEF, which is a stage in its
    // own right: the onboarding form can be walked from there. Every later
    // stage is reached the way the app reaches it.
    if (stage !== "AWAITING_BRIEF") {
      // Submitted through the same validation and state machine the route uses,
      // so the stored row is the one a real submission would have written.
      const parsed = validateBriefSubmission(ANSWERS);
      if (!parsed.ok) throw new Error(`Fixture brief is incomplete: ${parsed.missing.join(", ")}`);
      step("AWAITING_BRIEF", "BRIEF_SUBMITTED");

      await db.$transaction(async (tx) => {
        const brief = await tx.projectBrief.create({
          data: { projectId: paid.projectId, version: 1, answers: parsed.answers, createdBy: customer.userId },
          select: { id: true },
        });
        await tx.project.update({ where: { id: paid.projectId }, data: { status: "BRIEF_SUBMITTED" } });
        await createProjectSystemMessage(tx, {
          projectId: paid.projectId,
          fallbackUserId: customer.userId,
          body: "Brief received. Your designer will review and reply soon.",
        });
        await logAudit(tx, { projectId: paid.projectId, actorId: customer.userId, type: "brief_submitted", payload: { briefId: brief.id, version: 1, isResubmission: false } });
        await logAudit(tx, { projectId: paid.projectId, actorId: customer.userId, type: "state_changed", payload: { previousStatus: "AWAITING_BRIEF", nextStatus: "BRIEF_SUBMITTED" } });
      });
    }

    if (stage === "CONCEPTS_READY") {
      // Concepts are sent, so the concepts allowance is drawn down the way
      // publication draws it: reserved on the way out, consumed on delivery.
      // Revisions follow their own lifecycle — a request reserves one, the
      // revised concept consuming it — so `used` and `pending` are both real
      // positions in that cycle rather than numbers typed into a counter.
      const conceptsSent = Math.max(usage.concepts, 1);
      step("BRIEF_SUBMITTED", "IN_DESIGN");
      step("IN_DESIGN", "CONCEPTS_READY");

      await db.$transaction(async (tx) => {
        await tx.project.update({ where: { id: paid.projectId }, data: { status: "IN_DESIGN" } });
        await logAudit(tx, { projectId: paid.projectId, actorId: customer.userId, type: "state_changed", payload: { previousStatus: "BRIEF_SUBMITTED", nextStatus: "IN_DESIGN" } });

        const concepts = [];
        for (let number = 1; number <= conceptsSent; number += 1) {
          concepts.push(await tx.concept.create({
            data: { projectId: paid.projectId, number, status: "sent", notes: CONCEPT_NOTES[number - 1] ?? null },
            select: { id: true },
          }));
        }
        await tx.projectEntitlement.update({
          where: { projectId_key: { projectId: paid.projectId, key: "concepts" } },
          data: { consumedInt: conceptsSent },
        });

        // Delivered revisions first, then any still open, oldest first, so the
        // list reads as a history rather than a set.
        const firstConcept = concepts[0]!.id;
        for (let index = 0; index < usage.revisionsUsed; index += 1) {
          await tx.revisionRequest.create({
            data: { projectId: paid.projectId, conceptId: firstConcept, status: "delivered", requestedBy: customer.userId, body: REVISION_BODIES[index] ?? "Please have another go at this." },
          });
        }
        for (let index = 0; index < usage.revisionsPending; index += 1) {
          await tx.revisionRequest.create({
            data: { projectId: paid.projectId, conceptId: firstConcept, status: "requested", requestedBy: customer.userId, body: REVISION_BODIES[usage.revisionsUsed + index] ?? "Please have another go at this." },
          });
        }
        await tx.projectEntitlement.update({
          where: { projectId_key: { projectId: paid.projectId, key: "revisions" } },
          data: { consumedInt: usage.revisionsUsed, reservedInt: usage.revisionsPending },
        });

        // An open request is what puts a project back into revisions.
        const status = usage.revisionsPending > 0 ? "REVISIONS_IN_PROGRESS" : "CONCEPTS_READY";
        await tx.project.update({ where: { id: paid.projectId }, data: { status } });
        await createProjectSystemMessage(tx, {
          projectId: paid.projectId,
          fallbackUserId: customer.userId,
          body: conceptsSent === 1 ? "Your first concept is ready to review." : `Your ${conceptsSent} concepts are ready to review.`,
        });
        await logAudit(tx, { projectId: paid.projectId, actorId: customer.userId, type: "state_changed", payload: { previousStatus: "IN_DESIGN", nextStatus: status } });
      });
    }

    const after = await db.project.findUniqueOrThrow({
      where: { id: paid.projectId },
      select: {
        status: true,
        briefs: { select: { version: true, answers: true } },
        messages: { select: { kind: true } },
        concepts: { select: { number: true } },
        entitlements: { select: { key: true, limitInt: true, consumedInt: true, reservedInt: true } },
      },
    });

    if (stage === "AWAITING_BRIEF") {
      expect(after.status).toBe("AWAITING_BRIEF");
      // Nothing written yet: the form is the only thing that should fill this.
      expect(after.briefs).toHaveLength(0);
    } else {
      expect(after.briefs).toHaveLength(1);
      expect((after.briefs[0]?.answers as { brandName?: string }).brandName).toBe(ANSWERS.brandName);
      expect(after.messages.some((message) => message.kind === "system")).toBe(true);
    }

    if (stage === "BRIEF_SUBMITTED") expect(after.status).toBe("BRIEF_SUBMITTED");

    if (stage === "CONCEPTS_READY") {
      expect(after.status).toBe(usage.revisionsPending > 0 ? "REVISIONS_IN_PROGRESS" : "CONCEPTS_READY");
      expect(after.concepts).toHaveLength(Math.max(usage.concepts, 1));
      const revisions = after.entitlements.find((row) => row.key === "revisions")!;
      expect(revisions.consumedInt).toBe(usage.revisionsUsed);
      expect(revisions.reservedInt).toBe(usage.revisionsPending);
      // What the sidebar counter will read, which is the point of the fixture.
      expect((revisions.limitInt ?? 0) - revisions.consumedInt - revisions.reservedInt).toBeGreaterThanOrEqual(0);
      expect(await db.revisionRequest.count({ where: { projectId: paid.projectId } })).toBe(usage.revisionsUsed + usage.revisionsPending);
    }

    // The id goes in the private handoff file, never to a terminal or a report.
    const temp = file + ".extra";
    const customerRecord = { ...handoff.customer, fixtureProjects: [...made, { shape, projectId: paid.projectId }] };
    await writeFile(temp, JSON.stringify({ ...handoff, customer: customerRecord }), { flag: "wx", mode: 0o600 });
    await rename(temp, file);
    if (((await stat(file)).mode & 0o777) !== 0o600) throw new Error("Private credential file required");
  });
});
