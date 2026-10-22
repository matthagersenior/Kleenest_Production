# Kleenest developer integration catalog

**Canonical source:** `Kleenest_Production/main`. **Status:** source-level capabilities with access controlled per partner. The developer catalog is not a promise that every product is enabled for every account. Use the partner workspace summary and a live authorized test to confirm availability.

## Consumer experience vs. partner embedding

- **Embeddable Web Widget** — implemented in `packages/widget` and distributed at `platform-distribution/v1/widget.js`. A developer embeds this in **their website** with a Kleenest browser token. It is not an Android/iOS launcher widget.
- **Official Consumer Home-screen Widget** — **not shipped** as of October 22, 2026. The desired 2×2 quick finder, 4×2 nearby results and 4×4 map/actions must be built into the **native Kleenest consumer app**, not the PWA, before users can install them. It should respect guest mode, location permission, no-stale-data labels, accessibility and battery limits. A new native binary and release testing are required. Current Consumer Expo SDK is 57; its `expo-widgets` library supports iOS, while Android widgets are documented in later SDK versions. Do not claim Android install support until a verified build exists.
- **Dedicated Kotlin/Swift SDK** — not yet shipped. REST is the supported native integration path; the existing JS/TS SDK is a separate product.

## Product and surface matrix

| Offered capability | Source / route | Required API product | Required surface | Credential | Status |
| --- | --- | --- | --- | --- | --- |
| Nearby restroom recommendations | `POST /v1/recommendations/nearby` | `nearby` | `rest` | Server key or origin-restricted Browser token | Implemented |
| Along-route recommendations | `POST /v1/recommendations/route` | `route` | `rest` | Server key or Browser token | Implemented |
| Canonical place details | `GET /v1/places/{id}` | `place_details` | `rest` | Server key or Browser token | Implemented |
| Place matching | `POST /v1/places/match` | `place_match` | `rest` | Server key or Browser token | Implemented |
| Amenity catalog | `GET /v1/amenities` | `place_details` via authorization alias | `rest` | Authorized key or Browser token | Implemented |
| Place intelligence, proof and access | `GET /v1/places/{id}/intelligence`, `/proof`, `/access` | `place_details` | `rest` | Authorized key or Browser token | Implemented |
| Route intelligence explanation | `POST /v1/intelligence/route` | `route` | `rest` | Authorized key or Browser token | Implemented |
| Smart facilities/devices | `GET/POST /v1/devices`, `POST /v1/devices/events`, `POST /v1/devices/{id}/commands`, `POST /v1/devices/{id}/commands/{commandId}/complete` | `smart_devices` | `rest` | Scoped **server** key with `devices:read`, `devices:write`, `devices:command`, or `devices:events:write` as appropriate | Implemented; separately authorized |
| JS/TS SDK | `packages/sdk-js`, hosted `v1/sdk.js` | Based on method, e.g. `nearby` | `sdk` | Server or Browser token per context | Implemented |
| Embeddable Web Widget | `packages/widget`, hosted `v1/widget.js` | `nearby` | `widget` | Browser token bound to exact origin | Implemented |
| GeoJSON Map Layer | `packages/map-layer`, hosted `v1/map.js` | `nearby` or `route` for data fetch | `map` | Browser token or server key for fetch | Implemented |
| Route SDK | `packages/route-sdk`, hosted `v1/route.js` | `route` | `route_sdk` | Browser token or server key for fetch | Implemented |
| Place / route deep links and QR | `packages/platform-core/src/deepLinks.ts`, consumer router | Public URLs: app-link handling is host-dependent | Not a metered partner surface | None for link generation | Implemented source contract; verify deployment-specific host |
| Partner webhooks | `deliver-platform-webhooks`, `docs/platform/WEBHOOKS.md` | Event-specific | `webhooks` | Webhook signing secret (not an API key) | Implemented |
| MCP / agent tools | `mcp/kleenest-mcp` | Method-specific | `mcp` | Server key; never paste into a browser | Implemented adapter, deploy/host separately |
| Consumer launcher widget | Requires consumer native app build | N/A — first-party consumer feature | N/A | Guest or signed-in app session | **Not shipped** |
| Dedicated mobile SDK | No Kotlin/Swift package in repository | N/A | N/A | N/A | **Not shipped** |

**Availability rule:** “Implemented” refers to source/runtime contracts, **not automatic entitlement or confirmed healthy production response**. A partner workspace must have the required API product, integration surface and scopes. Smart-device write and command privileges must not be shared with browser/mobile bundles. Owner approval should remain auditable.

## Integration entrypoints

- **Developer Portal:** https://matthagersenior.github.io/Kleenest_Production/developer/
- **Public distribution manifest:** https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-distribution/v1/manifest.json
- **OpenAPI:** https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-distribution/v1/openapi.json
- **API root:** https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-api
- **Webhooks:** [signed webhook contract](WEBHOOKS.md)
- **REST:** [authorization and endpoint guide](API_V1.md)
- **Canonical place link helpers:** `placeDeepLink()`, `routeDeepLink()`, `nativePlaceDeepLink()`.

## Developer integration checklist

1. Create/login to a developer account, join a partner workspace and select the relevant bundle.
2. Confirm **both** product and surface are enabled in workspace access; do not infer permission from the existence of a card or package.
3. For browser widgets/maps issue a short-lived **origin-restricted Browser token**. For servers/MCP/device bridges issue a least-privilege secret key. Never expose a secret key in client code.
4. Use API Playground to test nearby/route; for other endpoints test an authorized request using the published OpenAPI and response/error contract. The UI should show the backend's `requiredProduct` on 403 errors.
5. Run a production-credential request and confirm headers, quotas, CORS for browsers, error handling and deployment. Rotate/revoke test credentials when no longer needed.
6. If using webhooks, verify HMAC signature and timestamp, enforce event deduplication and handle retries.
7. Use only canonical location IDs/deep links; never generate links from ambiguous business names.
8. For native consumer widgets, wait until the relevant Android/iOS binary includes the extension/provider. A PWA “Add to Home Screen” icon is **not** a native widget.

## Release gate

An offering is marked **Available** only after its required source, public distribution endpoint/package, owner entitlement controls, documentation/example, positive authorized smoke test and forbidden-access smoke test pass. An unshipped offering must remain plainly marked **Not shipped**, without an install or API-key button that implies availability.
