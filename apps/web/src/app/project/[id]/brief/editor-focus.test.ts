import { describe, expect, it, vi } from "vitest";

import { scrollAndFocusEditor } from "./editor-focus";

describe("scrollAndFocusEditor", () => {
  it("scrolls the editor into view and focuses the heading", () => {
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    const scheduleFocus = vi.fn((cb: () => void) => cb());

    scrollAndFocusEditor(
      { scrollIntoView } as unknown as HTMLElement,
      { focus } as unknown as HTMLElement,
      scheduleFocus,
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(scheduleFocus).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
  });

  it("still schedules focus when editor is missing", () => {
    const focus = vi.fn();

    scrollAndFocusEditor(null, { focus } as unknown as HTMLElement);

    expect(focus).toHaveBeenCalledOnce();
  });
});
