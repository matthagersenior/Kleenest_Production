# Kleenest Production

Canonical shipping repository for the Kleenest platform.

Kleenest is a local-business discovery and trust platform centered on reliable restroom information, community evidence, QR interactions, progression/rewards, business operations, fleet execution, and platform administration. This monorepo contains the four Android applications, shared mobile code, the web runtime, Supabase source, release automation, and compliance/audit tooling.

## App family

| App | Workspace | Android package | Primary purpose |
| --- | --- | --- | --- |
| Consumer | `apps/consumer-mobile` | `com.kleenest.app` | Discovery, maps, location details, verified visits/check-ins, reviews, trust, community, progression, games, notifications, QR and account controls |
| Business | `apps/business-mobile` | `com.kleenest.business` | Business/location management, QR Studio, trust/remediation operations, analytics, governance/reporting, Live Network, campaigns and enterprise economy |
| Fleet | `apps/fleet-mobile` | `com.kleenest.fleet` | Map-based planning, routes/dispatch, drivers/vehicles, maintenance, geofences, operational telemetry and offline field execution |
| KleenestOS / Owner | `apps/platform-mobile` | `com.kleenest.platform` | Platform authorization, business/network administration, moderation, progression economy, data workbench, operations and system health |

Enterprise is a capability surface within the Business experience rather than a fifth application.

## Repository layout

- `apps/` — the four canonical Expo/React Native applications.
- `packages/mobile-core/` — shared mobile primitives and cross-app contracts.
- `src/` — the retained root web runtime. Do not delete it as “legacy” while web/source-ownership parity remains active.
- `supabase/` — source-controlled migrations and Edge Functions that belong to the canonical backend.
- `config/` — capability, production-environment and Play compliance matrices.
- `scripts/` — deterministic product, security, parity, release and migration audits.
- `public/legal/` — public privacy, terms, community-guideline and account-deletion resources deployed with the Consumer Pages/installer site.
- `docs/` — architecture, release, Play submission, data safety, plans and reconciliation records.
- `.github/workflows/` — CI, product parity, Android family builds, OTA and deployment automation.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for ownership boundaries and [`docs/RELEASE_READINESS.md`](docs/RELEASE_READINESS.md) for the current release gate.

## Local setup

Requirements:

- Node.js 22
- npm
- Java 17 for native Android work
- Android SDK/emulator for local native builds
- Expo/EAS CLI when running EAS workflows locally

Install dependencies:

```bash
npm install --no-audit --no-fund
```

Copy `.env.example` to a local `.env` only when a command needs environment variables. Never commit `.env` files, signing material, service-role credentials, private keys, APKs, AABs, or generated native directories.

Public Expo/Supabase publishable identifiers may appear in application configuration and CI where required. Supabase service-role keys and other privileged credentials must remain in approved secret stores only.

## Common verification

```bash
# Full authority/product audit suite
npm run audit

# Consumer typecheck
npm run native:typecheck

# Business + Fleet + Owner typechecks
npm run operator:typecheck

# Repository hygiene
node scripts/repo-hygiene-audit.mjs

# Google Play compliance matrix
node scripts/play-store-matrix-audit.mjs

# Cross-app product contract
node scripts/product-parity-audit.mjs
node scripts/capability-parity-ledger-audit.mjs
node scripts/app-family-critical-path-audit.mjs
node scripts/operator-functional-parity-audit.mjs
node scripts/fleet-extended-operator-audit.mjs
node scripts/fleet-offline-recovery-audit.mjs
```

The CI source of truth is `.github/workflows/ci.yml` plus `.github/workflows/product-parity.yml` and `.github/workflows/android-family.yml`.

## Android release model

There are two artifact classes:

1. **Verified APKs** — installable device-QA/sideload artifacts. The Android family workflow builds release APKs, inspects the embedded bundle/package/native libraries, installs them on an Android 16 emulator, performs startup smoke tests, and uploads successful artifacts.
2. **Production AABs** — Google Play publishing artifacts. Each app's EAS `production` profile uses store distribution, remote versioning/auto-increment, and Android `app-bundle` output.

Do not upload the QA APK as the normal new-app production artifact to Google Play. Build the production AAB after the Play readiness checklist is complete.

## Backend and authority

The production Supabase project is the application authority for authentication, data, RPCs, storage, realtime and Edge Functions. Client code must not duplicate privileged business rules that are intended to be server authoritative.

Backend/source parity is tracked explicitly. A live function or database object that exists in production but is not yet source-controlled should be reconciled rather than silently replaced or deleted.

## Google Play readiness

The machine-readable policy matrix is [`config/play-store-matrix.json`](config/play-store-matrix.json). The corresponding audit is [`scripts/play-store-matrix-audit.mjs`](scripts/play-store-matrix-audit.mjs).

Submission documentation:

- [`docs/play-store/PLAY_SUBMISSION.md`](docs/play-store/PLAY_SUBMISSION.md)
- [`docs/play-store/DATA_SAFETY.md`](docs/play-store/DATA_SAFETY.md)
- [`docs/RELEASE_READINESS.md`](docs/RELEASE_READINESS.md)

The Consumer, Business and Fleet apps request background location for explicit user-facing features. Google Play review therefore requires the relevant permission declaration, prominent disclosure, privacy-policy coverage and review evidence before those packages can be considered submission-complete.

## Change discipline

- Keep Consumer as the highest-polish public product surface.
- Keep Business/Fleet/Owner authority chains server-backed and refresh authoritative state after mutations.
- Prefer consolidation over duplicate screens/routes.
- Add regression audits when fixing semantic or authority bugs.
- Check references before deleting historical scripts or workflows.
- Re-run native Android family verification after build-affecting changes.

## Security

Do not commit secrets. If a privileged credential is accidentally committed, removing the file is not sufficient—rotate the credential and purge/handle history appropriately.

The repository intentionally contains public client identifiers required by shipped applications; public/publishable keys are not interchangeable with service-role or administrative credentials.
