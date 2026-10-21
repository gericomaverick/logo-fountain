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
vi.mock("@/lib/stripe", () => ({ PRICE_ID_TO_PACKAGE: { price_local_fixture: "essential" }, stripe: { checkout: { sessions: { listLineItems: async () => ({ data: [{ price: { id: "price_local_fixture" } }] }) } } } }));

/**
 * Which stage to leave the extra project at, and the field in the private
 * handoff file that records the one already made. That field's presence is how
 * a second run of the same stage is refused, so one stage per local cluster.
 */
const STAGES = {
  "awaiting-brief": { status: "AWAITING_BRIEF", handoffKey: "awaitingBriefProjectId" },
  "brief-submitted": { status: "BRIEF_SUBMITTED", handoffKey: "briefSubmittedProjectId" },
} as const;

const requested = process.env.PG_LOCAL_DEV_EXTRA_PROJECT ?? "";
const stage = Object.hasOwn(STAGES, requested) ? STAGES[requested as keyof typeof STAGES] : null;
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
    if (handoff.customer?.[stage!.handoffKey]) throw new Error(`A ${requested} fixture project already exists locally`);

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

    // The same synthetic paid-session path the first seed uses: mocked price
    // lookup, no network, no charge, no Stripe webhook.
    const paid = await fulfillCheckoutSession({ id: "cs_local_" + randomUUID(), payment_status: "paid",
      customer_details: { email: customerEmail, name: "Local Test Customer" }, amount_total: 4900,
      currency: "gbp", payment_intent: "pi_local_" + randomUUID() } as never);
    const customer = await ensureAccessProvisioning(paid.clientId, customerEmail);
    expect(customer.userId).toBe(existing.id);
    expect(customer.existed).toBe(true);
    expect(await db.clientMembership.count({ where: { clientId: paid.clientId, userId: customer.userId } })).toBe(1);
    expect(await db.projectEntitlement.count({ where: { projectId: paid.projectId } })).toBe(2);

    // Fulfillment already leaves a project at AWAITING_BRIEF, which is a stage
    // in its own right: the onboarding form can be walked from there.
    if (stage!.status === "BRIEF_SUBMITTED") {
      // Submitted through the same validation and state machine the route uses,
      // so the stored row is the one a real submission would have written.
      const parsed = validateBriefSubmission(ANSWERS);
      if (!parsed.ok) throw new Error(`Fixture brief is incomplete: ${parsed.missing.join(", ")}`);
      const transition = applyTransition("AWAITING_BRIEF", "BRIEF_SUBMITTED");
      if (!transition.ok) throw new Error("BRIEF_SUBMITTED is no longer reachable from AWAITING_BRIEF");

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

    const project = await db.project.findUniqueOrThrow({
      where: { id: paid.projectId },
      select: { status: true, briefs: { select: { version: true, answers: true } }, messages: { select: { kind: true } } },
    });
    expect(project.status).toBe(stage!.status);
    if (stage!.status === "BRIEF_SUBMITTED") {
      expect(project.briefs).toHaveLength(1);
      expect((project.briefs[0]?.answers as { brandName?: string }).brandName).toBe(ANSWERS.brandName);
      expect(project.messages.some((message) => message.kind === "system")).toBe(true);
    } else {
      // Nothing written yet: the form is the only thing that should fill this.
      expect(project.briefs).toHaveLength(0);
    }

    // The id goes in the private handoff file, never to a terminal or a report.
    const temp = file + ".extra";
    await writeFile(temp, JSON.stringify({ ...handoff, customer: { ...handoff.customer, [stage!.handoffKey]: paid.projectId } }), { flag: "wx", mode: 0o600 });
    await rename(temp, file);
    if (((await stat(file)).mode & 0o777) !== 0o600) throw new Error("Private credential file required");
  });
});
