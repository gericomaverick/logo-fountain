import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BriefProgress } from "./brief-progress";

const labels = ["Foundations", "Audience", "Creative", "Practical", "Review"];
describe("horizontal bottom timeline semantics", () => {
  it("offers only previous-step destinations, not current/future navigation", () => {
    const html = renderToStaticMarkup(createElement(BriefProgress, { labels, activeIndex: 2, onSelect: () => {} }));
    expect(html.match(/<button /g)).toHaveLength(2);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1); // One timeline shared by all viewport sizes.
    expect(html).toContain("Return to ");
    expect(html.match(/<nav /g)).toHaveLength(1);
    expect(html.match(/<ol /g)).toHaveLength(1);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('aria-valuetext="Step 3 of 5: Creative"');
    expect(html).toContain("width:50%");
    expect(html).not.toContain("lg:block");
    expect(html).not.toContain("bg-panel"); // Markers/labels blend into the tinted bottom surface.
    expect(html).toContain("hover:bg-surface-2");
    expect(html).not.toMatch(/complete|valid|saved/i);
  });
  it("leaves the initial timeline non-interactive without certifying blank answers", () => {
    const html = renderToStaticMarkup(createElement(BriefProgress, { labels, activeIndex: 0, onSelect: () => {} }));
    expect(html).not.toContain("<button");
    expect(html).toContain("Foundations (current step)");
  });
});
