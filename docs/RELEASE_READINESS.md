# Kleenest release readiness

**Policy baseline:** 2026-09-05

This is the engineering release ledger for the four Android applications. It separates code/build readiness from Play Console policy/reviewer work so a green CI run is not mistaken for store approval.

## Verified native baseline

Four-app Android workflow run `33989915793` on commit `15417471c4fa5073a2a8fd3edaf2232b373201d9` completed successfully before the cleanup wave began.

For Consumer, Business, Fleet and KleenestOS, that run verified:

- product/app contract and TypeScript checks;
- clean Expo Android prebuild;
- Kleenest launcher artwork;
- no development-only Expo runtime in the release dependency graph;
- release APK compilation;
- expected package ID;
- embedded production JS bundle and production Supabase endpoint;
- ARM64 and x86_64 React Native/Hermes runtime presence;
- non-debuggable release packaging;
- Android 16 emulator installation and startup survival;
- Consumer `kleenest://explore` deep-link startup;
- verified artifact staging/upload.

That evidence proves installability/startup for those exact APKs. It does not replace production AAB generation or Play Console review.

## App status

| App | Package | Native APK smoke | Production EAS AAB profile | Major Play review items |
| --- | --- | --- | --- | --- |
| Consumer | `com.kleenest.app` | Passed | Configured | Data Safety, account deletion, UGC/moderation, background location, store listing, reviewer access |
| Business | `com.kleenest.business` | Passed | Configured | Data Safety, background location, business reviewer access, billing/entitlement declarations, store listing |
| Fleet | `com.kleenest.fleet` | Passed | Configured | Data Safety, background location, restricted/operator reviewer access, store listing |
| KleenestOS | `com.kleenest.platform` | Passed | Configured | Data Safety if Play-distributed, restricted/operator reviewer access, store listing/distribution decision |

## 2026 Google Play technical baseline

For phone/tablet apps submitted on or after August 31, 2026:

- new apps and updates must target Android 16 / API level 36 or higher;
- new Play apps publish using Android App Bundles;
- new apps use Play App Signing;
- production version codes must increase for updates.

Canonical references:

- https://developer.android.com/google/play/requirements/target-sdk
- https://developer.android.com/guide/app-bundle
- https://developer.android.com/studio/publish/upload-bundle

The compliance matrix records target SDK 36. Native release workflows must also inspect the generated artifact so target SDK is proven from the produced binary rather than inferred from framework version.

## Public legal resources

Canonical source files:

- `public/legal/privacy.html`
- `public/legal/account-deletion.html`
- `public/legal/terms.html`
- `public/legal/community-guidelines.html`

Expected public paths after the Consumer Pages/installer deployment on `main`:

- `https://matthagersenior.github.io/Kleenest_Production/legal/privacy.html`
- `https://matthagersenior.github.io/Kleenest_Production/legal/account-deletion.html`
- `https://matthagersenior.github.io/Kleenest_Production/legal/terms.html`
- `https://matthagersenior.github.io/Kleenest_Production/legal/community-guidelines.html`

These URLs must be verified publicly after the cleanup branch is merged/deployed and before they are entered in Play Console.

## Background location gate

Consumer, Business and Fleet request `ACCESS_BACKGROUND_LOCATION`. Google Play treats background location as sensitive and requires a core-functionality justification plus review evidence.

Per affected package, submission is blocked until all of the following are complete:

- one clearly identified user-facing core feature that requires background location;
- foreground/less-sensitive alternatives considered and documented;
- prominent in-app disclosure shown in normal usage before the runtime permission flow;
- disclosure explicitly says `location` and explains use in the background / when the app is closed or not in use;
- privacy policy and store listing accurately describe the use;
- Play Console sensitive-permission declaration completed;
- short Android review video demonstrates the feature, prominent disclosure, and permission prompt;
- Data Safety answers match the final artifact and backend behavior.

Canonical reference:

- https://support.google.com/googleplay/android-developer/answer/9799150

KleenestOS does not request background location and the audit should fail if that permission is introduced without an explicit policy decision.

## Consumer account deletion

Consumer enables account creation, so Play requires deletion initiation both in-app and through an external web resource.

Engineering surfaces:

- in-app route: `apps/consumer-mobile/app/account-deletion.tsx`;
- public resource: `public/legal/account-deletion.html`;
- operational/backend deletion workflow is documented in the Play submission runbook.

Before submission, test the complete lifecycle on a disposable account, including backend processing and removal/de-identification of associated data subject to legitimate retention rules.

Canonical reference:

- https://support.google.com/googleplay/android-developer/answer/13327111

## Data Safety

Every Play-published package on closed/open/production tracks needs a package-specific Data Safety declaration unless an applicable Play exception applies. Declarations must account for Kleenest-authored code, backend flows and third-party SDK behavior.

Engineering worksheet:

- `docs/play-store/DATA_SAFETY.md`

Canonical reference:

- https://support.google.com/googleplay/android-developer/answer/10787469

## Store listing assets

For every public store listing prepare at minimum:

- 512×512 Play store icon;
- 1024×500 feature graphic;
- at least two compliant screenshots;
- app name, short description and full description;
- support/contact information;
- privacy policy URL;
- content rating and required App content declarations.

Use actual production UI and remove private data, internal IDs, debug UI, test credentials and unsupported claims.

Canonical reference:

- https://support.google.com/googleplay/android-developer/answer/9866151

## Testing-track gate

If the Play developer account is a **personal account created after November 13, 2023**, Google currently requires a closed test with at least 12 testers continuously opted in for at least 14 days before applying for production access.

Canonical reference:

- https://support.google.com/googleplay/android-developer/answer/14151465

Do not assume this gate applies until the Play Console account type/creation date is confirmed.

## Remaining engineering work before Play upload

1. Make repo hygiene and Play matrix audits green on the cleanup head.
2. Prove generated Android `targetSdkVersion` is at least 36 in native release workflow output.
3. Consolidate the duplicate Consumer-only APK build path into the four-app family workflow without breaking Pages/legal deployment.
4. Reconcile `DATA_SAFETY.md` with the actual background-location permissions and all four packages.
5. Verify legal URLs publicly after `main` deployment.
6. Generate production AABs from EAS production profiles after final app-content/policy review.
7. Use Play internal/closed testing to inspect generated Play APKs and exercise authentication, permissions, offline/degraded-network paths, QR, maps and operator workflows on physical devices.

## Release rule

A release is not “Play ready” solely because CI is green. Play readiness requires both:

- **engineering evidence** — build, binary, target SDK, signing/package, startup and feature-authority verification; and
- **console/policy evidence** — listing, privacy/Data Safety, sensitive-permission declarations, reviewer access, content rating, testing-track eligibility and zero unresolved Play warnings.
