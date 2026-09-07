# Consumer adaptive + route-aware restroom discovery implementation plan

**Goal:** Make Consumer Explore useful for both local discovery and road-trip planning without weakening trust semantics, security boundaries, or release gates.

## Contract

- Nearby radius choices: 1, 5, 10, 25, 50 miles.
- Amenity matching is explicit: `all` or `any`; missing amenity evidence never counts as a match.
- Optional auto-expansion walks outward through 5, 10, 25, 50, 100, 250 miles, never beyond the user-selected maximum and never silently.
- Adaptive search stops when it has enough qualifying results and keeps response sizes backend-bounded.
- Along-route search uses the real saved route draft, device origin, and real OSRM geometry already present in the Consumer runtime.
- Route candidates are selected server-side by a bounded PostGIS corridor and ordered by route fraction, then corridor distance.
- UI may derive approximate miles/minutes ahead from route fraction and the real route totals; it must not invent detour times.
- Unknown amenity data is not treated as positive evidence.

## Backend hardening

1. Add `map_network_nearby_v3` as a new RPC rather than changing old-client behavior.
2. Add `map_network_along_route_v1` for GeoJSON LineString corridor search.
3. Validate coordinates, radius/corridor caps, limits, search size, amenity count/name size, match-rule enum, route payload size, route point count and route length.
4. Use indexed `locations.geom` geography with PostGIS `ST_DWithin`.
5. Use `SECURITY INVOKER` with a pinned search path; no dynamic SQL and no `SECURITY DEFINER` in the new discovery RPCs.
6. Revoke `PUBLIC` execute and grant only `anon` and `authenticated` because discovery is intentionally public.
7. Preserve RLS-backed reads from locations/amenities/fixtures and avoid depending on tables unavailable to anon.

## Client wiring

1. Add typed mobile-core discovery helpers for nearby v3, adaptive expansion, and along-route search.
2. Replace the Consumer Explore implementation with a canonical adaptive screen that retains map selection, full details, directions, route-add, brand/restroom signals, trust enrichment and continuity caching.
3. Add Nearby / Along route search-area controls.
4. Along route reads the actual route draft, builds actual geometry, queries the backend corridor, shows approximate miles/minutes ahead and distance from route, and can add/open a real stop.
5. Keep filtered/adaptive results out of the generic nearby cache.

## Verification gates

- Add a structural/authority audit that fails if the UI is disconnected, the RPCs drift, hard caps are removed, or the functions become security-definer.
- Run it in Production CI, Product Parity, APK verify-family and signed-AAB verify-family.
- Run Consumer typecheck and existing full authority audits.
- Apply the migration through Supabase migrations, execute negative/positive RPC tests, and re-run Supabase security advisors.
- Require fresh final-head Production CI, parity, four-APK and signed-AAB runs before treating the branch as release-ready.
- Publish Consumer OTA only after those gates are green and the OTA workflow is confirmed to target the Consumer production channel/runtime.
