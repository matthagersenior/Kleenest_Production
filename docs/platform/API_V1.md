# Kleenest REST API v1

The REST API exposes Kleenest restroom intelligence to partner backends and approved client integrations.

## Authentication

Partners authenticate with a durable Kleenest API key in either:

- `x-kleenest-api-key: <key>`
- `Authorization: Bearer <key>`

Keys are generated once, stored only as SHA-256 hashes, can expire, can be revoked, and are scoped. The v1 recommendation endpoints require `recommendations:read` or `*`.

## Quotas and metering

Authorization is atomic and enforced in Postgres before recommendation work runs.

Each successful authorization consumes:

- one request in the partner's current minute bucket,
- one request in the partner's current monthly bucket.

Responses include:

- `x-kleenest-request-id`
- `x-kleenest-partner-id`
- `x-kleenest-plan`
- `x-ratelimit-limit-minute`
- `x-ratelimit-remaining-minute`
- `x-ratelimit-limit-month`
- `x-ratelimit-remaining-month`

Quota failures return `429`. Minute quota responses include `Retry-After`.

Compact daily usage aggregates track route-level request, success, client-error, server-error, and unit counts without retaining a large raw-request ledger.

## Health

`GET /health`

No partner credential is required.

## Nearby recommendations

`POST /v1/recommendations/nearby`

Example request:

```json
{
  "location": { "latitude": 38.627, "longitude": -90.1994 },
  "radiusMeters": 16093,
  "limit": 5,
  "requirements": {
    "amenityNames": ["wheelchair_accessible"],
    "amenityMatch": "all"
  }
}
```

The service delegates discovery to the existing `map_network_nearby_v3` RPC, normalizes Kleenest trust/restroom fields and returns ranked recommendations.

## Route recommendations

`POST /v1/recommendations/route`

Example request:

```json
{
  "route": {
    "type": "LineString",
    "coordinates": [[-94.5786, 39.0997], [-90.1994, 38.627]]
  },
  "corridorMeters": 8047,
  "limit": 10
}
```

The service delegates corridor discovery to `map_network_along_route_v1`.

## Response contract

Both recommendation endpoints return:

- canonical Kleenest place identity,
- score,
- trust/confidence/verification summary,
- restroom attributes,
- route/distance fields when available,
- reason codes,
- human-readable explanation,
- canonical deep link,
- request metadata.

All external recommendation surfaces should consume this contract rather than recreate ranking independently.

## Partner operations

Partner lifecycle, API-key issuance/revocation, usage summaries, billing/plan linkage and webhook endpoint management are handled through the internal `platform-partner-admin` Edge Function and Developer Portal.

Plaintext API keys and webhook signing secrets are returned only once at creation time.

## MCP

`mcp/kleenest-mcp` is a thin MCP v2 adapter over these REST endpoints. It exposes nearby, along-route and next-restroom tools and therefore inherits the same authorization, quota and recommendation behavior.
