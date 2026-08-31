# Kleenest Consumer / Operations Product Boundary

## Decision

Kleenest is split into two product experiences that share one backend trust and intelligence platform.

### Kleenest Consumer

`apps/consumer-mobile` is the shipping consumer product. It must stay lightweight on-device and rich in structured data production.

Primary responsibilities:

- Find nearby bathrooms quickly.
- Search/filter by place, brand, distance, and restroom needs.
- View bathroom details, amenities, cleanliness/trust signals, photos, and reviews.
- Navigate, route, arrive, and check in.
- Save bathrooms/routes.
- Submit reviews, photos, amenity observations, cleanliness/quality observations, corrections, and verification outcomes.
- Scan consumer-facing QR flows.
- Participate in progression, streaks, badges, challenges, quests, contests, leaderboards, and rewards.
- Follow contributors, view community activity, and receive consumer notifications.
- Manage profile, preferences, membership, and account controls.

The consumer client should not carry Business, Fleet, Enterprise, Admin, remediation operations, campaign management, analytics workspaces, dispatch control, or operator dashboards.

### Kleenest Operations

Business, Fleet, Enterprise, and platform/admin experiences belong in a separate Operations application/build boundary. Existing root web implementation is retained as an implementation donor while this boundary is completed.

Operations consumes the canonical backend produced by consumer interactions and other trusted sources. It owns downstream management, analytics, remediation, prevention, dispatch, campaigns, QR studio, reporting, benchmarking, and enterprise controls.

## Shared platform rule

Both products share authoritative Supabase data contracts. They do not duplicate truth stores.

Consumer actions produce structured signals such as:

`search -> impression -> selection -> route -> arrival/check-in -> observation/photo/review -> verification -> progression/community event`

Those signals feed canonical location/restroom trust and derived intelligence. Operations reads that authority; it does not redefine consumer truth in a shadow model.

## Architecture donor rule

`matthagersenior/Kleenest_Architecture/main` is the product and behavior donor/reference for the Production rebuild.

For each consumer capability:

1. Inspect the Architecture implementation, service contract, audits, and known defects.
2. Preserve the proven behavior and backend authority.
3. Translate web-specific behavior into the native Expo/MapLibre implementation where required.
4. Repair brittle or conflicting implementation rather than blindly copying it.
5. Implement missing pieces only in `Kleenest_Production`.
6. Verify the complete native path through CI and real-device testing.

Do not implement new product work in Architecture while building Production.

## Consumer completion standard

A capability is complete only when the full path works:

`backend authority -> mobile service -> native route/surface -> user action -> visible success/error state -> resulting canonical data -> relevant progression/community/intelligence refresh`

A table, RPC, component, or button existing by itself does not count as completion.

## Current consumer cluster order

1. Discovery / location / navigation / check-in.
2. Evidence / reviews / photos / amenities / verification.
3. Progression / rewards / challenges / quests / contests / leaderboard.
4. Community / profiles / follows / activity / reputation / notifications.
5. Saved / routes / QR / membership / profile / account controls.
6. Offline, performance, accessibility, onboarding, and real-device launch certification.

Business/Fleet/Enterprise expansion remains secondary until the consumer parity program is complete enough for normal users to perform the core Kleenest experience reliably.
