# Kleenest Platform Hardening & Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the current semi-working four-app baseline, fix authority/navigation/store-safety defects, complete missing Owner/Fleet/Business capabilities, establish continuous progression supply and verified OTA, then converge the proven apps into the Kleenest_Production monorepo without regressions.

**Architecture:** Keep the standalone Consumer, Business, Fleet and Owner repositories as rollback-safe production candidates while implementing bounded fixes against canonical Supabase authority. New shared behavior is designed around cross-platform contracts so Android can ship first and the same interfaces can later move into monorepo packages and receive iOS adapters without product-logic rewrites.

**Tech Stack:** Expo SDK 57, React Native 0.86, Expo Router, Supabase/Postgres RPC authority, Expo Updates/EAS, GitHub Actions, MapLibre, Expo Location, Expo Notifications, React Native QR SVG.

**Spec:** Approved Approach A in the 2026-09-05 Kleenest platform-hardening conversation; Business QR Studio visual editor design at `Kleenest_Business/docs/superpowers/specs/2026-09-04-qr-studio-visual-editor-design.md`.

## Global Constraints

- Preserve rollback references for Consumer `a27b6508a8a0a33d87f1a0aac72a385c99d3d7f4`, Business `ec5d05b67bf9ce2c6e8151a85e6fae0230fd9de4`, Fleet `17ae33fc19a05133eaacb992223f14ef1e0a3c88`, Owner `36db471d332310ec0d9903393f9348693f08bb6b`.
- Mutating Owner/Business/Fleet operations remain server-authorized and audited; clients must not create weaker parallel authorization rules.
- `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` are blocked unless a future explicit capability proves a need.
- Live Network uses location + notification capabilities, not microphone or overlay permissions.
- Android Play readiness is first; iOS-compatible abstractions are required for new shared behavior.
- OTA channels are app-specific and must be verified against project/channel/runtime/source SHA before certification.
- No replacement progression runtime: reuse canonical progression events, objectives, quests, contests, geofence and QR triggers.
- No replacement QR runtime: reuse canonical QR code, version, attribution, redemption and engagement authorities.

---

### Task 1: Owner authority convergence

**Files:**
- Modify: `Kleenest_Owner/src/services/ownerAuthorization.ts`
- Modify: `Kleenest_Owner/scripts/owner-parity-audit.mjs`

**Interfaces:**
- Consumes: `admin_authorization_v1()` and server `is_platform_owner_session()` semantics.
- Produces: `requireOwnerAuthority()` / compatible `requirePlatformOwner()` behavior that accepts every server-authorized Owner session and still rejects unauthorized users.

- [ ] Add a parity-audit assertion that Owner mutation guards use canonical `authorized` authority rather than requiring only the literal profile flag.
- [ ] Verify the audit fails against the preserved baseline.
- [ ] Implement canonical Owner authority convergence.
- [ ] Run Owner audit + typecheck in CI and verify green.

### Task 2: Owner Progression Studio CRUD

**Files:**
- Create/modify canonical Supabase Owner progression RPCs.
- Modify: `Kleenest_Owner/src/services/ownerEconomy.ts`
- Modify: `Kleenest_Owner/app/progression.tsx`
- Modify: `Kleenest_Owner/scripts/kleenestos-authority-audit.mjs`

**Interfaces:**
- Produces: list/create/update/status/archive/delete controls for platform `progression_objectives_v2`, plus quest visibility and cadence health.

- [ ] Add failing authority-audit coverage for objective CRUD controls and server RPC names.
- [ ] Add audited Owner-only RPCs over canonical progression objectives.
- [ ] Add typed Owner service methods.
- [ ] Add Progression Studio create/edit/status/archive/delete UI and supply-health view.
- [ ] Verify Owner audit + typecheck and targeted SQL behavior.

### Task 3: Continuous progression supply

**Files:**
- Create canonical Supabase progression template/supply tables and Owner RPCs.
- Create canonical scheduled supply-maintenance function and scheduler registration when `pg_cron` is available.
- Extend `Kleenest_Owner/app/progression.tsx`.

**Interfaces:**
- Produces: minimum active/scheduled supply by quest/mission/challenge/journey/campaign/contest, deterministic generation from approved templates, XP/reward-budget guardrails and Owner visibility.

- [ ] Add SQL assertions for missing category supply and idempotency.
- [ ] Add template + supply policy schema with RLS/Owner RPC authority.
- [ ] Add idempotent generator and daily scheduler.
- [ ] Seed safe evergreen/daily/weekly templates without duplicating the existing runtime.
- [ ] Verify repeated generator execution creates no duplicates and maintains configured inventory.

### Task 4: Fleet navigation and authority parity

**Files:**
- Modify: `Kleenest_Fleet/app/auth.tsx`
- Modify: `Kleenest_Fleet/scripts/fleet-parity-audit.mjs`
- Modify: `Kleenest_Fleet/src/services/fleet.ts`
- Modify: Fleet operations/dispatch surfaces as required.

**Interfaces:**
- Produces: single Control Center stack after login, full canonical vehicle/driver/route/maintenance CRUD wrappers and surfaced controls.

- [ ] Add failing audit for login navigation returning to existing root instead of replacing it with a duplicate root.
- [ ] Fix password and Google auth success navigation with back-or-replace semantics.
- [ ] Add audit coverage for update/delete/assignment Fleet RPC wrappers.
- [ ] Add missing typed wrappers and operational controls.
- [ ] Verify Fleet audit + typecheck + Android startup smoke.

### Task 5: Live Network convergence

**Files:**
- Modify Business/Fleet/Consumer app configs and dependencies.
- Create app-specific Live Network services/adapters that converge on canonical geofence + notification RPCs.
- Extend Business/Fleet/Consumer user-facing settings/signal surfaces.

**Interfaces:**
- Produces: permission state, foreground/background geofence event capture where enabled, notification registration, canonical event convergence, destination routing and privacy controls.

- [ ] Add manifest/config audits that reject `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` and require only justified location/notification permissions.
- [ ] Add Business Expo Location/Notifications capabilities with explicit permission copy.
- [ ] Wire canonical geofence events + push token registration.
- [ ] Add health/permission UI and disable background behavior when the user opts out.
- [ ] Verify generated Android manifests and iOS plist configuration.

### Task 6: Business QR Studio visual completion

**Files:**
- Modify: `Kleenest_Business/app/qr-studio.tsx`
- Modify: `Kleenest_Business/src/services/engagement.ts`
- Modify/create QR branding media service as needed.
- Harden Supabase `qr-branding` storage policy/config.

**Interfaces:**
- Produces: color, module/corner/frame/CTA/logo controls, business-logo/custom-logo choices, brand-kit persistence, scan-readiness checks, stable-code mutation, template/version integration and export/share paths.

- [ ] Add failing Business audit for visual design controls and logo support.
- [ ] Add safe QR branding upload + validation contract.
- [ ] Implement live visual editor controls and persisted canonical customization.
- [ ] Enforce readability/contrast/logo-size constraints.
- [ ] Verify Business audit + typecheck and canonical versioning behavior.

### Task 7: UGC, legal and AI safeguards

**Files:**
- Extend Consumer safety/legal surfaces and canonical Supabase safety authorities.
- Add public Terms, Privacy, Community Guidelines and account-deletion web documents/routes.
- Extend AI surfaces with disclosure and report/feedback paths.

**Interfaces:**
- Produces: versioned policy acceptance, report/block/unblock, moderation visibility, UGC guidelines, AI disclosure/flagging and store-accessible legal/account-deletion links.

- [ ] Audit existing report/block/policy schema before creating anything.
- [ ] Add only missing canonical tables/RPCs with RLS and audit history.
- [ ] Wire Consumer report/block/legal UI and policy acceptance.
- [ ] Add AI disclosure + report path to AI surfaces.
- [ ] Verify Production CI and Android startup smoke.

### Task 8: OTA identity and verification

**Files:**
- Modify four app configs/workflows after dedicated Expo project IDs exist.
- Add OTA verification workflow steps and rollback metadata.

**Interfaces:**
- Produces: app-specific EAS project/channel/runtime identity, source-SHA traceability and post-publish verification.

- [ ] Preserve current OTA config as rollback evidence.
- [ ] Create/resolve dedicated Business/Fleet/Owner Expo project IDs.
- [ ] Update configs and workflows to project-specific identity.
- [ ] Publish canary updates and verify project/channel/runtime/source SHA.
- [ ] Promote to production channels only after canary startup verification.

### Task 9: Android Play readiness and iOS contract readiness

**Files:**
- Add production EAS/AAB profiles and release audits per app.
- Add shared cross-platform contract documentation under `Kleenest_Production/docs/`.

**Interfaces:**
- Produces: Play-ready AAB pipeline and documented iOS adapter requirements for location, notifications, auth, QR, maps and safety.

- [ ] Audit manifest permissions, target SDK, signing path, privacy/data-safety inventory and store metadata requirements.
- [ ] Build signed/release AAB candidates.
- [ ] Verify install/runtime behavior with release candidates.
- [ ] Document iOS capability mapping without introducing Android-only business logic.

### Task 10: Monorepo convergence after parity reaches zero

**Files:**
- `Kleenest_Production/apps/{consumer,business,fleet,owner}`
- `Kleenest_Production/packages/{auth,safety,live-network,notifications,progression,qr,maps,supabase,ui,capability-registry}`

**Interfaces:**
- Produces: one monorepo with four isolated app products consuming shared packages and preserving product-specific entitlements.

- [ ] Build parity inventory from the four certified standalone heads.
- [ ] Move shared contracts first, then apps one at a time.
- [ ] Run product-specific CI after each migration.
- [ ] Preserve standalone repositories until monorepo binaries and OTA updates match certified behavior.
