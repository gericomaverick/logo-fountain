import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BriefProgress } from "./brief-progress";

const labels = ["Foundations", "Audience", "Creative", "Practical", "Review"];
describe("brief timeline semantics", () => {
  it("offers only previous-step destinations, not current/future navigation", () => {
    const html = renderToStaticMarkup(createElement(BriefProgress, { labels, activeIndex: 2, onSelect: () => {} }));
    expect(html.match(/<button /g)).toHaveLength(2);
    expect(html.match(/aria-current="step"/g)).toHaveLength(2); // One in each CSS-responsive presentation.
    expect(html).toContain("Return to ");
    expect(html).not.toMatch(/complete|valid|saved/i);
  });
  it("leaves the initial timeline non-interactive without certifying blank answers", () => {
    const html = renderToStaticMarkup(createElement(BriefProgress, { labels, activeIndex: 0, onSelect: () => {} }));
    expect(html).not.toContain("<button");
    expect(html).toContain("Foundations (current step)");
  });
});
