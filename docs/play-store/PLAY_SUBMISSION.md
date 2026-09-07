# Kleenest Google Play submission runbook

**Engineering policy baseline:** 2026-09-05

This runbook covers the four Android packages in `Kleenest_Production`. It separates installable APK QA from the production Android App Bundles uploaded to Google Play.

## Packages

| App | Android package | EAS project | Intended audience |
| --- | --- | --- | --- |
| Consumer | `com.kleenest.app` | `22a65aa3-c615-4c4f-a34d-084babc28fd7` | Public users |
| Business | `com.kleenest.business` | `15ac343b-81bf-459b-8c25-1b2fc8b293de` | Business/network operators |
| Fleet | `com.kleenest.fleet` | `90d1d6ff-1376-4065-a00c-7cf0415e4347` | Fleet operators/drivers/managers |
| KleenestOS | `com.kleenest.platform` | `9b5527b5-c8b1-47c1-a961-3e2d5e549a62` | Platform/Owner operators |

KleenestOS distribution can remain controlled/private unless a public store listing is intentionally chosen; its package/build must still remain release-grade.

## Proven native baseline

Four-app Android workflow run `33989915793` on commit `15417471c4fa5073a2a8fd3edaf2232b373201d9` passed release APK build, binary/package inspection and Android 16 startup smoke for all four packages. Consumer also passed its Explore deep-link smoke.

That evidence proves those APKs were installable and launched. It does **not** substitute for a production AAB, Play App Signing, Data Safety, permission review or Play Console approval.

## Technical upload gate

As of August 31, 2026, new phone/tablet apps and app updates submitted to Google Play must target Android 16 / API level 36 or higher.

Production requirements for this repo:

- effective `targetSdkVersion >= 36` proven from the generated artifact;
- non-debuggable release;
- correct package ID;
- monotonically increasing version code;
- production configuration/endpoints;
- Android App Bundle output for Play upload;
- Play App Signing enrollment for new apps;
- no development-client/runtime leakage.

Each app's EAS `production` profile already uses `distribution: store`, `autoIncrement: true`, remote app versioning and Android `buildType: app-bundle`.

Production command per workspace is the normal EAS production build for that project, for example:

```bash
eas build --platform android --profile production
```

Do not upload the sideload/QA APK as the normal new-app Play production artifact.

Canonical references:

- https://developer.android.com/google/play/requirements/target-sdk
- https://developer.android.com/guide/app-bundle
- https://developer.android.com/studio/publish/upload-bundle

## Public legal URLs

Source files:

- `public/legal/privacy.html`
- `public/legal/account-deletion.html`
- `public/legal/terms.html`
- `public/legal/community-guidelines.html`

Expected Pages URLs after the family Android workflow succeeds on `main` and the Consumer installer/Pages workflow deploys:

- Privacy: `https://matthagersenior.github.io/Kleenest_Production/legal/privacy.html`
- Account deletion: `https://matthagersenior.github.io/Kleenest_Production/legal/account-deletion.html`
- Terms: `https://matthagersenior.github.io/Kleenest_Production/legal/terms.html`
- Community Guidelines: `https://matthagersenior.github.io/Kleenest_Production/legal/community-guidelines.html`

Verify every URL in a signed-out/incognito browser immediately before entering it into Play Console. A checked-in HTML file is not proof that the public deployment is live.

## App content — all Play-distributed packages

### Privacy policy

Provide the public privacy-policy URL. The policy must accurately name/cover Kleenest, explain personal/sensitive data handling, retention/deletion and contact/support mechanism, and remain publicly accessible without login.

### Data Safety

Use `docs/play-store/DATA_SAFETY.md` as the engineering worksheet, then reconcile the **exact production AAB** per package before completing the Play Console form.

Review:

- effective permissions;
- SDKs and their default data collection;
- backend/Edge Function data flows;
- Supabase/Auth/Storage/Realtime;
- push/notification transport;
- map/routing providers;
- AI providers reached by released features;
- billing, ads, analytics, attribution or crash tools if introduced.

Do not assume Consumer answers apply unchanged to Business, Fleet or KleenestOS.

### App access

Consumer has signed-out discovery plus signed-in functionality. Business, Fleet and KleenestOS are access-controlled operator apps. Provide dedicated reviewer credentials/instructions whenever Play review cannot reach core behavior unauthenticated.

Reviewer accounts must be disposable/non-sensitive and have seeded data sufficient to demonstrate the declared features. Do not provide a personal production administrator account.

### Ads

No ad SDK is part of the currently documented release baseline. If ad inventory or an ad/attribution SDK is introduced, update the privacy policy, Data Safety, app-content declarations and billing/ads review before release.

### Content rating / target audience

Answer from the actual released experience. Consumer includes community/UGC, social interaction, location, progression/games and potential messaging. Business/Fleet/Owner are operator tools. Do not mark Kleenest as child-directed unless the product, moderation, data practices, ads/purchases and Families obligations are intentionally redesigned for that audience.

## Background location — major review gate

Consumer, Business and Fleet request `ACCESS_BACKGROUND_LOCATION`. Google Play requires sensitive-permission review and expects background access to be important to the package's core user-facing functionality.

For **each affected package**, prepare one clear feature justification and do not bundle unrelated features into the declaration.

### Consumer

Declared engineering purpose: opt-in Live Network restroom-region awareness while the app is not in use.

Reviewer evidence must demonstrate:

1. the normal in-app path that enables Live Network;
2. the prominent disclosure shown before the runtime permission flow;
3. the Android permission prompt;
4. the user-visible effect/value of the background feature;
5. how the feature can be disabled.

### Business

Declared engineering purpose: opt-in Business Live Network geofence operations.

Demonstrate the business/operator benefit, user initiation, prominent disclosure, permission prompt, active geofence behavior and disable path.

### Fleet

Declared engineering purpose: active route execution, arrival/departure and operational geofence automation.

Demonstrate why background location is necessary during an active route/dispatch flow rather than for generic tracking/analytics, plus user initiation, disclosure, permission and stop/disable behavior.

### Required evidence for all three

- permission declaration in Play Console;
- prominent in-app disclosure in normal usage before the permission prompt;
- disclosure explicitly uses the word `location` and explains background/closed/not-in-use access;
- privacy policy and store listing accurately describe the behavior;
- short Android review video showing the declared feature, disclosure and runtime permission prompt;
- Data Safety reflects the actual location collection/use/sharing.

Canonical reference: https://support.google.com/googleplay/android-developer/answer/9799150

If Play determines a background feature is not core enough, the engineering fallback is to remove background permission/code and deliver the feature with foreground/user-initiated access—not to disguise the behavior in declarations.

## Consumer account deletion

Consumer allows account creation, so Play's account-deletion requirement applies.

Required surfaces:

- in app: `apps/consumer-mobile/app/account-deletion.tsx`;
- external web resource: `public/legal/account-deletion.html` deployed at the public URL above.

Before submission, run a disposable account through the entire lifecycle:

1. initiate deletion in-app;
2. independently verify the web deletion route;
3. verify authenticated backend request creation;
4. process the request operationally;
5. delete/de-identify associated data except narrowly justified retained records;
6. delete/disable the authentication identity as intended;
7. prove normal application APIs no longer expose the deleted account/private data.

Canonical reference: https://support.google.com/googleplay/android-developer/answer/13327111

Business/Fleet/KleenestOS currently do not create new user accounts from their mobile UI, but they still expose account/support controls and must accurately describe organization-managed account behavior.

## UGC and safety — Consumer

Consumer hosts reviews/profile content/photos/social activity and may include messaging. Release readiness requires:

- current Terms/Community/Privacy acceptance;
- report user/review controls;
- block/unblock controls;
- server-enforced block behavior where messaging applies;
- private moderation queues and Owner resolution tools;
- clear support/safety path;
- Community Guidelines covering prohibited behavior/content.

Before submission, perform a two-account safety test proving report creation and bidirectional messaging block behavior.

## Monetization

Digital goods/services in a Play-distributed Android app must follow the applicable Google Play billing rules.

Current engineering guardrails:

- no external Stripe/PayPal digital checkout links in the Android apps;
- Family/Business entitlements remain server authoritative;
- do not turn an informational upgrade control into local entitlement granting;
- enable paid Play products only after Play Billing purchase/restore/verification is implemented and tested end to end.

If the first public release has no paid products enabled, submit without active in-app products rather than shipping an incomplete purchase flow.

## Store listing assets

For each public listing, prepare and review:

- 512×512 Play app icon (32-bit PNG, <= 1024 KB);
- 1024×500 feature graphic (JPEG or 24-bit PNG without alpha);
- at least two compliant screenshots, with a richer phone set strongly preferred;
- app name;
- short description;
- full description;
- support/contact details;
- privacy-policy URL.

Use real current UI. Remove private email/messages, credentials, debug UI, placeholder content, internal IDs and unsupported claims.

Canonical asset reference: https://support.google.com/googleplay/android-developer/answer/9866151

## Consumer listing draft

**App name:** Kleenest

**Short description:** Find cleaner, trusted restrooms with community-backed details, routes and access tools.

**Full description:**

Kleenest helps you find restrooms you can use with more confidence. Explore nearby options, review practical amenities and trust signals, save useful stops, build bathroom-first routes, and contribute real-world updates after your visit.

Use Kleenest to discover and compare restrooms, plan routes around useful stops, scan Kleenest QR codes, save places, record verified visits, contribute reviews and photos, and manage privacy and notification preferences. Signed-in members can also participate in community and progression experiences where available.

Kleenest includes support, community reporting and blocking, clear privacy controls and account-deletion tools. Location, camera and photo access are requested only for features that need them. Optional Live Network features may use location in the background after the user enables the feature and grants the relevant Android permission.

Restroom conditions, hours, accessibility and availability can change. Kleenest provides decision support rather than a guarantee about any location.

Business, Fleet and KleenestOS need package-specific listing copy rather than reusing the Consumer description.

## Testing-track readiness

If the developer account is a **personal account created after November 13, 2023**, current Play requirements require a closed test with at least 12 testers continuously opted in for at least 14 days before applying for production access.

Canonical reference: https://support.google.com/googleplay/android-developer/answer/14151465

Confirm the actual Play Console account type/creation date before treating this gate as applicable.

Use Internal/Closed testing to exercise the Play-signed generated APKs before production, especially:

- fresh install/upgrade;
- sign in/auth recovery;
- denied/limited location permissions;
- background location enable/disable and review flow;
- camera/QR;
- maps/search/location detail;
- offline/degraded-network behavior;
- notifications;
- Business CRUD/QR/trust/governance;
- Fleet dispatch/geofence/offline replay;
- Owner authorization/business/moderation/data workbench.

## Final pre-upload acceptance

Do not call a package Play-ready until:

- Production CI/product parity pass on the release head;
- repo hygiene and Play matrix audits pass;
- generated artifact proves target SDK >= 36;
- package/version/signing configuration is correct;
- public legal URLs are live and verified;
- Data Safety is reconciled to the exact AAB;
- background-location declarations/videos are ready for Consumer, Business and Fleet;
- Consumer deletion has been tested end to end;
- reviewer accounts/instructions are ready;
- store listing copy/assets are approved;
- content-rating/App content declarations are complete;
- any applicable closed-testing requirement has been satisfied;
- Play Console shows no unresolved blocking warnings.
