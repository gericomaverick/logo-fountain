# Checkout webhook and email delivery semantics

Checkout fulfillment accepts `checkout.session.completed` only when the session is paid. For delayed payment methods, `checkout.session.async_payment_succeeded` retrieves the current Checkout Session from Stripe and enters the same claimed, idempotent fulfillment and access-provisioning path. An unpaid completion does not provision access. `checkout.session.async_payment_failed` is durably recorded and logged by event ID/type only; it never provisions.

Webhook events use expiring processing claims with conditional claim renewal, reclaim, zero-count ownership checks, and conditional completion. Durable order/project fulfillment is idempotent, so a retry can resume required email side effects after fulfillment has already committed.

Required checkout customer and new-project admin emails use **at-least-once delivery**:

- a sent audit marker is written only after Postmark accepts the message;
- missing production configuration or recipients returns `skipped` and leaves the webhook retryable;
- retries consult durable sent markers and resume whichever side effect is missing;
- provider response bodies and bearer-bearing email content are never logged or returned.

The existing schema has no unique key that can safely serialize email-attempt claims. A process may fail after Postmark acceptance but before writing the sent marker, and concurrent retries can race before a marker exists. Rare duplicate emails are therefore possible. This is intentionally not described as exactly-once delivery. No database migration is included; a future durable outbox/unique delivery-key migration would be required to tighten these semantics.
