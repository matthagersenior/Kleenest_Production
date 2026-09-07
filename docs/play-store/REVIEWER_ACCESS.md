# Google Play reviewer access runbook

**Baseline:** 2026-09-05

Use dedicated, non-sensitive review accounts with seeded test data. Never provide a personal production administrator account, real customer private messages, or credentials in the repository. Actual reviewer credentials belong in Play Console App access instructions or an approved secret manager.

## Consumer — `com.kleenest.app`

Reviewer path:

1. Launch Kleenest. Signed-out restroom discovery should remain available.
2. Open Profile and sign in with the dedicated Consumer reviewer account.
3. Accept the current Terms, Community Guidelines and Privacy gate when presented.
4. Open Explore and verify map/search/location-detail navigation.
5. Grant foreground location when testing nearby discovery or eligible check-in/visit behavior. Denying location should leave non-location account features usable.
6. Open Live Network. The first Enable action must show the Kleenest prominent background-location disclosure before Android permission prompts. Continue only when testing Live Network.
7. Grant camera only when testing QR scanning.
8. Grant photo-library access only when selecting an avatar or supported contribution image.
9. Open a contributor/review surface and verify Report/Block controls.
10. Open Profile/Support and verify Privacy, Terms, Community Guidelines and account-deletion access.
11. The external account-deletion URL must work independently of the installed app.

Seed the reviewer account with safe example saved places, progression state and community content sufficient to reach the relevant surfaces without relying on a real user's data.

## Business — `com.kleenest.business`

Reviewer account needs an authorized Business membership with at least one canonical location and representative data for QR, trust/operations, analytics and reporting.

Reviewer path:

1. Sign in with the dedicated Business reviewer account.
2. Verify the business/location selector resolves the seeded business and location.
3. Review Business/location details and editable operational surfaces.
4. Open QR Studio and inspect the live design/configuration/version workflow.
5. Open Trust Operations and verify remediation/reverification/preventive work presentation.
6. Open analytics/reporting/governance surfaces and verify authorized data is visible.
7. Open Live Network. Enable must show the Business prominent background-location disclosure before Android permission prompts.
8. If testing Live Network, continue through foreground/background location and notification permission, verify geofence status, then disable the feature from the same screen.
9. Review notification compose/audience behavior with seeded non-sensitive recipients or a non-delivering test audience.
10. If Enterprise/network features are enabled for the reviewer business, verify those surfaces using seeded campaign/network data.

Do not give the reviewer unrestricted platform-owner authority just to make Business review easier.

## Fleet — `com.kleenest.fleet`

Reviewer account needs an authorized Fleet workspace with at least one driver, vehicle, planned route and geofence-ready route stop. Seed a route that is safe to dispatch and exercise without affecting production operations.

Reviewer path:

1. Sign in with the Fleet reviewer account.
2. Open planner/map and verify canonical location/route planning.
3. Open Dispatch and inspect planned/running route cards.
4. Dispatch the seeded test route if the track is configured for safe mutation testing.
5. Exercise stop timing transitions on test records only.
6. Open Live Network + Signals. Enable must show the Fleet prominent background-location disclosure before Android permission prompts.
7. If testing Live Network, continue through location permission, verify route geofence state, then stop Live Network.
8. Review driver, vehicle and maintenance management using test entities.
9. Review Sync/offline state. Offline replay testing should use disposable route-stop events and a non-production route.

## KleenestOS — `com.kleenest.platform`

Reviewer access should be the narrowest platform role that still demonstrates intended functionality. If Play distribution is not required for KleenestOS, prefer controlled/private distribution instead of creating a broad public-review path.

If Play review is required:

1. Sign in with a dedicated platform reviewer/operator account.
2. Verify the command center and system health surfaces.
3. Open Businesses and inspect seeded verification/access/member administration.
4. Open Moderation and inspect seeded review/user/AI report queues.
5. Open Progression and inspect XP/objective/supply controls.
6. Open Data Workbench and demonstrate only safe test resources.
7. Do not expose real customer support records, private messages, production secrets or unrestricted destructive controls merely for reviewer convenience.

## Credential handling

The repository should contain only these instructions, never real reviewer passwords or magic-link tokens.

Before each submission:

- verify reviewer credentials from a clean device/session;
- verify any MFA/recovery path will not block the reviewer;
- ensure seeded data remains available for the expected review period;
- remove expired credentials from Play Console and rotate them after review when appropriate;
- make App access instructions specific enough that a reviewer does not need to guess navigation or permissions.
