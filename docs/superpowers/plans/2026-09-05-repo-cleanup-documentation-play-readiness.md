# Repository Cleanup, Documentation, and Google Play Readiness Plan

**Date:** 2026-09-05
**Branch:** `parity/deep-reconciliation-20260905`
**Baseline:** `15417471c4fa5073a2a8fd3edaf2232b373201d9` — all four Android APKs passed build, binary verification, and Android 16 startup smoke.

## Objective

Clean the canonical `Kleenest_Production` monorepo without regressing the verified four-app family, make the repository understandable and maintainable, and convert the existing Play Store work into a current 2026 release-readiness system for Consumer, Business, Fleet, and KleenestOS.

## Guardrails

- Preserve the four canonical mobile workspaces:
  - `apps/consumer-mobile`
  - `apps/business-mobile`
  - `apps/fleet-mobile`
  - `apps/platform-mobile`
- Preserve the root web runtime and Supabase source while parity/source-ownership gaps remain recorded in the capability ledger.
- Do not delete historical scripts or build records until references are checked.
- Do not add signing keys, service-role keys, or other secrets to Git.
- Production Google Play artifacts are AABs; verified APKs remain device-QA/sideload artifacts.
- Re-run CI/product parity after repo/config changes and re-run native release verification after any app/build-system change that can affect the binaries.

## Task 1 — Repository hygiene baseline

**Files**
- Modify: `.gitignore`
- Delete: `apps/consumer-mobile/.env`
- Create: `scripts/repo-hygiene-audit.mjs`
- Modify: `package.json`

**Actions**
1. Remove the tracked Consumer `.env`; its values are public identifiers and belong in `.env.example`, CI/EAS environment configuration, or app configuration rather than a tracked environment file.
2. Expand ignore coverage for all generated Expo/Android/iOS/build outputs across all four apps.
3. Add a deterministic hygiene audit that rejects tracked-style environment files, signing material, generated native/build directories, missing canonical docs, and inconsistent Play package metadata.
4. Wire the hygiene and Play matrix audits into the root audit command.

## Task 2 — Canonical repository documentation

**Files**
- Replace: `README.md`
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/RELEASE_READINESS.md`

**Actions**
1. Replace the placeholder README with the canonical monorepo guide: app family, package IDs, architecture, local setup, environment policy, common verification commands, build/release flow, Supabase ownership, and documentation index.
2. Document boundaries between Consumer, Business, Fleet, KleenestOS, shared packages, root web runtime, Supabase, scripts/config, and legacy/reference material.
3. Record release evidence and remaining release responsibilities without claiming policy approval that has not happened in Play Console.

## Task 3 — 2026 Google Play compliance alignment

**Files**
- Modify: `config/play-store-matrix.json`
- Modify: `scripts/play-store-matrix-audit.mjs`
- Replace/update: `docs/play-store/PLAY_SUBMISSION.md`
- Review/update: `docs/play-store/DATA_SAFETY.md`

**Actions**
1. Correct the KleenestOS Android package from stale `com.kleenest.owner` to verified `com.kleenest.platform`.
2. Require Android API 36 or newer for new apps/updates as of August 31, 2026.
3. Require a production AAB/store profile for every Play-distributed app.
4. Keep Consumer account-deletion in-app + public URL checks.
5. Add explicit background-location review requirements for Consumer, Business, and Fleet: core-purpose justification, prominent disclosure, Play permission declaration, reviewer video, and privacy-policy disclosure.
6. Record Data Safety and privacy-policy requirements per package.
7. Record Play App Signing / App Bundle requirements and tester-track requirements where applicable to the developer account.

## Task 4 — Release profile and package verification

**Files**
- Review: `apps/*/app.config.ts`
- Review: `apps/*/eas.json`
- Modify only if audit finds drift.

**Actions**
1. Verify the four package IDs:
   - Consumer: `com.kleenest.app`
   - Business: `com.kleenest.business`
   - Fleet: `com.kleenest.fleet`
   - KleenestOS: `com.kleenest.platform`
2. Verify all four production EAS profiles use store distribution, remote versioning/auto-increment, and Android App Bundle output.
3. Add automated checks rather than changing already-correct build profiles.
4. Verify target SDK from generated Android configuration/build output rather than assuming it from Expo SDK alone.

## Task 5 — Historical/stale artifact cleanup

**Candidates to inspect before deleting or archiving**
- `build-requests/android-apk-2026-09-03.md`
- `ota-family-trigger.txt`
- one-off `scripts/apply-consumer-*` scripts
- `scripts/app-icon.base64`
- superseded release notes/plans

**Actions**
1. Search package scripts and workflows for every candidate.
2. Keep anything still used by install/postinstall, CI, Pages, OTA, or canonicalization workflows.
3. Move historical-only material into a documented archive or delete only when provenance is preserved elsewhere.
4. Do not remove root web/runtime or backend sources merely because they are not part of the four mobile app directories.

## Task 6 — Verification and release handoff

**Verification**
- `node scripts/repo-hygiene-audit.mjs`
- `node scripts/play-store-matrix-audit.mjs`
- `npm run audit`
- Consumer, Business, Fleet, Owner typechecks
- Product parity / critical path / operator / Fleet offline audits
- Production CI
- App Family Product Parity
- Android family build + Android 16 startup smoke after any build-affecting change

**Play Console handoff**
1. Generate/upload production AABs, not the sideload APKs.
2. Complete per-package Data Safety forms and privacy policy URL.
3. Complete sensitive/background-location declarations for the three apps that request background location.
4. Prepare store icon, feature graphic, screenshots, descriptions, content rating, app access/reviewer credentials, and support contact.
5. If the developer account is a personal account created after November 13, 2023, satisfy the required closed-test gate before production access.

## Definition of done for this cleanup wave

- No tracked environment/signing/generated-native artifacts violate repo policy.
- README and architecture/release docs describe the canonical four-app system accurately.
- Play matrix matches the verified package IDs and 2026 API/AAB requirements.
- Automated audits fail on future package/build/profile/compliance drift.
- CI/product parity are green on the cleanup head.
- Any build-affecting change is followed by fresh four-app Android release smoke evidence.
