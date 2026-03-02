# State Machine Hardening Notes

Date: 2026-03-02

## What changed

1. Added a central project state machine module at:
   - `apps/web/src/lib/project-state-machine.ts`

   It now defines:
   - Canonical project states
   - Transition graph (including exceptional states)
   - Human labels
   - Primary CTA per state
   - `canTransition(from, to)`
   - `applyTransition(current, next, context)`
   - `buildTimeline(currentState, timestamps)`

2. Refactored status-mutating endpoints to validate transitions via `applyTransition` and reject invalid transitions with `jsonError` + `details.allowed`:
   - `POST /api/projects/[id]/brief`
   - `POST /api/admin/projects/[id]/status`
   - `POST /api/admin/projects/[id]/concepts/[conceptId]/publish`
   - `POST /api/projects/[id]/revision-requests`
   - `POST /api/admin/projects/[id]/revision-requests/[rid]/delivered`
   - `POST /api/projects/[id]/approve`
   - `POST /api/admin/projects/[id]/finals`

3. Extended project snapshot (`apps/web/src/lib/project-snapshot.ts`) with:
   - `statusLabel`
   - `primaryCta`
   - `timeline: [{ state, label, completed, current, timestamp? }]`

4. Added timeline UI to both project detail pages:
   - `apps/web/src/app/project/[id]/page.tsx`
   - `apps/web/src/app/admin/projects/[id]/page.tsx`
   - Shared component: `apps/web/src/app/project-timeline.tsx`

## Timestamp strategy

- Primary source: `audit_events` (`event_type = state_changed`) if table exists.
- Fallback: inferred timestamps from project lifecycle records:
  - project create time
  - concept publish/approve activity
  - revision request create/update activity
  - final ZIP upload time

This keeps timeline functional before full audit-event rollout.

## Follow-up suggestions

- Add explicit `audit_events` schema + writes on every state change.
- Move all status constants in legacy code to import from `project-state-machine.ts`.
- Add endpoint-level tests covering invalid transitions and expected `details.allowed` payloads.
