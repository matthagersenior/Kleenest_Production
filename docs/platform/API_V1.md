# Kleenest REST API v1

The REST API exposes Kleenest restroom intelligence to partner backends and approved client integrations.

## Authentication

Foundation builds accept a partner credential in either:

- `x-kleenest-api-key: <key>`
- `Authorization: Bearer <key>`

The Edge Function currently resolves keys from the `KLEENEST_PLATFORM_API_KEYS` environment variable, a JSON object keyed by credential. This is a bootstrap mechanism. Durable partner identities, hashed key storage, origin-scoped publishable credentials, quotas and usage accounting belong to the partner-platform lane before external production release.

## Health

`GET /health`

No authentication is required.

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

## MCP

`mcp/kleenest-mcp` is a thin MCP v2 adapter over these REST endpoints. It exposes nearby, along-route and next-restroom tools and therefore inherits the same recommendation behavior.
