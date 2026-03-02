# Audit events smoke test

Quick verification checklist for the audit trail hardening step.

## Prereqs

- Migrations applied (`npm run db:migrate` or your normal Prisma workflow).
- API running with valid Supabase + DB env.

## Smoke flow

1. **Fulfill order**
   - Trigger `checkout.session.completed` webhook.
   - Expect `order_fulfilled` + initial `state_changed` audit rows.

2. **Client submits brief**
   - `POST /api/projects/:id/brief`
   - Expect `brief_submitted` + `state_changed` (`BRIEF_SUBMITTED`).

3. **Admin uploads concept**
   - `POST /api/admin/projects/:id/concepts`
   - Expect `concept_uploaded`.

4. **Admin publishes concept**
   - `POST /api/admin/projects/:id/concepts/:conceptId/publish`
   - Expect `concept_published`.
   - On first publish, expect `state_changed` (`CONCEPTS_READY`).

5. **Client requests revision**
   - `POST /api/projects/:id/revision-requests`
   - Expect `revision_requested` + `state_changed` (`REVISIONS_IN_PROGRESS`).

6. **Admin marks revision delivered**
   - `POST /api/admin/projects/:id/revision-requests/:rid/delivered`
   - Expect `revision_delivered`.
   - If `setConceptsReady !== false`, expect `state_changed` (`CONCEPTS_READY`).

7. **Client approves concept**
   - `POST /api/projects/:id/approve`
   - Expect `concept_approved` + `state_changed` (`AWAITING_APPROVAL`).

8. **Admin uploads finals**
   - `POST /api/admin/projects/:id/finals`
   - Expect `finals_uploaded` + `state_changed` (target depends on approved concept state).

9. **Any project message**
   - `POST /api/projects/:id/messages`
   - Expect `message_sent`.

10. **Manual status transition**
    - `POST /api/admin/projects/:id/status`
    - Expect `state_changed` with previous/next status in payload.

## Timeline check

- Fetch project snapshot endpoint.
- Verify timeline timestamps align with `AuditEvent(type=state_changed)` `createdAt` values.
- Confirm no dependence on raw SQL fallback table reads.
