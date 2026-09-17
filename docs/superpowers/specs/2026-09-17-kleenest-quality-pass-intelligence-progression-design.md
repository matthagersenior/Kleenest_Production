# Kleenest Quality-Pass Intelligence + Progression Design

## Purpose

Extend the existing Kleenest intelligence and progression systems with six additive quality-pass capabilities: evidence transparency ("Why Kleenest?"), Coverage Missions, route confidence, meaningful trust-change alerts, shareable proof cards, and an Owner Product Truth view. These must deepen the current product without creating a new feature family or parallel control plane.

## Non-goals

- Do not create a second XP ledger, mission engine, League implementation, Passport authority, notification preference system, route engine, or Owner control plane.
- Do not let passive viewing, following a place, or sharing a proof card award XP.
- Do not let gameplay XP directly raise freshness, evidence confidence, or Contributor Trust.
- Do not treat Business-reported service as independent consumer evidence.
- Do not add continuous user-location tracking or retain raw route movement for these features.
- Do not turn Fleet into a generic FSM replacement.

## Product architecture

The work extends the intelligence foundation already used by Consumer Kleenest Now / Bathroom Fit / Facility Passport, Business Trust Recovery / Fix First, Fleet route coverage, and Owner Platform Graph / Why Inspector / Launch Readiness.

Canonical data stays in existing reviews, observations, visits, business service events, route stops, access entitlements, progression events, Passport events, notification preferences, and location records. New projections summarize or target those records; they do not rewrite them.

### 1. Why Kleenest

A reusable location explanation projection exposes current freshness, confidence, independent-confirmation count, conflicts, provenance, recent evidence, and a short human-readable rationale. Consumer uses it inside the Intelligence screen; Business uses it to explain Fix First priority; Fleet uses it to explain route-gap confidence. Owner keeps the deeper existing Why Inspector.

Passive explanation viewing never awards XP.

### 2. Coverage Missions

Coverage Missions are not a new mission engine. They are a new class of opportunity returned by the existing progression opportunity authority. Candidates are derived from useful network gaps, including:

- missing restroom intelligence;
- stale verification;
- incomplete amenity/access evidence;
- low-confidence or contradictory current evidence;
- route/corridor coverage gaps that can be resolved at a real location.

Coverage Mission completion must be backed by a canonical contribution/evidence event. Tapping a completion button alone cannot award XP. The completion projection records or recognizes the validated action through the existing progression event authority.

Validated Coverage Mission actions map into the existing evidence-backed progression family (for example `verify_location`, `reverify_stale`, `add_amenity`, `helpful_contribution`) rather than inventing a second XP class.

### Progression, League, streaks, badges and Passport

The current `progression_events_v2` ledger remains the single XP authority. League/rivals/lifetime XP continue to derive from awarded progression events. Coverage Mission XP therefore affects League automatically through the existing ledger.

Contributor Trust remains separate. Only evidence-backed actions count toward the trust-side contribution XP calculation, and existing evidence caps still apply. Arcade/game XP may affect League standing but does not directly raise Contributor Trust.

Coverage Missions appear inside the existing Progression World opportunity surface. Existing objectives, streaks, badges, seasonal progression, reward gates and permanent/stackable capability rewards continue to consume the same progression events. Passport remains event-derived from verified place activity; a Coverage Mission does not mint a Passport stamp unless the underlying verified visit/contribution satisfies the existing Passport authority.

### 3. Route Confidence

Consumer route confidence summarizes restroom support along the existing route: trusted/verified stops, low-confidence gaps, and the longest estimated uncovered span. It is informational and does not replace navigation.

Fleet extends its existing Route Relief coverage screen with an explicit route-confidence label and gap explanation. Fleet remains complementary to dispatch/telematics/FSM tools.

A route gap can surface a Coverage Mission only when it resolves to a real Kleenest location that can accept a valid evidence contribution.

### 4. Trust-change alerts

Users may follow a location for meaningful trust changes. This reuses the existing notification preference/inbox architecture rather than creating a second notification system.

Meaningful changes include a freshness band change, material confidence change, new contradiction, confidence restoration from fresh independent evidence, material amenity/access change, temporary closure/reopening, or a new business service event when relevant. Noise suppression collapses repeated changes inside a cooldown window.

Following/unfollowing a location awards no XP. Reverification prompted by an alert can earn XP only after a valid canonical contribution is accepted.

### 5. Kleenest proof cards

A proof-card projection returns a compact shareable snapshot: place name, freshness, confidence, last evidence time, independent confirmation count, key amenities/access signals and provenance summary. Consumer can share text/deep-link content using the native share sheet.

Sharing awards no XP and exposes only information already appropriate for the public location experience; no contributor-private details or raw movement data are included.

### 6. Owner Product Truth

The existing Owner Intelligence screen gains a Product Truth section rather than a separate administration surface. It summarizes platform capabilities across four states: live/enabled, intentionally hidden/disabled, live but with insufficient data, and degraded/failing. It also surfaces meaningful changes within the last day where source data supports that claim.

The view converges Platform Graph, Launch Readiness, policy state, feature availability and operational health; it does not create a second source of feature flags.

## Database and security

Prefer `SECURITY INVOKER` projections when RLS can express access. Any privileged function that must be callable by authenticated users must validate `auth.uid()` and constrain results to its intended scope. New exposed tables must have RLS enabled and explicit least-privilege policies. New functions must have deliberate EXECUTE grants rather than relying on PUBLIC defaults.

Location-follow rows are owned by the authenticated user. Public proof/explanation projections must not expose user IDs, private notes, emails, precise visit paths, or hidden moderation fields.

## Client surfaces

- `apps/consumer-mobile/app/intelligence.tsx`: Why Kleenest, follow/unfollow meaningful changes, recent trust changes, proof card/share.
- `apps/consumer-mobile/app/progress.tsx`: Coverage Missions grouped inside existing opportunities and explained as League/progression contributions.
- `apps/consumer-mobile/app/route.tsx`: route-confidence summary and coverage-gap CTA.
- `apps/business-mobile/app/service-freshness.tsx`: Why Fix First / evidence explanation.
- `apps/fleet-mobile/app/coverage.tsx`: explicit route-confidence state and gap rationale.
- `apps/platform-mobile/app/intelligence.tsx`: Product Truth convergence.
- `packages/mobile-core/src/appSearch.ts`: searchable aliases for all new concepts, routed to existing screens.

## Error handling and offline behavior

All intelligence projections are additive. If one projection fails, existing location, progression, Business, Fleet and Owner screens must remain usable. Consumer intelligence continues to load independent sections with graceful fallbacks. Follow/share actions report failure without changing local authoritative state. Route confidence falls back to the existing route presentation.

## Testing and release contract

A source-controlled convergence audit is added first and wired into required Production CI. It must verify:

- all six capabilities are represented in code and search;
- Coverage Missions use the existing progression opportunity/event authority;
- no second XP/League ledger exists;
- passive follow/share/explanation actions do not award XP;
- route confidence extends existing Consumer/Fleet routes;
- Product Truth extends the existing Owner Intelligence surface;
- database grants/RLS and function contracts are source-controlled.

After implementation: run the new audit, existing intelligence/progression audits, app-search audit, Consumer/operator typechecks, and production build. Apply and verify the Supabase migration, run advisors, open one PR, require all branch-protection gates, merge immediately when green, then verify post-merge Production CI, security, parity, family OTA/native classification, web/installer deployment and live Installation Center smoke. No feature branch or PR may remain after successful merge.