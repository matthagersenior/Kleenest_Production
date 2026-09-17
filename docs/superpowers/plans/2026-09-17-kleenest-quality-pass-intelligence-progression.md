# Kleenest Quality-Pass Intelligence + Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Why Kleenest, Coverage Missions, route confidence, meaningful trust-change alerts, proof cards, and Owner Product Truth as additive extensions of the existing intelligence/progression architecture, fully integrated with XP, League, streaks, badges, Passport and rewards.

**Architecture:** Extend the existing Supabase intelligence projections and `progression_events_v2` authority. Coverage Missions are progression opportunities backed by canonical evidence events, not a new mission engine. Consumer, Business, Fleet and Owner reuse their current intelligence screens/routes, while universal search indexes the new concepts.

**Tech Stack:** Expo Router, React Native, TypeScript, Supabase/Postgres RPC + RLS, GitHub Actions, EAS OTA.

**Spec:** `docs/superpowers/specs/2026-09-17-kleenest-quality-pass-intelligence-progression-design.md`

## Global Constraints

- No second XP ledger, League implementation, mission engine, Passport authority, notification preference system, route engine, or Owner control plane.
- `progression_events_v2` remains the single XP authority.
- League/rivals/lifetime XP derive from awarded progression events.
- Contributor Trust only recognizes evidence-backed progression actions and remains capped by canonical evidence quality.
- Passive explanation, follow/unfollow and proof-card sharing award zero XP.
- Business-reported service never becomes independent consumer evidence.
- New Consumer capabilities must remain additive and must not hide Find, Check In, Add Place or Scan QR.
- No continuous raw movement tracking.
- All new exposed tables use RLS; function EXECUTE grants are explicit.
- Existing routes are reused wherever possible to avoid navigation drift.
- Required CI must be green before merge; successful work ends on `main` with no open PR or feature branch.

---

### Task 1: Add the failing quality-pass convergence contract

**Files:**
- Create: `scripts/quality-pass-intelligence-progression-audit.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: source files and migration text only.
- Produces: a deterministic CI guard for all six features and progression invariants.

- [ ] **Step 1: Write the failing audit**

Create a Node audit that reads the six app/service surfaces plus the migration and asserts these source contracts are present: `location_intelligence_explanation`, `consumer_location_trust_watch`, `consumer_location_trust_changes`, `location_proof_card`, `consumer_route_confidence`, `owner_product_truth`, Coverage Mission kinds, search aliases, and progression copy explicitly tying Coverage Missions to League/progression. Assert no new table/function name suggesting a second XP ledger or League engine is introduced.

- [ ] **Step 2: Run the audit against the pre-feature source**

Run: `node scripts/quality-pass-intelligence-progression-audit.mjs`
Expected: FAIL because the new RPCs/surfaces do not yet exist.

- [ ] **Step 3: Wire the audit into required Production CI**

Add a `Quality-pass intelligence + progression` step before `Full authority chain parity` in `.github/workflows/ci.yml`.

- [ ] **Step 4: Commit the red contract**

Commit message: `test: require quality-pass intelligence progression`

### Task 2: Add canonical database projections and trust-watch authority

**Files:**
- Create: `supabase/migrations/20260917050000_quality_pass_intelligence_progression.sql`

**Interfaces:**
- Produces RPCs:
  - `location_intelligence_explanation(uuid) -> jsonb`
  - `location_proof_card(uuid) -> jsonb`
  - `consumer_route_confidence(uuid) -> jsonb`
  - `consumer_location_trust_watch(uuid, boolean) -> jsonb`
  - `consumer_location_trust_changes(integer) -> jsonb`
  - `owner_product_truth() -> jsonb`
- Produces user-owned table `location_trust_watches` with RLS.
- Extends `consumer_nearby_progression_opportunities(...)` to label network gaps as Coverage Mission candidates while preserving its existing contract.
- Extends `consumer_progression_world()` only by adding a `coverage_missions`/opportunity summary derived from canonical progression opportunities; no new XP ledger.

- [ ] **Step 1: Write SQL contracts from current production function definitions**

Use the current production `consumer_progression_world()` and `consumer_nearby_progression_opportunities(...)` definitions as the base so existing season, rivals/League, trust, collections and campaign behavior is preserved verbatim.

- [ ] **Step 2: Create trust-watch storage with RLS**

Create `public.location_trust_watches(user_id uuid, location_id uuid, created_at timestamptz, last_notified_at timestamptz, last_fingerprint text, primary key(user_id,location_id))`, enable RLS, index `location_id`, and grant only authenticated owner access through `auth.uid()` policies.

- [ ] **Step 3: Add read projections**

Each read projection returns only public/location-scoped evidence summaries and uses existing Kleenest Now, Facility Passport, route and health data. No raw contributor-private or movement data is returned.

- [ ] **Step 4: Add watch mutation and meaningful-change feed**

The watch mutation requires `auth.uid()`. The change feed is restricted to the current user’s watched locations and collapses noise into material freshness/confidence/conflict/access/service changes.

- [ ] **Step 5: Extend progression opportunity output**

Return stable IDs, kind, title/detail, XP suggestion, mission action/value and metadata for Coverage Mission candidates. Kinds include `coverage_verification`, `freshness_recheck`, `amenity_confirmation`, and `route_gap_verification` only when the location/evidence gap supports them.

- [ ] **Step 6: Preserve League/trust separation**

Do not change `v_total_xp`/rivals calculation away from `progression_events_v2`. Any new evidence-backed completion maps to existing evidence-backed action codes; passive actions are absent from awarded actions.

- [ ] **Step 7: Validate SQL before applying**

Run read-only queries against production metadata to verify referenced tables/columns/functions exist and function signatures match.

### Task 3: Extend Consumer intelligence with Why, watches and proof cards

**Files:**
- Modify: `apps/consumer-mobile/services/intelligenceLayer.ts`
- Modify: `apps/consumer-mobile/app/intelligence.tsx`

**Interfaces:**
- Service wrappers for all Consumer-facing RPCs from Task 2.
- Native share action for proof cards.

- [ ] **Step 1: Add service wrappers**

Add `getLocationExplanation`, `getLocationProofCard`, `setLocationTrustWatch`, and `getLocationTrustChanges`; include explanation/proof/change state in `getConsumerIntelligence` using `Promise.allSettled` so one failure does not block existing intelligence.

- [ ] **Step 2: Add Why Kleenest UI**

Show rationale, provenance, independent confirmations, recent conflicts and recent evidence under a `WHY KLEENEST?` card.

- [ ] **Step 3: Add meaningful-change follow controls**

Show follow/unfollow without XP language; display recent meaningful changes when present.

- [ ] **Step 4: Add proof card sharing**

Use React Native `Share` with place name, freshness/confidence, evidence age, confirmation count, key amenities/access and a Kleenest deep-link. Sharing does not call progression APIs.

### Task 4: Merge Coverage Missions into Progression World, League and rewards

**Files:**
- Modify: `apps/consumer-mobile/services/discoveryProgression.ts`
- Modify: `apps/consumer-mobile/app/progress.tsx`

**Interfaces:**
- `NormalizedProgressionOpportunity` recognizes `coverage_*` kinds and preserves existing `xp`, `missionAction`, `missionValue`, metadata fields.
- Existing progression world remains the single surface for League, rivals, streaks, badges, Passport links and rewards.

- [ ] **Step 1: Normalize Coverage Mission rows**

Map the server opportunity fields into existing normalized opportunities; do not introduce a second client store.

- [ ] **Step 2: Present Coverage Missions inside Progression**

Add a Coverage Missions section sourced from the same opportunities array. Explain that validated contributions feed XP, League and existing rewards; trust changes only when evidence qualifies.

- [ ] **Step 3: Preserve existing League tiers and rivals**

Do not change tier thresholds or rival scoring. Confirm lifetime/season XP continue to come from the existing world payload.

- [ ] **Step 4: Keep completion evidence-backed**

Coverage Mission CTAs route the user into the existing check-in/review/knowledge/amenity contribution flow appropriate to `missionAction`; the Progression screen itself never awards XP.

### Task 5: Add route confidence to Consumer and Fleet

**Files:**
- Modify: `apps/consumer-mobile/app/route.tsx`
- Modify: `apps/consumer-mobile/services/intelligenceLayer.ts`
- Modify: `apps/fleet-mobile/services/routeReliefIntelligence.ts`
- Modify: `apps/fleet-mobile/app/coverage.tsx`

**Interfaces:**
- Consumer uses `consumer_route_confidence` for an existing route.
- Fleet derives an explicit confidence label/rationale from existing `fleet_route_relief_coverage` output.

- [ ] **Step 1: Add Consumer route-confidence loader**

Load confidence independently from route rendering and fall back silently to current route behavior if unavailable.

- [ ] **Step 2: Render Consumer route support**

Show confidence state, trusted-stop count, longest uncovered estimate and a Coverage Mission CTA for resolvable gaps.

- [ ] **Step 3: Extend Fleet Route Relief**

Add Strong/Mixed/Weak confidence language and `WHY THIS COVERAGE?` rationale using current coverage, freshness/confidence and access evidence; do not add routing/dispatch behavior.

### Task 6: Add Why Fix First to Business

**Files:**
- Modify: `apps/business-mobile/services/intelligenceLayer.ts`
- Modify: `apps/business-mobile/app/service-freshness.tsx`

**Interfaces:**
- Uses `location_intelligence_explanation` plus current `business_fix_first_queue` reasons.

- [ ] **Step 1: Add explanation service wrapper**

Load public/current location evidence without converting Business service events into independent confirmations.

- [ ] **Step 2: Add Why Fix First UI**

Selecting a Fix First row shows its priority reasons, current freshness/confidence/provenance and recent evidence/conflicts.

### Task 7: Converge Owner Product Truth

**Files:**
- Modify: `apps/platform-mobile/services/intelligenceLayer.ts`
- Modify: `apps/platform-mobile/app/intelligence.tsx`

**Interfaces:**
- `getOwnerProductTruth()` calls `owner_product_truth()`.
- Existing Platform Graph, Launch Readiness and Why Inspector stay in place.

- [ ] **Step 1: Add Product Truth service**

Load the projection alongside current Owner intelligence using the existing workspace loader.

- [ ] **Step 2: Add Product Truth UI**

Show counts/cards for live/enabled, hidden/disabled, insufficient-data and degraded/failing capabilities, plus changed-in-24h entries when present.

### Task 8: Make every capability searchable and keep existing routes canonical

**Files:**
- Modify: `packages/mobile-core/src/appSearch.ts`
- Modify: `scripts/app-search-coverage-audit.mjs` only if its exact-route contract requires aliases to be declared.

**Interfaces:**
- Consumer: Why Kleenest, Coverage Missions, Route Confidence, Trust Change Alerts, Proof Card.
- Business: Why Fix First.
- Fleet: Route Confidence / Why Coverage.
- Owner: Product Truth.

- [ ] **Step 1: Add search entries**

Route concepts to existing `/intelligence`, `/progress`, `/route`, `/service-freshness`, `/coverage` surfaces rather than adding duplicate navigation destinations.

- [ ] **Step 2: Run search coverage audit**

Run: `node scripts/app-search-coverage-audit.mjs`
Expected: PASS.

### Task 9: Turn the red quality-pass contract green

**Files:**
- All files from Tasks 1-8.

- [ ] **Step 1: Run the dedicated audit**

Run: `node scripts/quality-pass-intelligence-progression-audit.mjs`
Expected: PASS.

- [ ] **Step 2: Run adjacent audits**

Run:
`node scripts/intelligence-layer-convergence-audit.mjs`
`node scripts/progression-world-engagement-audit.mjs`
`node scripts/progression-reward-runtime-audit.mjs`
`node scripts/native-trust-mission-platform-audit.mjs`
`node scripts/app-search-coverage-audit.mjs`
Expected: all PASS.

- [ ] **Step 3: Run typechecks/build**

Run: `npm run native:typecheck && npm run operator:typecheck && npm run build`
Expected: PASS.

### Task 10: Apply and verify production database changes

**Files:**
- `supabase/migrations/20260917050000_quality_pass_intelligence_progression.sql`

- [ ] **Step 1: Apply the migration once through the connected Supabase project**

Project: `Kleenest Production` (`ssgesjzdvdsqacdtasje`).

- [ ] **Step 2: Verify database objects**

Query `pg_proc`, `pg_policies`, `location_trust_watches`, and sample read projections. Confirm expected EXECUTE grants and RLS ownership behavior.

- [ ] **Step 3: Run Supabase advisors**

Run security and performance advisors. Do not introduce new high-severity findings; address new actionable findings caused by this migration before merge.

### Task 11: PR, merge, release and zero-drift verification

**Files:**
- No additional feature source unless CI finds a regression.

- [ ] **Step 1: Open one PR from `feature/quality-pass-intelligence-progression-20260917` to current `main`**

Describe all six capabilities and the progression/League invariants.

- [ ] **Step 2: Keep branch current with main**

If `main` moves, update the branch before required checks complete; do not weaken strict-current branch protection.

- [ ] **Step 3: Require all protected checks**

Production CI, Security Gate, parity and all required contracts must be green.

- [ ] **Step 4: Merge immediately when green**

Use expected head SHA. Do not leave the PR open after checks pass.

- [ ] **Step 5: Verify post-merge delivery**

Confirm new `main` head, Branch Hygiene cleanup, Production CI, Security/CodeQL, app-family parity, OTA/native release classification, all required OTA publishes or synchronized native build if required, web preview, standalone installer/deployment, and live Installation Center smoke.

- [ ] **Step 6: Verify zero drift**

Confirm no open PR remains for this work and the feature branch has been deleted by Branch Hygiene.