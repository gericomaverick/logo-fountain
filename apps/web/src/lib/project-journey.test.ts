import { describe, expect, it } from "vitest";

import { getProjectJourney, shouldShowProjectWelcome } from "./project-journey";

const states = (status: string | null | undefined) => getProjectJourney(status).map((step) => step.state);

describe("getProjectJourney", () => {
  it("starts a paid project on the brief", () => {
    expect(states("AWAITING_BRIEF")).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
  });

  it("moves to design once the brief is in", () => {
    expect(states("BRIEF_SUBMITTED")).toEqual(["done", "current", "upcoming", "upcoming"]);
    expect(states("IN_DESIGN")).toEqual(["done", "current", "upcoming", "upcoming"]);
  });

  it("treats every feedback stage as the same step to the customer", () => {
    for (const status of ["CONCEPTS_READY", "REVISIONS_IN_PROGRESS", "AWAITING_APPROVAL"]) {
      expect(states(status), status).toEqual(["done", "done", "current", "upcoming"]);
    }
  });

  it("ends on delivery, with everything behind it done", () => {
    expect(states("APPROVED")).toEqual(["done", "done", "done", "current"]);
    expect(states("DELIVERED")).toEqual(["done", "done", "done", "done"]);
  });

  it("rests at the start for a status it does not know", () => {
    expect(states("ON_HOLD")).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
    expect(states(null)).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
    expect(states(undefined)).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
  });

  it("always has exactly four steps, in order", () => {
    expect(getProjectJourney("IN_DESIGN").map((step) => step.id)).toEqual(["brief", "concepts", "revisions", "delivery"]);
  });

  it("never shows two current steps", () => {
    for (const status of ["AWAITING_BRIEF", "IN_DESIGN", "CONCEPTS_READY", "APPROVED", "DELIVERED", "CANCELLED"]) {
      expect(states(status).filter((state) => state === "current").length, status).toBeLessThanOrEqual(1);
    }
  });
});

describe("shouldShowProjectWelcome", () => {
  it("welcomes someone who has paid and not yet written a brief", () => {
    expect(shouldShowProjectWelcome("AWAITING_BRIEF", false)).toBe(true);
  });

  it("steps aside once a brief has been submitted", () => {
    expect(shouldShowProjectWelcome("AWAITING_BRIEF", true)).toBe(false);
    expect(shouldShowProjectWelcome("IN_DESIGN", false)).toBe(false);
  });

  it("does not welcome an unknown or missing status", () => {
    expect(shouldShowProjectWelcome(null, false)).toBe(false);
    expect(shouldShowProjectWelcome(undefined, false)).toBe(false);
  });
});
