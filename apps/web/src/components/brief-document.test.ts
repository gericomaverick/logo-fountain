import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { BriefField, BriefSection } from "./brief-document";

describe("brief document primitives", () => {
  it("renders paper tone sections with subtle amber styling", () => {
    const html = renderToStaticMarkup(
      createElement(
        BriefSection,
        { title: "Brand context", description: "Core story", tone: "paper" },
        createElement("div", null, "Section body"),
      ),
    );

    expect(html).toContain("bg-amber-50/40");
    expect(html).toContain("border-amber-100");
    expect(html).toContain("Brand context");
  });

  it("keeps field values readable with wrapped document line width", () => {
    const html = renderToStaticMarkup(
      createElement(BriefField, { label: "Audience", value: "Design-led founders", compact: true }),
    );

    expect(html).toContain("max-w-[72ch]");
    expect(html).toContain("Design-led founders");
  });
});
