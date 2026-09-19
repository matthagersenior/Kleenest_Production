# Intelligence Platform Quality Pass Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge Kleenest shared intelligence into typed, fast, observable contracts that are reused by the four apps and safely exposed through REST, SDK, MCP, webhooks, and Owner controls.

**Architecture:** Preserve Supabase as the canonical evidence/intelligence authority and keep Consumer, Business, Fleet, and Owner as projections over that authority. Add typed contracts, bundled reads, a small intelligence change outbox/cache revision model, and platform distribution adapters without creating parallel scoring, progression, routing, or Owner control planes.

**Tech Stack:** PostgreSQL/Supabase RPCs and Edge Functions, TypeScript, Expo/React Native, npm workspaces, GitHub Actions.

## Global Constraints

- No second XP/League/mission authority; `progression_events_v2` remains canonical.
- No second route engine or recommendation truth.
- No app-to-app dependencies; shared behavior flows through canonical backend contracts/shared packages.
- AI/MCP consumes and explains deterministic Kleenest intelligence; it never invents source facts or scores.
- Public integrations receive safe projections/provenance only; private evidence and Owner-only policy remain private.
- Owner remains the audited platform-wide control plane.
- Database migrations remain additive and production release order stays database-before-OTA.
- Finished work must merge to `main`; no architectural drift branch remains as the production source.

---

### Task 1: Typed contracts and one recommendation authority

**Files:**
- Modify: `packages/mobile-core/src/intelligence.ts`
- Create: `packages/platform-core/src/intelligence.ts`
- Modify: `packages/platform-core/src/types.ts`
- Modify: `packages/platform-core/src/index.ts`
- Modify: `packages/platform-core/src/recommendations.ts`
- Modify: `supabase/functions/platform-api/index.ts`
- Test: `scripts/intelligence-platform-quality-audit.mjs`

**Interfaces:**
- Consumes: existing intelligence RPCs and `RecommendationCandidate`.
- Produces: concrete versioned public/mobile intelligence interfaces and one pure `rankRecommendations`/normalization authority reused by the API.

- [ ] Add a convergence audit that rejects `Record<string,any>` intelligence projection aliases and duplicate API scoring.
- [ ] Observe the audit fail against current main.
- [ ] Replace placeholder aliases with concrete interfaces and add public-safe intelligence contracts to platform-core.
- [ ] Make Platform API reuse platform-core recommendation normalization/ranking rather than its local scorer.
- [ ] Build platform packages and typecheck mobile workspaces.

### Task 2: Bundled reads, caching, and change outbox

**Files:**
- Create: `supabase/migrations/20260919050000_intelligence_platform_quality_pass.sql`
- Modify: `packages/mobile-core/src/intelligence.ts`
- Test: `scripts/intelligence-platform-quality-audit.mjs`

**Interfaces:**
- Produces: `location_intelligence_bundle(uuid,text[])`, `location_intelligence_batch(uuid[],text[])`, `business_intelligence_bundle(uuid)`, `owner_intelligence_bundle()`, `intelligence_change_outbox`, and revision metadata.
- Mobile helper: coalesced short-lived reads with revision-aware invalidation.

- [ ] Add schema assertions for bundle/batch/outbox/revision contracts.
- [ ] Implement additive SQL functions/tables/triggers with RLS/grants appropriate to existing authorities.
- [ ] Route Consumer/Business/Owner hot reads through bundle RPCs while retaining granular RPCs.
- [ ] Add in-flight request coalescing and bounded stale-while-revalidate cache in mobile-core.
- [ ] Verify security and convergence audits.

### Task 3: REST/SDK/MCP/webhook and Smart Device convergence

**Files:**
- Modify: `supabase/functions/platform-api/index.ts`
- Modify: `packages/sdk-js/src/index.ts`
- Modify: `packages/route-sdk/src/index.ts`
- Modify: `packages/webhook-types/src/index.ts`
- Modify: `docs/platform/openapi-v1.json`
- Modify: `supabase/functions/platform-partner-admin/index.ts`
- Migration: `supabase/migrations/20260919050000_intelligence_platform_quality_pass.sql`

**Interfaces:**
- Adds safe REST/SDK reads for place intelligence/proof/access and route intelligence.
- Adds stable `intelligence.changed` webhook envelope carrying changed dimensions and revision.
- Smart-device events converge into canonical `kleenest_evidence_events` with `partner` provenance and explicit source metadata.
- MCP diagnostics use the same REST endpoints.

- [ ] Add failing distribution assertions.
- [ ] Add authorization/product mapping for new REST routes and SDK methods.
- [ ] Enqueue material intelligence changes to existing partner webhook delivery.
- [ ] Converge device evidence without treating a sensor as independent human confirmation.
- [ ] Verify platform package build and integration diagnostics.

### Task 4: Owner observability, capability-driven search, and domain cleanup

**Files:**
- Modify: `apps/platform-mobile/services/intelligenceLayer.ts`
- Modify: `apps/platform-mobile/app/intelligence.tsx`
- Modify: `packages/mobile-core/src/appSearch.ts`
- Create: `packages/mobile-core/src/locations.ts`
- Create: `packages/mobile-core/src/progression.ts`
- Create: `packages/mobile-core/src/routes.ts`
- Modify: `packages/mobile-core/src/index.ts`
- Modify: `packages/mobile-core/src/publicEntry.ts`
- Migration: `supabase/migrations/20260919050000_intelligence_platform_quality_pass.sql`

**Interfaces:**
- Owner health projection includes contract version, outbox lag/backlog, material-change counts, and intelligence projection health.
- Search index can merge canonical capability entries at runtime while preserving the static offline fallback.
- Existing mobile-core public exports remain source-compatible while implementation moves into domain modules.

- [ ] Add failing Owner/search/domain-boundary assertions.
- [ ] Add Owner intelligence health projection and surface it in Product Truth.
- [ ] Merge capability-derived search entries with the static fallback.
- [ ] Move location/progression/route implementations behind domain modules while keeping public signatures unchanged.
- [ ] Run full CI, platform package build, native/operator typechecks, security gates, and merge to main.

## Externally Observable Decisions

No unresolved product decisions remain for this pass. Public projections intentionally exclude private evidence payloads and Owner policy internals; device signals are provenance-labeled evidence and never count as independent human confirmations.
