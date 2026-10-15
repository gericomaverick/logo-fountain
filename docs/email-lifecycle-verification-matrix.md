# Email Lifecycle Verification Matrix (Phase 2)

| Email type | Audience | Trigger source | Trigger condition | Idempotency key |
|---|---|---|---|---|
| Concept ready | Client | `POST /api/admin/projects/[id]/concepts/[conceptId]/publish` | Concept published | `email_sent:client_concept_ready:{conceptId}` |
| Revision to concept ready | Client | `POST /api/admin/projects/[id]/revision-requests/[rid]/delivered` | Revision request marked delivered | `email_sent:client_revision_ready:{revisionRequestId}` |
| New message | Client | `POST /api/projects/[id]/messages` | Message authored by admin | `email_sent:client_new_message:{messageId}` |
| Concept approved | Client | `POST /api/projects/[id]/approve` | Client approves a concept | `email_sent:client_concept_approved:{conceptId}` |
| Final deliverables ready for download | Client | `POST /api/admin/projects/[id]/finals` or notification-only retry | Current final ZIP is published in `FINAL_FILES_READY`/`DELIVERED` with approval intact | `email_sent:client_final_deliverables_ready:{finalAssetId}` |
| New project | Admin | `POST /api/stripe/webhook` | Non-upsell `checkout.session.completed`, fulfillment not deduped | `email_sent:admin_new_project` |
| Message from project | Admin | `POST /api/projects/[id]/messages` | Message authored by client/member (non-admin) | `email_sent:admin_message_from_project:{messageId}` |
| Feedback on concept | Admin | `POST /api/projects/[id]/revision-requests` | Client submits revision request | `email_sent:admin_feedback_on_concept:{revisionRequestId}` |

## Notes

- Delivery uses existing Postmark env config (`POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM`) and existing `ADMIN_EMAILS` allowlist for admin recipients.
- Templates are transactional, branded HTML + text fallback, with CTA links routed to client/admin project destinations.
- Dedupe markers are stored as `AuditEvent.type` entries under each project.
- Final-ready markers are asset-scoped so a genuinely new replacement asset can produce a new notification while retries for the same immutable publication return `already_sent`.
- Pre-upgrade projects may have only the legacy unscoped `email_sent:client_final_deliverables_ready` marker. The emergency implementation deliberately does not let that marker suppress an asset-scoped notification for a retained/current asset, because it cannot prove which immutable asset the legacy marker covered. The first post-upgrade retry for such a current final can therefore produce a one-time duplicate; subsequent retries use the asset-scoped marker.
