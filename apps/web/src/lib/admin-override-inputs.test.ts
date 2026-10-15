import { describe, expect, it, vi } from "vitest";
import { refreshOverrideInputs } from "./admin-override-inputs";

describe("override polling input preservation", () => {
  it("uses current per-field dirty state even for a callback captured before editing", () => {
    const dirty = { current: { concepts: false, revisions: false } };
    const concepts = vi.fn();
    const revisions = vi.fn();
    const poll = () => refreshOverrideInputs(dirty, { concepts: { limit: 3 }, revisions: { limit: 2 } }, concepts, revisions);
    dirty.current.concepts = true;
    poll();
    expect(concepts).not.toHaveBeenCalled();
    expect(revisions).toHaveBeenLastCalledWith("2");
    dirty.current.revisions = true;
    revisions.mockClear();
    poll();
    expect(concepts).not.toHaveBeenCalled();
    expect(revisions).not.toHaveBeenCalled();
    dirty.current = { concepts: false, revisions: false };
    poll();
    expect(concepts).toHaveBeenLastCalledWith("3");
    expect(revisions).toHaveBeenLastCalledWith("2");
  });

  it("refreshes untouched unlimited and missing values as blank", () => {
    const concepts = vi.fn();
    const revisions = vi.fn();
    refreshOverrideInputs({ current: { concepts: false, revisions: false } }, { concepts: { unlimited: true, limit: 0 } }, concepts, revisions);
    expect(concepts).toHaveBeenCalledWith("");
    expect(revisions).toHaveBeenCalledWith("");
  });
});
