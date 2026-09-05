# Kleenest Monorepo Enterprise, Parity, and Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Fleet/KleenestOS convergence, make Business Standard/Growth/Enterprise and Consumer Family onboarding explicit, enforce complete monorepo parity, and pass per-package Play Store verification.

**Architecture:** `Kleenest_Production` is the sole executable monorepo. Canonical product/tier/role rules are server-authoritative in Supabase, operator apps expose task workflows over those contracts, and root audits fail when a canonical user-facing capability lacks a Production owner or when operator UI regresses to raw payload display.

**Tech Stack:** Expo/React Native, TypeScript, Supabase/Postgres/RLS/RPC, GitHub Actions, EAS Android.

**Spec:** `docs/superpowers/specs/2026-09-05-monorepo-enterprise-parity-play-design.md`

## Global Constraints
- Android target SDK: 36 or newer.
- Business Standard = basic Business features.
- Business Growth + Fleet = up to 5 active locations; >5 users is a Growth/Fleet qualification signal.
- Enterprise + Fleet = more than 5 active locations, with up to 5 assigned users per location and employee/manager/admin/owner capabilities.
- Enterprise UI must support multi-location configuration, cooperation, comparison, engagement, notifications, photos/media, metrics, intelligence, and broader network creation.
- Consumer signup must expose Family intent without self-entitling outside backend/Google Play authority.
- No operator raw JSON/payload presentation.

---

### Task 1: Canonical Business tier and Enterprise location governance
**Files:**
- Create: `supabase/migrations/<timestamp>_business_tier_enterprise_location_governance.sql`
- Modify: `apps/business-mobile/services/product.ts`
- Test: root/operator parity audits

**Interfaces:**
- Produces: server-authoritative tier snapshot, per-location staff/capability contracts, Enterprise portfolio/location configuration contracts.

- [ ] Inspect existing Business/Enterprise tables and RPCs for reusable authority.
- [ ] Add only missing canonical contracts; do not duplicate existing authority.
- [ ] Enforce >5 active locations => Enterprise qualification and <=5 locations + >5 users => Growth/Fleet qualification signal while keeping purchase entitlement explicit.
- [ ] Enforce Enterprise per-location assignment cap and role scope server-side.
- [ ] Source-control and verify migration/RLS/grants.

### Task 2: Business Standard/Growth/Enterprise task UX
**Files:**
- Modify: `apps/business-mobile/app/index.tsx`
- Modify: `apps/business-mobile/app/growth.tsx`
- Modify: `apps/business-mobile/app/enterprise.tsx`
- Modify: `apps/business-mobile/app/_layout.tsx`
- Modify: `apps/business-mobile/services/product.ts`

**Interfaces:**
- Consumes: Task 1 tier/Enterprise RPCs.
- Produces: discoverable Standard/Growth/Enterprise workflow surfaces.

- [ ] Replace raw payload rendering with readable operational summaries and controls.
- [ ] Make current tier, qualification reason, location/user thresholds, Fleet access, and upgrade/eligibility state explicit.
- [ ] Add Enterprise portfolio, location configuration, staff roles, cross-location comparison/cooperation, engagement configuration, and network/campaign actions.
- [ ] Verify every Business user-facing canonical domain has a route owner.

### Task 3: Fleet complete monorepo convergence
**Files:**
- Modify/Create under `apps/fleet-mobile/app/`: `operations.tsx`, `execution.tsx`, `signals.tsx`, `metrics.tsx`, `premium.tsx`, `enterprise.tsx`, `capabilities.tsx`, `sync.tsx`, navigation/index.
- Modify: `apps/fleet-mobile/services/product.ts`
- Create/modify: `apps/fleet-mobile/services/parity.ts`, `signals.ts`, `liveNetworkMotifs.ts`
- Modify: `apps/fleet-mobile/package.json`, `app.config.ts`

**Interfaces:**
- Produces: complete Fleet map/dispatch/geofence/metrics/goals/premium/Enterprise/preventive workflow set.

- [ ] Port all standalone Fleet authority calls missing from Production.
- [ ] Ensure map route planning and first-open pin convergence are included.
- [ ] Add custom metrics/goals/leaderboards, premium-recipient administration, preventive route work, Enterprise network intelligence, and offline recovery.
- [ ] Replace any raw payload output with task-oriented controls and readable summaries.

### Task 4: KleenestOS complete convergence
**Files:**
- Modify/Create under `apps/platform-mobile/app/`: `access.tsx`, `audit.tsx`, `capabilities.tsx`, `data.tsx`, `operations.tsx`, `progression.tsx`, `moderation.tsx`, `intelligence.tsx`, `businesses.tsx`, navigation/index.
- Modify: `apps/platform-mobile/services/product.ts`
- Modify: `apps/platform-mobile/app.config.ts`, `package.json`

**Interfaces:**
- Produces: platform-owner user access, capability/schema audits, progression studio, ingestion repair, moderation, Business governance, and actionable intelligence.

- [ ] Converge standalone Owner/KleenestOS authority functions.
- [ ] Replace ID/JSON tools with searchable queues, guided actions, evidence, confirmation and audit outcomes.
- [ ] Align app identity to `KleenestOS` / `com.kleenest.owner`.

### Task 5: Consumer Family onboarding
**Files:**
- Create: `apps/consumer-mobile/app/signup.tsx`
- Modify: `apps/consumer-mobile/app/index.tsx`, `_layout.tsx`, membership/family routes if needed.

**Interfaces:**
- Produces: Individual vs Family signup intent recorded in auth metadata without direct entitlement mutation.

- [ ] Verify Family signup is discoverable from signed-out Consumer UX.
- [ ] Verify intent routes to Family setup after account creation.
- [ ] Verify no client-side Family entitlement assignment exists.

### Task 6: Root parity and UX closure gates
**Files:**
- Modify: `config/product-parity.json`
- Modify: `scripts/product-parity-audit.mjs`
- Create/modify: `scripts/operator-ux-parity-audit.mjs`, `scripts/monorepo-closure-audit.mjs`
- Modify: root `package.json`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces: CI failure for route/service/native/runtime/parity gaps or raw JSON operator presentation.

- [ ] Expand parity to Consumer, Business, Fleet, Owner/KleenestOS and Enterprise workflow families.
- [ ] Require standalone-reference capability clusters to have Production routes/services/config.
- [ ] Require all canonical DB domains to have active ownership contracts.
- [ ] Put every parity audit in the root `npm run audit` and CI chain.

### Task 7: Per-package Play Store matrix
**Files:**
- Create/modify: `config/play-store-matrix.json`, `scripts/play-store-matrix-audit.mjs`
- Modify each app `app.config.ts` and legal/account routes as needed.

**Interfaces:**
- Produces: per-package compliance failure for package identity, target SDK, legal/deletion, UGC, billing, permissions, or background-location disclosure gaps.

- [ ] Verify API 36 target requirement.
- [ ] Verify background location only where justified and disclosed.
- [ ] Verify Owner has no background location.
- [ ] Verify Consumer UGC report/block/policy/moderation and Family billing boundary.
- [ ] Verify public legal/deletion files for all packages.

### Task 8: Full verification and artifact preflight
**Files:**
- Fix any files exposed by current CI/audit/typecheck/build failures.

**Interfaces:**
- Produces: green integrated monorepo verification and current-head Android artifact readiness.

- [ ] Run/fetch root CI and product parity on the integrated head.
- [ ] Fix all typecheck/audit/build failures.
- [ ] Verify Business/Fleet/KleenestOS package configs and native dependency graphs.
- [ ] Verify signed AAB/standalone artifact workflows at the final integrated head.
- [ ] Reconcile Supabase security advisors and live/source migration parity.
- [ ] Verify public legal/deletion URLs and document remaining physical-device-only smoke evidence if connector tooling cannot execute it.
