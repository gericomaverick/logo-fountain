import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function load(relativePath: string) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("admin concept feedback UI regressions", () => {
  it("does not expose mark-as-read controls in admin concept surfaces", () => {
    const files = [
      "src/app/admin/projects/[id]/concepts/page.tsx",
      "src/app/admin/projects/[id]/page.tsx",
      "src/app/admin/projects/[id]/messages/page.tsx",
    ];

    for (const file of files) {
      const source = load(file);
      expect(source).not.toMatch(/mark\s+as\s+read/i);
      expect(source).not.toMatch(/mark-read/i);
    }
  });

  it("does not post read-state updates from admin concept-related pages", () => {
    const files = [
      "src/app/admin/projects/[id]/concepts/page.tsx",
      "src/app/admin/projects/[id]/messages/page.tsx",
    ];

    for (const file of files) {
      const source = load(file);
      expect(source).not.toContain("/api/projects/${projectId}/read-state");
    }
  });
});
