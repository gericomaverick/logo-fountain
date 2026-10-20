import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { briefSections } from "@/lib/brief";
import { BriefFieldInput } from "./brief-field-input";

function render(index: number, key: string, props = {}) {
  const field = briefSections[index].fields.find((field) => field.key === key)!;
  return renderToStaticMarkup(createElement(BriefFieldInput, { field, value: "", onChange: () => {}, ...props }));
}
describe("brief field associations", () => {
  it("associates inline error and help without creating redundant live alerts", () => {
    const html = render(0, "brandName", { error: "Brand name is required." });
    expect(html).toContain('aria-describedby="brief-brandName-help brief-brandName-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('id="brief-brandName-error"');
    expect(html).not.toContain('role="alert"');
  });
  it("names a choice fieldset and describes buttons without requiring optional notes", () => {
    const html = render(2, "brandPersonality", { error: "An answer is required." });
    expect(html).toContain("<fieldset");
    expect(html).toContain('<legend id="brief-brandPersonality-label"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-describedby="brief-brandPersonality-options brief-brandPersonality-error"');
    expect(html).not.toContain('required=""');
  });
  it("adds a non-live answered marker only when requested", () => {
    expect(render(0, "brandName")).not.toContain("Answered");
    expect(render(0, "brandName", { answered: true })).toContain('class="sr-only">Answered');
    expect(render(0, "brandName", { answered: true, error: "Required" })).not.toContain("Answered");
  });
});
