# Kleenest Platform architecture

Kleenest Platform is the external integration surface for Kleenest restroom intelligence. It is implemented inside the canonical `Kleenest_Production` monorepo and reuses the same place identity, trust, discovery and route data used by the four product apps.

## Product surfaces

The platform is one core with multiple delivery surfaces:

- REST API — backend-to-backend access.
- JavaScript/mobile SDKs — typed clients and native integration helpers.
- Widget — embeddable "Find a restroom" UI.
- Map Layer — GeoJSON-compatible Kleenest place/recommendation overlays.
- Route SDK — route-corridor and optimal-stop helpers.
- Deep Links — canonical web and native links to Kleenest places/routes.
- Webhooks — partner notifications for material location/status changes.
- AI/MCP — assistant tools backed by the same REST/recommendation contracts.
- Developer Portal — partner key management, documentation, usage and webhook configuration.

## Authority boundaries

1. Supabase remains server authority for production data, authorization and durable state transitions.
2. Existing discovery RPCs remain the initial data-access path:
   - `map_network_nearby_v3`
   - `map_network_nearby_v2`
   - `map_network_along_route_v1`
3. `packages/platform-core` owns shared public contracts, normalization, ranking helpers and deep-link construction.
4. External surfaces must not invent a separate place identity or trust model.
5. Third-party map/provider identifiers are crosswalk identifiers; the Kleenest place ID remains canonical for Kleenest-specific observations, trust and recommendations.
6. Licensed third-party source data must stay logically distinct from Kleenest proprietary observations, scores, verification and derived recommendations.

## Parallel work lanes

### Lane A — REST + MCP
Owns the server-facing recommendation gateway and assistant tool surface. MCP delegates to REST/core behavior rather than implementing a second recommendation engine.

### Lane B — SDK + Widget + Map
Owns client transport, embeddable UI and map serialization. These consume REST responses and shared contracts.

### Lane C — Route + Webhooks
Owns route request helpers, partner route adapters, event contracts and delivery semantics.

### Lane D — Partner platform
Follows the first three lanes with durable partner identities, hashed API credentials, quotas, usage accounting, billing hooks and a developer portal.

## Versioning

Public contracts are versioned under `/v1`. Additive response fields are allowed within v1. Renames, removals or semantic changes require a new API version.

## Ingestion

Ingestion is intentionally paused while storage is upgraded. Platform development proceeds against the existing dataset. Resuming ingestion must improve coverage without requiring a redesign of the public contracts.
