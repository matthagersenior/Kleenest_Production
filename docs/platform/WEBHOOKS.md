# Kleenest webhooks

Kleenest webhooks notify partner systems when material Kleenest place intelligence changes.

## Event envelope

Every delivery contains an immutable event ID, event type, creation timestamp, partner ID and event-specific data.

Initial event types:

- `place.updated`
- `place.verification_changed`
- `place.access_changed`
- `place.amenities_changed`
- `place.confidence_changed`
- `recommendation.coverage_changed`

## Signing

Deliveries use HMAC-SHA256 over `<timestamp>.<raw request body>`.

Headers:

- `Kleenest-Webhook-Id`
- `Kleenest-Webhook-Timestamp`
- `Kleenest-Webhook-Signature: v1=<hex digest>`

Consumers should reject timestamps outside a five-minute tolerance by default and deduplicate on event ID.

## Delivery semantics

Webhook transport is at-least-once. Partner endpoints must be idempotent. A non-2xx response is a failed delivery and may be retried. Durable retry scheduling, partner endpoint storage and dead-letter handling belong to the partner-platform backend lane rather than client SDKs.
