"use client";

// TEMPORARY: the proposed arrangement with a stand-in concept, so the two-up
// can be looked at without R2 or a seeded file. Removed before this merges.
import Link from "next/link";

import { ProjectTimeline } from "@/app/project-timeline";
import { Section } from "@/components/ui";

const STATES = ["AWAITING_BRIEF","BRIEF_SUBMITTED","IN_DESIGN","CONCEPTS_READY","REVISIONS_IN_PROGRESS","AWAITING_APPROVAL","APPROVED","FINAL_FILES_READY","DELIVERED"];
const LABELS = ["Awaiting brief","Brief submitted","In design","Concepts ready","Revisions in progress","Awaiting approval","Approved","Final files ready","Delivered"];
const timeline = (current: number) =>
  LABELS.map((label, i) => ({ state: STATES[i]!, label, completed: i < current, current: i === current, timestamp: i <= current ? "2026-10-21T09:12:00.000Z" : undefined }));

const CONCEPT =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#f1efe9"/><circle cx="320" cy="150" r="58" fill="#5150f7"/><rect x="214" y="240" width="212" height="18" rx="9" fill="#21211f"/><rect x="258" y="274" width="124" height="12" rx="6" fill="#8e8b82"/></svg>`,
  );

export default function LayoutPreview() {
  return (
    <div className="min-h-screen bg-app px-4 py-8 md:px-8">
      <div className="mx-auto max-w-[920px] space-y-12">
        <section className="space-y-6">
          <p className="text-sm font-semibold text-fg-3">With a concept — the stage and the concept share the row</p>
          <div className="grid gap-6 lg:grid-cols-2">
            <ProjectTimeline timeline={timeline(3)} customerAction="Review concepts" />
            <Section title="Latest concept" actions={<Link className="portal-btn-ghost h-8" href="#">View all</Link>}>
              <span className="block overflow-hidden rounded-xl border border-line bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={CONCEPT} alt="Latest concept #1" className="aspect-[16/9] w-full object-contain" />
              </span>
            </Section>
          </div>
        </section>

        <section className="space-y-6">
          <p className="text-sm font-semibold text-fg-3">Without one — the stage takes the width, and nothing stands in for the concept</p>
          <ProjectTimeline timeline={timeline(1)} customerAction={null} />
        </section>
      </div>
    </div>
  );
}
