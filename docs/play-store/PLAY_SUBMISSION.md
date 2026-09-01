# Kleenest Google Play submission runbook

Release candidate: Consumer Android `com.kleenest.app`

## Build gate

Do not create the final production AAB until every item in this runbook is complete. Preview APKs may be used for device QA only. The production EAS profile already emits an Android App Bundle.

- Expo SDK 57 targets Android 16 / API 36 by default. Do not downgrade the SDK or target API before submission.
- Package name: `com.kleenest.app`
- App name: `Kleenest`
- EAS project: `22a65aa3-c615-4c4f-a34d-084babc28fd7`
- Production profile: `eas build --platform android --profile production` (HOLD until final approval)
- Preview/device QA profile: `eas build --platform android --profile preview`

## Public URLs after this branch is merged and GitHub Pages deploys

The repository Pages workflow publishes the Expo web export under the repository base path. Verify each URL in an incognito browser before entering it in Play Console.

- Privacy Policy: `https://matthagersenior.github.io/Kleenest_Production/privacy`
- Account deletion: `https://matthagersenior.github.io/Kleenest_Production/delete-account`
- Terms: `https://matthagersenior.github.io/Kleenest_Production/terms`
- Community Guidelines: `https://matthagersenior.github.io/Kleenest_Production/community-guidelines`

If a custom domain is configured later, replace these with the stable custom-domain URLs and keep redirects from the old URLs.

## Play Console → App content

### Privacy policy
Enter the public Privacy Policy URL above. The same policy is reachable in-app from Profile → Support → Privacy Policy.

### Data safety
Use `docs/play-store/DATA_SAFETY.md` as the source of truth. Re-check declarations whenever an SDK, permission, analytics product, billing integration, ad SDK, or data flow changes.

### Account deletion
Declare that users can request account deletion. Enter the public Delete Account URL above. The page verifies control of an existing account with a magic link and then invokes the same authenticated deletion-request RPC used in the app.

### Ads
Current consumer code does not include an ad SDK. Select **No, my app does not contain ads** for this release unless an ad SDK or served ad inventory is added before build.

### App access
Kleenest has signed-in and permission-dependent features. Provide a dedicated reviewer account if Play Console requests credentials. Include these instructions:

1. Launch Kleenest. Core restroom discovery can be reviewed signed out.
2. Open Profile and sign in using the supplied reviewer account.
3. Accept the current Terms/Community/Privacy gate.
4. Location permission: allow while using the app to test nearby discovery, routes and qualifying visit flows; denial should leave non-location account features available.
5. Camera permission: only required for Scan QR.
6. Photo-library access: only required when choosing an avatar or supported photo contribution.
7. Open a contributor profile to verify Report / Block controls.
8. Open Profile → Support to inspect Privacy Policy, Terms, Community Guidelines and account deletion.
9. The public account-deletion URL can be reviewed independently of the installed app.

Do not provide a personal production account. Use a non-sensitive review account with seeded test content and no real private conversations.

### Target audience and content rating
Complete the questionnaire based on the actual intended audience. Do not select child-directed age groups unless the released product, moderation, data practices, ads/purchases, and family-policy obligations have been intentionally designed for those groups. Disclose user-generated content, social interaction/direct messaging, location sharing/use, and game/progression elements accurately in the content-rating questionnaire.

### News / health / financial / government declarations
Do not opt into regulated-category declarations unless the released product actually qualifies. Kleenest is a restroom discovery/community utility, not a medical diagnosis service or emergency service.

## Monetization

The current Membership screen is informational and explicitly states that digital upgrades require verified native-store purchase/restore. It does not grant paid entitlement from a button tap and the mobile package currently contains no external checkout integration. For this release:

- Do not add Stripe/web checkout links for Premium or Family inside the Play-distributed Android app.
- Do not enable a paid upgrade CTA until Play Billing products and purchase verification are implemented and tested.
- If no paid products are enabled for the first release, submit the app as free with no active in-app products.

## UGC review hardening

Kleenest hosts reviews, profile content, photos, social activity and direct messages. This release includes:

- versioned Terms/Community/Privacy acceptance for signed-in users;
- in-app reporting for contributors and reviews;
- in-app user blocking;
- server-enforced direct-message blocking in both directions;
- existing review moderation/report queues;
- support category for Safety;
- Community Guidelines defining prohibited content and behavior.

Before submission, run a two-account test proving that A blocking B prevents both A→B and B→A new direct messages and that a safety report creates a private moderation record.

## Account deletion operational runbook

Deletion requests are authenticated and stored in `account_deletion_requests`. A request must not remain merely suspended indefinitely.

For each deletion request:

1. Confirm request identity/status and record the processing start time.
2. Identify data tied to the account across auth, profile, contributions, photos/storage objects, messages/social data, notification tokens, saved data, support/safety records, progression and membership/entitlement records.
3. Delete or de-identify associated user data unless a specific record must be retained for a legitimate legal, security, fraud-prevention, dispute, or audit purpose.
4. If retention is required, minimize the retained fields and record the reason and retention period.
5. Delete the authentication identity when processing is complete so the account cannot continue signing in.
6. Confirm that public profile identity and private account data are no longer retrievable through normal application APIs.

Never test deletion processing against a real customer account. Use a disposable QA account.

## Store listing draft

**App name:** Kleenest

**Short description:** Find cleaner, trusted restrooms with community-backed details, routes and access tools.

**Full description:**

Kleenest helps you find restrooms you can use with more confidence. Explore nearby options, review practical amenities and trust signals, save useful stops, build bathroom-first routes, and contribute real-world updates after your visit.

Use Kleenest to discover and compare restrooms, plan routes around reliable stops, scan Kleenest QR codes, save places, record verified visits, contribute reviews and photos, and manage privacy and notification preferences. Signed-in members can also participate in community, progression, quests, badges, games and direct messages where available.

Kleenest includes in-app support, community reporting and blocking, clear privacy controls, and account-deletion tools. Location, camera and photo access are requested only when a feature needs them and can be denied through device settings.

Restroom conditions, opening hours, accessibility and availability can change. Kleenest provides community-backed decision support rather than a guarantee about any location.

## Store assets still requiring human visual approval

Before the final AAB is built, verify in Play Console preview:

- 512×512 app icon is crisp and matches the installed launcher icon.
- 1024×500 feature graphic contains no unsupported claims, pricing or awards.
- At least two phone screenshots show real production UI; recommended set: Home/Explore, Location detail, Route, Community safety/reporting, and Profile/Support.
- Screenshot content contains no personal user data, private email, private messages, test credentials, debug UI, placeholder text, or internal IDs.
- All listing text matches features actually enabled in the submitted artifact.

## Final pre-build acceptance

The final production AAB is authorized only after:

- typecheck/CI passes on the hardening branch;
- public legal/deletion URLs are deployed and verified without authentication loops or 404s;
- two-account block/report QA passes;
- denied-permission and offline/degraded-network QA passes;
- account deletion is tested end-to-end with a disposable QA account including operational processing;
- Data Safety answers are entered from the checked-in worksheet;
- Play reviewer access instructions and a dedicated reviewer account are ready;
- store listing graphics/screenshots are approved;
- Play Console shows no unresolved App content declarations or policy warnings.
