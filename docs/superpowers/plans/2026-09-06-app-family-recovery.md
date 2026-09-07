# Kleenest App Family Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce four installable, non-regressed Android APKs from Production with first-class auth, stable Live Network behavior, restored operator capability parity, and deterministic secure builds.

**Architecture:** Keep Consumer's mature Production implementation. Converge the richer standalone Business/Fleet/Owner implementations into their Production workspaces while retaining monorepo shared-core/backend authority and package identities. Treat `operator-functional-parity-audit.mjs` plus app-specific auth/runtime smoke contracts as release gates.

**Tech Stack:** Expo Router, React Native, Supabase Auth/RPC, Expo/EAS Android builds, Firebase/FCM, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-06-app-family-recovery-design.md`

## Global Constraints
- Work only on `hotfix/regression-repair-20260906`; do not merge to main until verified.
- Never commit `google-services.json` or privileged credentials.
- Preserve package IDs: Consumer `com.kleenest.app`, Business `com.kleenest.business`, Fleet `com.kleenest.fleet`, Owner `com.kleenest.platform`.
- Privileged Business/Fleet/Owner actions remain backend-authorized.
- Do not weaken parity audits to hide missing functionality.
- No release claim without fresh CI/APK evidence.

---

### Task 1: Restore first-class operator authentication
**Files:** Business/Fleet/Owner auth/account/layout files and focused auth audit.
**Produces:** startup auth gate, Google OAuth, email/password, sign-up where appropriate, visible password/input text.
- [ ] Add failing source audit requiring auth route, Google provider, app-specific redirect scheme, show/hide control, explicit input color.
- [ ] Verify audit fails against current Production operator apps.
- [ ] Converge standalone Business/Owner auth implementations and Fleet equivalent into Production, adapting shared-client imports only where required.
- [ ] Make Account point to/session-management rather than being the only sign-in route.
- [ ] Run operator typecheck and auth audit.

### Task 2: Restore Business feature and presentation parity
**Files:** `apps/business-mobile/app/*`, `services/*`, component/theme files, tsconfig/package config if required.
**Produces:** QR designer/lifecycle, notifications, engagement, trust/prevention/governance/enterprise economy, rich Live Network and richer navigation/presentation.
- [ ] Add/retain the richer standalone Business screens required by the parity contract.
- [ ] Port supporting services/components and resolve `@/*` aliases or imports deterministically.
- [ ] Preserve Production backend authority/RPC names where they are newer than standalone code.
- [ ] Run Business typecheck and operator functional parity audit; fix functional failures rather than audit tokens.

### Task 3: Restore Owner/KleenestOS feature, presentation, and crash safety
**Files:** `apps/platform-mobile/app/*`, `services/*`, `components/*`, auth/layout/runtime guard.
**Produces:** richer KleenestOS command center, progression/data/business administration, safe messaging/Live Network entry, stable navigation.
- [ ] Converge the standalone KleenestOS component system and richer command center.
- [ ] Restore missing progression/data/business administration controls and owner services.
- [ ] Ensure every Live Network/messaging route exists and catches runtime/native failures instead of terminating the process.
- [ ] Run Owner typecheck and parity audits.

### Task 4: Restore Fleet authentication and remaining operational parity
**Files:** `apps/fleet-mobile/app/*`, supporting services/config.
**Produces:** discoverable auth, full map/dispatch/Live Network operations, premium/enterprise controls.
- [ ] Converge the standalone Fleet auth/navigation/operational surfaces where Production is thinner.
- [ ] Fix exact remaining functional parity gaps such as Premium grant wording only when the underlying action is already wired.
- [ ] Verify map/dispatch/execution/signals/metrics/sync routes remain intact.
- [ ] Run Fleet typecheck and parity audit.

### Task 5: Deterministic build and APK verification
**Files:** family build workflows and build audits only if failures identify a build-boundary defect.
**Produces:** four stable EAS-signed APK artifacts.
- [ ] Run Production CI, App Family Product Parity, Native Secret Hygiene, auth/runtime audits.
- [ ] Run EAS Signed Family Repair APKs for all four apps.
- [ ] Verify each artifact package ID, non-debug signing SHA-1, ZIP integrity, Firebase config inclusion, and launch-critical native configuration.
- [ ] Download and expose the four verified APK artifacts for device installation.
