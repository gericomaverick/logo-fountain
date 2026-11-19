// Decided deviation DV-2 (additive upgrade), story 0.8e. Black box: signed webhooks for a package, an add-on and
// an upgrade; the limits read back through the admin snapshot. FAILS on Next (expected-next-failures.txt): the
// upgrade SETS the target tier's limits, so the bought add-on revision is lost (lib/checkout-fulfillment.ts,
// pinned as current behaviour by contract/webhook-upsell.spec.ts).
import { expect, test } from "../../fixtures";
import { adminClient, adminSnapshot, buildEvent, buyPackage, deliverEvent, loadStripeFixture } from "../../adapters/stripe";

test.use({ db: { shared: "awaiting-brief" } }); // fresh buyer and project per test: only adds data

async function usage(projectId: string) {
  const s = await adminSnapshot(await adminClient(), projectId);
  const pick = (k: "concepts" | "revisions") => ({ limit: s.entitlementUsage[k].limit, consumed: s.entitlementUsage[k].consumed, reserved: s.entitlementUsage[k].reserved });
  return { packageCode: s.packageCode, concepts: pick("concepts"), revisions: pick("revisions") };
}

test("DV-2/K-09 an upgrade after a bought add-on keeps it: Essential 1/1, add-on 1/2, upgrade to Professional 2/3 @deviation @api @upsell @webhook @entitlements", async () => {
  const base = await buyPackage("package-essential-paid");
  const before = await usage(base.projectId);
  expect({ packageCode: before.packageCode, concepts: before.concepts.limit, revisions: before.revisions.limit }).toEqual({ packageCode: "essential", concepts: 1, revisions: 1 });

  const addon = await loadStripeFixture("upsell-addon-extra-revision", { run: base.run, vars: { projectId: base.projectId } });
  expect((await deliverEvent(buildEvent("checkout.session.completed", addon.session))).body).toMatchObject({ fulfilled: true, deduped: false });
  const afterAddon = await usage(base.projectId);
  expect({ concepts: afterAddon.concepts.limit, revisions: afterAddon.revisions.limit }).toEqual({ concepts: 1, revisions: 2 });

  const upgrade = await loadStripeFixture("upsell-upgrade-essential-professional", { run: base.run, vars: { projectId: base.projectId } });
  expect((await deliverEvent(buildEvent("checkout.session.completed", upgrade.session))).body).toMatchObject({ fulfilled: true, deduped: false });
  const after = await usage(base.projectId);
  // new limit = current + (target tier - current tier) per key; consumed and reserved untouched.
  expect(after).toEqual({
    packageCode: "professional",
    concepts: { ...afterAddon.concepts, limit: 2 },
    revisions: { ...afterAddon.revisions, limit: 3 },
  });
});
