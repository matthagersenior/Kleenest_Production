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

## Smart Device events

Smart Facilities integrations add these signed webhook event types:

- `device.status_changed`
- `device.alert`
- `device.telemetry_threshold`
- `device.command_requested`
- `device.command_completed`

A bridge consumes `device.command_requested`, performs only a command declared by that device, and reports the result through the Smart Device completion endpoint. Existing HMAC verification, retry, dead-letter, and replay rules apply unchanged.


## Smart Restroom amenity provenance

When Business confirmation or live device state changes the published `Connected / Smart Restroom` capability, Kleenest emits `place.amenities_changed` to the integration partner attached to that Smart Device bridge. The payload includes location ID, amenity name, published presence, Business-confirmed state, device-verification state, total devices and online-device count.

Community discovery/review observations remain evidence and do not masquerade as a Business/device state change. Device-specific health and command lifecycle continue through the `device.*` events above.
