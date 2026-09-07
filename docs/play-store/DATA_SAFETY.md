# Kleenest Google Play Data Safety worksheet

**Engineering baseline:** 2026-09-05

This worksheet is the engineering source for Google Play Data Safety declarations. Google Play treats Data Safety at the app/package level, so each Play-distributed Kleenest package must be reconciled separately against its final production AAB, backend flows and third-party SDK behavior.

Do not copy one package's answers into another without reconciling its permissions and features.

## Package inventory

| App | Package | Account creation in app | Background location | Photos/camera | Notifications | UGC |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Consumer | `com.kleenest.app` | Yes | Yes | Yes | Yes | Yes |
| Business | `com.kleenest.business` | No | Yes | Yes | Yes | Business replies/operator content |
| Fleet | `com.kleenest.fleet` | No | Yes | No | Yes | No public UGC |
| KleenestOS | `com.kleenest.platform` | No | No | No | Yes | Moderation/admin access to platform content |

`config/play-store-matrix.json` is the machine-readable companion to this worksheet.

## Global declaration principles

- All developers publishing on Play must complete Data Safety for applicable packages/tracks and provide an accessible privacy policy where required.
- Declare behavior of Kleenest code **and third-party SDKs/services** included in the final artifact.
- Data transmitted off-device to Kleenest/Supabase or a service provider is collected for Data Safety analysis even when it is not sold.
- Determine “shared” versus service-provider processing using Google's definitions; do not assume every processor is sharing and do not omit actual third-party sharing.
- Reconcile the generated Android manifest, dependency graph and network/service inventory immediately before submission.
- If ads, attribution, analytics, crash reporting or billing SDKs are added, re-open this worksheet before release.

Canonical reference: https://support.google.com/googleplay/android-developer/answer/10787469

## Infrastructure to reconcile for every affected package

- Supabase Auth, Postgres/RPC, Realtime and Storage;
- Kleenest Edge Functions and backend notification/AI/reporting paths reached by the app;
- Expo/EAS runtime services actually present in the production AAB;
- Expo/FCM notification transport where push is enabled;
- MapLibre, tile/routing/geocoding providers actually contacted by the package;
- AI providers reached by backend features used by the package;
- Google Play Billing if enabled before release;
- any crash, analytics, attribution or advertising SDK added later.

## Consumer — `com.kleenest.app`

### Likely collected data types

| Play data category | Collected? | Typical purpose | Required / optional |
| --- | --- | --- | --- |
| Email address / user IDs | Yes | Authentication, security, account/support operation | Required for signed-in account; signed-out discovery exists |
| Name / username | Optional | Public contributor identity/community | Optional |
| Profile photo | Optional | Contributor profile | Optional |
| Approximate location | Yes when granted | Nearby discovery, routes, Live Network | Feature dependent |
| Precise location | Yes when granted | Nearby discovery, verified visit/check-in, routes, Live Network | Feature dependent |
| Background location | Yes when Live Network is explicitly enabled/granted | Opt-in restroom-region awareness while the app is not in use | Optional feature |
| Photos | Optional | Avatar, reviews/evidence/contributions | Optional |
| User-generated text/content | Yes | Reviews, profile, messages, support/safety reports, social/community | Optional feature data |
| App interactions | Yes | Saves, check-ins, review/progression/game/preference state | App functionality |
| Device/other identifiers | As required | Push delivery, session/security/service operation | Feature/infrastructure dependent |
| Purchase/entitlement state | Where membership exists | Access control and purchase verification | Account dependent |
| Crash/diagnostic data | Verify final artifact | Reliability/security if a transmitting SDK exists | Artifact dependent |

### Permissions and sensitive data

Current production config includes foreground and background location plus camera access. QR camera access is user initiated. Background location requires a separate Google Play sensitive-permission declaration and must match the prominent disclosure/privacy language.

### Account deletion

Consumer allows account creation. The Play account-deletion requirement therefore applies: users need a discoverable in-app deletion path and an external web resource. Engineering surfaces are:

- `apps/consumer-mobile/app/account-deletion.tsx`
- `public/legal/account-deletion.html`

The operational deletion process must cover authentication identity and associated user data subject only to documented legitimate retention exceptions.

## Business — `com.kleenest.business`

Business does not currently create a new app account inside the mobile experience, but it processes authenticated operator identity and business/network data.

Likely declaration areas include:

- authenticated user ID/email and business membership/access state;
- business/location/profile/operations data;
- QR design/configuration and engagement program data;
- remediation/reverification evidence and optional photos;
- approximate/precise location when granted;
- background location for explicitly enabled Business Live Network geofence operations;
- notification token/preferences and notification activity;
- analytics/reporting/enterprise campaign inputs and outputs;
- support/security/audit records associated with operator actions;
- entitlement/billing state where Business plans are enabled.

Background location must be declared from the **Business package's** actual use case and review video; Consumer wording is not sufficient.

## Fleet — `com.kleenest.fleet`

Likely declaration areas include:

- authenticated user ID and fleet/business membership;
- driver, vehicle, route, stop and dispatch data visible to authorized operators;
- approximate/precise location for map/route execution;
- background location for active route/geofence operations when enabled;
- arrival/departure timing, operational events and route telemetry;
- durable offline field-event queue and replay identifiers;
- notification token/preferences;
- maintenance and operational metric state;
- support/security/audit records.

Fleet does not need photo/camera collection for the current product contract. Re-evaluate if proof capture is introduced later.

## KleenestOS — `com.kleenest.platform`

Likely declaration areas include:

- authenticated Owner/operator identity;
- authorization/capability and audit state;
- business verification/access/membership administration;
- moderation and safety-report data accessed by authorized operators;
- progression/economy/objective configuration;
- audited Data Workbench records;
- platform health/ingestion/operations data;
- notification token/preferences where enabled.

KleenestOS does **not** request background location in the current production configuration. If that changes, the compliance matrix and this worksheet must be updated before release.

## Public versus private data

Potentially public Consumer/community data includes display name, username, avatar, bio, reviews, review photos and deliberately published contribution/progression signals.

Private/authorized data includes email/authentication state, private messages, safety/support reports, block lists, account-deletion requests, private preferences, operator authorization, internal business/fleet data and moderation/control-plane records.

Public visibility does not automatically exclude a data type from Data Safety if the app collects/transmits it.

## Purpose mapping

Use only purposes that are actually true for a package:

- **App functionality:** authentication, discovery, maps/routes, check-ins, QR, reviews, messaging, business operations, fleet dispatch, moderation, notifications and platform controls.
- **Account management:** account/profile/security/deletion where applicable.
- **Developer communications:** support and service communications where applicable.
- **Fraud prevention, security and compliance:** abuse prevention, moderation, trust/evidence integrity, audit and account security.
- **Personalization:** only where released behavior actually tailors content/results.
- **Analytics:** only for transmitted measurement/analytics actually present in the final package/backend flow.

## Consumer deletion coverage

A processed Consumer account deletion request must reconcile associated data across:

- authentication identity;
- profile/public identity;
- saves/preferences;
- check-ins, reviews, photos and evidence/contributions;
- social relationships/posts/comments where applicable;
- direct messages, subject to narrowly justified retention rules;
- push tokens and notification state;
- progression/badges/quests/game state;
- membership/entitlement state;
- support and safety records with legitimate retention exceptions documented;
- storage objects owned by the account.

The Privacy Policy must match operational behavior. Do not promise deletion of data engineering intentionally retains unless the retention basis and period are accurately disclosed.

## Final AAB reconciliation checklist — run per package

1. Build the production AAB for the exact release candidate.
2. Inspect the generated manifest and effective permissions/target SDK.
3. Inventory packaged SDKs/dependencies and production network/service destinations.
4. Identify any automatic crash, performance, analytics, advertising or identifier collection.
5. Reconcile backend/Edge Function flows reachable by the package, including AI/notification providers.
6. Reconcile foreground/background location usage with the sensitive-permission declaration for Consumer, Business and Fleet.
7. Confirm privacy-policy language covers collected/shared data and retention/deletion behavior.
8. Complete the package's Play Console Data Safety form from the reconciled artifact—not from an older APK or this worksheet alone.
9. Re-run this review after any SDK, permission, backend data-flow, ads, billing or analytics change.
