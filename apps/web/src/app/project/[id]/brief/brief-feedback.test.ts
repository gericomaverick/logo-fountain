import { describe, expect, it } from "vitest";
import { briefSections } from "@/lib/brief";
import { fieldFeedback, savePresentation, canPinBriefNavigation, type SaveRecord } from "./brief-feedback";

const required = briefSections[0].fields[0];
const optional = briefSections[0].fields[1];
describe("field feedback", () => {
  it("keeps untouched and blank optional answers neutral", () => {
    expect(fieldFeedback(required, "Name", false, false).answered).toBe(false);
    expect(fieldFeedback(optional, " \n ", true, true)).toEqual({ answered: false, error: undefined, lengthNote: undefined });
  });
  it("exposes required errors after blur or an attempt and removes them on correction", () => {
    expect(fieldFeedback(required, " \n", false, false).error).toBeUndefined();
    expect(fieldFeedback(required, " \n", true, false).error).toBe("Brand name is required.");
    expect(fieldFeedback(required, " \n", false, true).error).toBe("Brand name is required.");
    expect(fieldFeedback(required, "Name", true, true)).toEqual({ answered: true, error: undefined, lengthNote: undefined });
  });
  it("does not certify a serialized choice-plus-note exceeding the server limit", () => {
    const field = briefSections[2].fields.find((field) => field.key === "brandPersonality")!;
    const feedback = fieldFeedback(field, "Modern — " + "a".repeat(field.maxLength!), true, false);
    expect(feedback.answered).toBe(false);
    expect(feedback.lengthNote).toContain(`${field.maxLength} characters`);
  });
});
describe("snapshot-aware save presentation", () => {
  const saved: SaveRecord = { snapshot: "old", phase: "saved", local: true, updatedAt: "2026-10-18T10:20:00Z" };
  it("never calls new edits saved using an old acknowledgement", () => {
    expect(savePresentation("new", true, saved)).toEqual({ kind: "pending", text: "Changes pending" });
    expect(savePresentation("old", true, saved).text).toContain("Saved to your account at");
    expect(savePresentation("old", true, saved, true)).toEqual({ kind: "warning", text: "Account copy shortened — see field notes" });
  });
  it("distinguishes loading, saving, acknowledged, tab-only and no retention", () => {
    expect(savePresentation("old", false, saved).text).toContain("Loading");
    expect(savePresentation("old", true, { ...saved, phase: "saving" }).text).toContain("Saving");
    expect(savePresentation("old", true, { ...saved, updatedAt: "invalid" }).text).toBe("Account save acknowledged");
    expect(savePresentation("old", true, { ...saved, phase: "failed" }).text).toContain("this tab only");
    expect(savePresentation("old", true, { ...saved, phase: "failed", local: false }).text).toContain("Not saved");
  });
  it("does not apply old in-flight or failed status to a new snapshot", () => {
    for (const phase of ["saving", "failed"] as const) expect(savePresentation("new", true, { ...saved, phase }).kind).toBe("pending");
  });
});
describe("conservative persistent-navigation eligibility", () => {
  const phone = { width: 390, height: 844, viewportHeight: 844, viewportWidth: 390, offsetTop: 0, scale: 1, editing: false, modal: false, barHeight: 110 };
  it("permits ordinary/narrow phones and desktop", () => {
    expect(canPinBriefNavigation(phone)).toBe(true);
    expect(canPinBriefNavigation({ ...phone, width: 320, viewportWidth: 320 })).toBe(true);
    expect(canPinBriefNavigation({ ...phone, width: 1600, viewportWidth: 1600 })).toBe(true);
  });
  it.each([{ editing: true }, { modal: true }, { height: 500, viewportHeight: 500 }, { viewportHeight: 500 }, { scale: 2 }, { offsetTop: 100 }, { viewportWidth: 300 }, { barHeight: 220 }])("falls back to flow for constraint %j", (constraint) => {
    expect(canPinBriefNavigation({ ...phone, ...constraint })).toBe(false);
  });
});
