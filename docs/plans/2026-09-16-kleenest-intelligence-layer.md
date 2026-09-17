# Kleenest Intelligence Layer Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared evidence/access intelligence layer and surface Kleenest Now, Bathroom Fit, Facility Passport, Trust Recovery, Fix First, route coverage, Owner explainability/readiness, and claimed-business service freshness without removing existing UI capabilities.

**Architecture:** Preserve canonical check-ins, reviews, photos, Passport, access, remediation, Fleet, and Business tables as sources of truth. Add additive service/evidence tables plus security-definer RPC projections; existing screens remain in place and receive new cards/actions or dedicated routes. Claimed-business service updates are freshness evidence with explicit provenance; they can raise freshness immediately but cannot overwrite consumer contradictions or masquerade as independent verification.

**Tech Stack:** PostgreSQL/Supabase RPCs and RLS, React Native/Expo Router, TypeScript, shared `@kleenest/mobile-core` search, repository audit scripts, GitHub Actions/OTA.

## Global Constraints

- Do not remove, replace, or hide existing Consumer, Business, Fleet, or Owner UI capabilities.
- One canonical evidence event may feed multiple product projections; do not create duplicate truth tables for each app.
- Business-reported cleaning/service improves freshness with visible `business_reported` provenance; independent confirmation remains separately visible and increases confidence.
- Businesses cannot delete or suppress unfavorable community evidence through service updates.
- Owner can tune policy/weights later through stored policy; defaults must be safe and bounded.
- All mutations are backend-authorized; direct client table writes stay revoked where practical.
- Keep the change OTA-compatible: no native permissions or native module changes.
- Protected-branch workflow: short-lived PR only, merge immediately after required checks pass, then verify branch cleanup/main convergence.

---

### Task 1: Shared evidence, service freshness, and access authority

**Files:**
- Create: `supabase/migrations/20260916214500_kleenest_intelligence_layer.sql`
- Create: `scripts/intelligence-layer-convergence-audit.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces RPCs `business_record_restroom_service_update`, `location_kleenest_now`, `location_facility_passport`, `kleenest_verified_access`, `business_trust_recovery`, `business_fix_first_queue`, `fleet_route_relief_coverage`, `owner_intelligence_overview`, `owner_explain_location_intelligence`.
- Extends `compute_bathroom_intelligence` and `kleenest_location_confidence` so business service evidence participates in freshness while provenance remains distinct from community verification.

- [ ] **Step 1: Add the focused failing audit**

Assert the migration defines the service/evidence tables, all RPC names, business-management authorization, provenance labels, bounded freshness calculation, and grants/revokes; assert the app service files referenced by later tasks do not yet satisfy the contract.

- [ ] **Step 2: Verify the relevant failure**

Run through CI: `node scripts/intelligence-layer-convergence-audit.mjs`.
Expected: non-zero with missing migration/RPC/service tokens.

- [ ] **Step 3: Implement the minimum backend authority**

Create `business_restroom_service_updates`, `kleenest_evidence_events`, and `kleenest_intelligence_policy`; revoke direct anon/auth writes; business service mutation requires `business_can_manage` and an approved/direct claim. Record cleaning/restock/inspection/repair/deep-clean/renovation/closure/reopen events. Compute service freshness from policy defaults and expose evidence provenance; do not update review/community rows. Verified access aggregates active preferred access, valid single-use purchase, Family access, Fleet Premium/workspace access, and existing consumer premium where available, returning reason/source instead of mutating old access tables.

- [ ] **Step 4: Verify the focused pass**

Run the same audit in CI; expected zero exit.

- [ ] **Step 5: Run affected integration checks**

`npm run audit`, Consumer/Business/Fleet/Owner typechecks, Supabase migration/security authority checks.

- [ ] **Step 6: Commit the passing deliverable**

Commit migration + audit + package script update.

### Task 2: Business service freshness, Trust Recovery, Fix First, and benchmarks

**Files:**
- Create: `apps/business-mobile/services/intelligenceLayer.ts`
- Create: `apps/business-mobile/app/service-freshness.tsx`
- Modify: `apps/business-mobile/app/_layout.tsx`
- Modify: `apps/business-mobile/app/index.tsx`
- Modify: `apps/business-mobile/app/intelligence.tsx`
- Modify: `packages/mobile-core/src/appSearch.ts`

**Interfaces:**
- Consumes: Task 1 RPCs.
- Produces: claimed-location service update UI and Business projections.

- [ ] **Step 1: Extend the audit with failing Business UI assertions**
- [ ] **Step 2: Observe failure** for missing service update and Trust Recovery/Fix First controls.
- [ ] **Step 3: Implement additive Business UI**: location selector; event buttons for cleaned/restocked/inspected/repaired/deep-cleaned/renovated/closed/reopened; optional note; current freshness/provenance; recent service history; Trust Recovery timeline; Fix First queue; nearby benchmark cards. Existing Business routes/cards remain intact.
- [ ] **Step 4: Verify focused audit pass**.
- [ ] **Step 5: Run Business typecheck plus Business audit chain**.
- [ ] **Step 6: Commit**.

### Task 3: Consumer Kleenest Now, Bathroom Fit, Facility Passport, journeys, and Verified Access

**Files:**
- Create: `apps/consumer-mobile/services/intelligenceLayer.ts`
- Create: `apps/consumer-mobile/app/intelligence.tsx`
- Modify: `apps/consumer-mobile/app/location/[id].tsx`
- Modify: `apps/consumer-mobile/app/passport.tsx`
- Modify: `apps/consumer-mobile/app/preferences.tsx`
- Modify: `apps/consumer-mobile/app/_layout.tsx`
- Modify: `packages/mobile-core/src/appSearch.ts`

**Interfaces:**
- Consumes: `location_kleenest_now`, `location_facility_passport`, `kleenest_verified_access`, existing Passport snapshot.
- Produces: visible confidence/freshness ribbon with evidence source, Bathroom Fit preference storage/client scoring, facility history, journey collection progress, unified access reason.

- [ ] **Step 1: Extend audit with failing Consumer assertions**.
- [ ] **Step 2: Observe failure**.
- [ ] **Step 3: Implement additive cards/routes** without removing detail-page actions, existing Passport, filters, reviews, photos, navigation, or access UI.
- [ ] **Step 4: Verify focused pass**.
- [ ] **Step 5: Run Consumer native typecheck and native trust/map/passport audits**.
- [ ] **Step 6: Commit**.

### Task 4: Fleet route coverage, corridor intelligence, and preferred access context

**Files:**
- Create: `apps/fleet-mobile/services/routeReliefIntelligence.ts`
- Create: `apps/fleet-mobile/app/coverage.tsx`
- Modify: `apps/fleet-mobile/app/index.tsx`
- Modify: `apps/fleet-mobile/app/nearby.tsx`
- Modify: `apps/fleet-mobile/app/_layout.tsx`
- Modify: `packages/mobile-core/src/appSearch.ts`

**Interfaces:**
- Consumes: `fleet_route_relief_coverage`, `kleenest_verified_access`.
- Produces: coverage score, trusted-stop count, longest uncovered interval estimate from scheduled stop spacing, low-coverage segments, preferred-access indication; it does not claim live route optimization when route geometry/timing is unavailable.

- [ ] **Step 1: Extend audit with failing Fleet coverage assertions**.
- [ ] **Step 2: Observe failure**.
- [ ] **Step 3: Implement additive Route Relief coverage UI** while retaining all dispatch/execution controls.
- [ ] **Step 4: Verify focused pass**.
- [ ] **Step 5: Run Fleet typecheck and Fleet operational/intelligence audits**.
- [ ] **Step 6: Commit**.

### Task 5: Owner Platform Graph, Why Inspector, Launch Readiness, and policy controls

**Files:**
- Create: `apps/platform-mobile/services/intelligenceLayer.ts`
- Create: `apps/platform-mobile/app/intelligence.tsx`
- Modify: `apps/platform-mobile/app/control.tsx`
- Modify: `apps/platform-mobile/app/_layout.tsx`
- Modify: `packages/mobile-core/src/appSearch.ts`

**Interfaces:**
- Consumes: `owner_intelligence_overview`, `owner_explain_location_intelligence`, policy CRUD RPCs from Task 1.
- Produces: ecosystem counts/flows, location explainability, market readiness metrics, editable thresholds/weights. Existing Owner control surfaces remain present.

- [ ] **Step 1: Extend audit with failing Owner assertions**.
- [ ] **Step 2: Observe failure**.
- [ ] **Step 3: Implement additive Owner intelligence workspace** with read-only graph/readiness cards and narrowly scoped policy editing.
- [ ] **Step 4: Verify focused pass**.
- [ ] **Step 5: Run Owner typecheck and admin/control-plane audits**.
- [ ] **Step 6: Commit**.

### Task 6: Cross-app convergence and release

**Files:**
- Modify: `scripts/intelligence-layer-convergence-audit.mjs`
- Modify: `packages/mobile-core/src/appSearch.ts`
- Create: `progress.md`

**Interfaces:**
- Verifies all Task 1-5 interfaces and UI-preservation tokens.

- [ ] **Step 1: Assert all approved feature names and existing key UI routes coexist**.
- [ ] **Step 2: Run `npm run audit`, all four typechecks, web exports, security/CodeQL, and migration verification**.
- [ ] **Step 3: Open/refresh short-lived PR, require final-SHA green checks, merge to `main`, verify temporary branch absent**.
- [ ] **Step 4: Verify OTA compatibility/publish workflow and web/direct installer convergence; do not require a new APK unless native-diff classification says otherwise**.

## Externally Observable Decisions

- Default service-freshness decay is policy-driven and bounded; Business can report service immediately, while independent verification is never synthesized.
- Initial Bathroom Fit preferences are practical amenity/accessibility preferences only; no sensitive personal-health inference is stored.
- Fleet coverage uses existing route stops/timing and trusted-location evidence; it is labeled coverage intelligence, not full route optimization.
- Launch Readiness is descriptive by metric/threshold and does not hide raw metrics behind a single opaque score.
- Existing UI is additive-only for this release.
