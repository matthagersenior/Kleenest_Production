# Kleenest Partner Platform

The Partner Platform is the control plane behind Kleenest REST, SDK, Widget, Map Layer, Route SDK, Deep Links, Webhooks and MCP integrations.

## Authority model

`platform_partners` is the canonical partner identity. It owns plan, status and request quotas.

`platform_api_keys` stores only:

- key ID,
- partner ID,
- label,
- visible key prefix,
- SHA-256 hash,
- scopes,
- expiry/revocation/last-used timestamps.

The raw `kln_live_...` key is returned exactly once by `issue_platform_api_key`.

## Request authorization

`authorize_platform_request` performs all of the following inside one database transaction:

1. hashes and resolves the supplied key,
2. rejects expired or revoked keys,
3. verifies the partner is active,
4. checks required scope,
5. serializes quota accounting per partner,
6. enforces minute and monthly limits,
7. increments compact quota buckets,
8. records key last-use time,
9. returns partner/rate-limit metadata.

`record_platform_request_outcome` keeps 30-day-friendly daily aggregates by route rather than storing a high-volume raw request ledger.

## Billing and plans

`platform_partner_billing` provides a provider-neutral convergence point for commercial state.

Supported provider labels are currently `manual`, `stripe`, `shopify`, and `other`. The authority stores external customer/subscription references, subscription status, plan code and period end. It does not process payments itself.

The billing hook can update the canonical partner plan without coupling recommendation code to a payment vendor.

## Webhooks

Each endpoint has:

- partner ownership,
- HTTPS URL,
- event subscriptions,
- active state,
- encrypted signing secret,
- success/failure health fields.

Signing secrets are encrypted at rest with AES-256 through pgcrypto. The encryption key is supplied only from the Edge Function secret `KLEENEST_PLATFORM_WEBHOOK_MASTER_KEY`.

Events are durable. Delivery is at-least-once.

The worker:

1. claims due deliveries using `FOR UPDATE SKIP LOCKED`,
2. decrypts the endpoint signing secret transiently,
3. signs `<unix_timestamp>.<raw_body>` with HMAC-SHA256,
4. sends a 10-second bounded HTTPS request,
5. records success or schedules exponential retry,
6. moves a delivery to `dead` after 8 attempts.

Partner consumers should deduplicate on `Kleenest-Webhook-Id`.

## Required Edge Function secrets

Production needs three Kleenest-specific secrets:

- `KLEENEST_PLATFORM_ADMIN_SECRET` — protects the internal operator control plane.
- `KLEENEST_PLATFORM_WEBHOOK_MASTER_KEY` — encrypts/decrypts webhook signing secrets.
- `KLEENEST_PLATFORM_WEBHOOK_WORKER_SECRET` — authenticates scheduled webhook worker invocations.

Supabase-provided `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` are used for privileged database calls.

No secret values belong in Git.

## Developer Portal

`apps/developer-portal` is intentionally an internal operator preview in this phase. It supports:

- partner creation,
- API key issuance/revocation,
- quota/usage inspection,
- billing/plan linkage,
- webhook creation/disablement,
- test webhook enqueue,
- REST and webhook integration examples.

The operator credential is entered at runtime and held in `sessionStorage`; it is not compiled into the bundle.

Partner self-service authentication and public onboarding can replace this operator gate later without changing the underlying database authority.

## Scheduling

`deliver-platform-webhooks` is designed for periodic invocation. Supabase supports scheduled Edge Functions with `pg_cron` + `pg_net`; any scheduler credential should be held in Vault rather than hardcoded in SQL.

The worker is idempotent at the claim/delivery-state level and safely supports repeated invocations.

## Storage discipline

This design deliberately avoids a raw API-request event table. Minute buckets are short-lived, month totals are compact, and daily route aggregates support partner analytics with much lower storage growth.

`cleanup_platform_rate_buckets` removes minute buckets older than two days.
