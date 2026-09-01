# Kleenest Play Data Safety worksheet

Package: `com.kleenest.app`
Release baseline: September 1, 2026

This is the engineering source of truth for the Play Console Data safety form. It must be reconciled with the final artifact and all third-party SDK behavior immediately before submission.

## Top-level answers

- **Does the app collect or share required user data types?** Yes — Kleenest transmits user/account and feature data off-device to its backend and service providers.
- **Is collected user data encrypted in transit?** Yes for normal production API/auth/storage traffic; verify no cleartext endpoints are introduced in the final artifact.
- **Can users request deletion?** Yes — in-app account deletion plus a public web deletion request route.
- **Data sold?** No known sale of user data in the current consumer implementation.
- **Advertising data sharing?** No ad SDK is present in the current consumer package. Re-evaluate if ads or attribution SDKs are added.

## Data types to declare

| Play data category | Collected? | Typical purpose | Required / optional |
| --- | --- | --- | --- |
| Email address / user IDs | Yes | Account creation, authentication, account security, support | Required for signed-in account; app has signed-out functionality |
| Name / username | Optional | Public contributor identity and community | Optional |
| Profile photo | Optional | Public contributor profile | Optional |
| Precise location | Yes when user grants permission and uses location-aware/verification features | Nearby discovery, routing, qualifying visit/check-in evidence | Optional at app level; required for specific feature paths |
| Approximate location | Yes when user grants permission | Nearby discovery and routing | Optional at app level |
| Photos | Optional | Avatar and supported review/evidence contributions | Optional |
| User-generated text/content | Yes for signed-in contributors | Reviews, profile bio, messages, support/safety reports, social/community features | Optional feature data |
| App interactions | Yes | Saved places, check-ins, reviews, progression, quests, preferences, notification state, safety controls | Feature operation / analytics-like product state |
| Other user-generated content | Yes | Amenity observations, trust/evidence signals, game/progression contributions | Optional feature data |
| Device or other identifiers | Yes where required by notification transport/auth infrastructure | Push delivery, session/security and service operation | Optional/required by enabled feature |
| Purchase / entitlement information | Entitlement status exists; no active Android external checkout in this release | Membership access state | Only if membership state exists for account |
| Crash/diagnostic data | Verify final SDK artifact | Reliability and security | Declare if any included SDK transmits it |

## Sharing versus service-provider processing

Do not automatically mark backend/service-provider processing as "shared" without applying Google's Data Safety definitions. For each provider in the final artifact, determine whether its processing qualifies for a service-provider exception or must be declared as sharing. The declaration must include behavior of third-party code, not only Kleenest-authored code.

Current major infrastructure/features requiring final reconciliation include:

- Supabase authentication, database, RPC, storage and related infrastructure;
- Expo/EAS and Expo Notifications transport used by the released artifact;
- MapLibre/map tile or routing providers actually configured in production;
- any AI provider used by Kleenest AI in the released backend path;
- any future crash reporting, analytics, attribution, advertising or billing SDK added before build.

## Purpose mapping

Use the most specific applicable Play purposes:

- **App functionality:** authentication, restroom discovery, routes, check-ins, reviews, messaging, support, safety, preferences, progression and membership entitlement.
- **Account management:** account creation/sign-in, profile, password/security, deletion.
- **Developer communications:** support and service-related notifications where applicable.
- **Fraud prevention, security and compliance:** abuse prevention, moderation, trust/evidence integrity, account security and deletion audit requirements.
- **Personalization:** only declare where a released feature actually tailors results/content using the data.
- **Analytics:** only declare for transmitted analytics/measurement actually present in the final artifact or backend path.

## Public/private distinction

The following may be intentionally public when the user chooses to publish them: display name, username, avatar, bio, reviews, review photos, reputation/progression signals and other explicitly public community contributions.

The following are intended to remain private to authorized users/operations: email, authentication state/credentials, private messages, support requests, safety reports, block lists, account-deletion requests, private preferences and private notification state.

Public visibility does not remove a data type from Data Safety analysis if it is collected by the app.

## Permission-to-data mapping

- `ACCESS_COARSE_LOCATION` → approximate location for nearby discovery/routing.
- `ACCESS_FINE_LOCATION` → precise location for nearby discovery, routing and qualifying visit/check-in flows.
- `CAMERA` → QR scanning; do not claim continuous/background camera access.
- Photo-library permission from `expo-image-picker` → user-selected profile/contribution images.
- Notifications → push token and user notification preferences/state where enabled.

The app does not currently declare background-location, contacts, microphone, SMS, call-log, health, accessibility-service, VPN, all-files, or package-query permissions. Re-run this inventory after native prebuild because transitive libraries can alter the final manifest.

## Deletion mapping

A processed account deletion request must cover associated data across:

- authentication identity;
- profile/public identity;
- saved places and preferences;
- check-ins, reviews, photos and contribution/evidence records;
- social relationships/posts/comments where applicable;
- direct messages, subject to any narrowly justified retention rule;
- push tokens and notification state;
- progression, badges, quests and game state;
- membership/entitlement state;
- support and safety records, with only legitimate security/legal/audit retention exceptions;
- storage objects owned by the account.

The Privacy Policy must match the operational deletion behavior. If engineering cannot delete a category, do not promise deletion of it without documenting the legitimate retention basis.

## Final artifact reconciliation checklist

Before submitting Data Safety:

1. Inspect the generated Android manifest and dependency list from the production-candidate native project/AAB.
2. Compare every permission with this worksheet.
3. Inventory every SDK and network destination in the production artifact.
4. Verify whether any SDK collects crash, performance, advertising, device ID or analytics data by default.
5. Reconcile production backend/edge-function data flows, including AI integrations.
6. Confirm Privacy Policy language covers every collected/shared data type.
7. Enter the final Play Console form from the reconciled worksheet; do not rely on this draft if the artifact changed.
