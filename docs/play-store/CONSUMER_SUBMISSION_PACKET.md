# Kleenest Consumer Google Play submission packet

**Package:** `com.kleenest.app`  
**Prepared:** 2026-10-02  
**Purpose:** Copy/paste-ready reviewer and policy material for the first Consumer Play submission.

This packet is not a substitute for the final Play Console forms. Reconcile it against the exact production AAB before submission.

## 1. Background location — declared feature

**Feature name:** Consumer Live Network restroom geofence presence

**Main-purpose explanation:**

Kleenest helps people find useful nearby places and bathrooms, understand what they offer, and judge how recently the information was confirmed. Signed-in users can optionally enable Live Network so Kleenest can recognize eligible entry to and exit from known restroom regions when the app is not open.

**Why background location is required:**

Kleenest uses background location only when a signed-in user explicitly enables Consumer Live Network restroom geofence presence. Live Network registers a limited set of nearby known restroom regions with the operating system. While Kleenest is closed or not in use, Android can report entry to or exit from those registered regions so Kleenest can maintain the user's eligible restroom-presence state, support the visit and check-in verification lifecycle, and provide a nearby-restroom alert when appropriate. Foreground-only location cannot provide the same experience because the relevant geofence entry or exit may occur while Kleenest is not visible. Normal map discovery and search remain available without Live Network, users can disable Live Network at any time, and Kleenest does not use background location for advertising.

**Prominent disclosure shown in app:**

“Kleenest collects location data to enable Live Network restroom geofencing even when the app is closed or not in use. When you enable this feature, Android can monitor nearby restroom regions in the background so Kleenest can recognize eligible restroom-region entry or exit, support your visit and check-in verification flow, and send nearby-restroom alerts. Kleenest does not use this background location for advertising, and you can turn Live Network off at any time.”

## 2. Background-location reviewer video shot list

Record on Android using the exact production-candidate build.

1. Launch Kleenest and sign in to the Consumer reviewer account.
2. Navigate to **Live Network** and show it off.
3. Tap **Enable Live Network**.
4. Show the complete Kleenest prominent disclosure before any Android permission prompt.
5. Tap **Continue** and show the foreground/background permission flow.
6. Return to Live Network and show enabled status and the registered-region count.
7. Put Kleenest in the background.
8. Enter a registered restroom region and show the resulting user-visible Live Network effect: a nearby-restroom alert and/or the eligible presence/check-in state after returning to Kleenest.
9. Reopen Live Network and show **Turn off**.
10. Keep a separate supporting recording of denying permission and retriggering the disclosure/permission flow.

Preferred declaration-video target: approximately 30 seconds. Use captions if the background effect is not self-explanatory.

**Evidence URL:** _add after recording_

## 3. Store-listing location disclosure

Add this sentence to the Consumer full description:

> Optional Live Network can recognize eligible entry to and exit from nearby restroom regions while Kleenest is not in use, supporting visit verification and timely nearby-restroom alerts.

Do not describe background location as advertising/personalization functionality.

## 4. Privacy-policy evidence

**Public privacy URL:**  
https://matthagersenior.github.io/Kleenest_Production/legal/privacy.html

**In-app privacy route:**  
`apps/consumer-mobile/app/privacy.tsx`

Required final verification:

- public URL returns the current October 2, 2026 policy;
- app privacy screen describes optional background Live Network use;
- public and in-app language agree;
- background location is explicitly stated as not used for advertising.

## 5. Account deletion

**In-app route:** `apps/consumer-mobile/app/account-deletion.tsx`  
**Public deletion page:**  
https://matthagersenior.github.io/Kleenest_Production/legal/account-deletion.html

Before submission, test with a disposable account:

1. Create/sign in.
2. Create representative user state.
3. Submit deletion request in-app.
4. Confirm the protected backend request is created.
5. Process the request using the production deletion procedure.
6. Confirm auth identity and covered account data are deleted or de-identified according to policy.
7. Confirm the public deletion page remains usable without the app.

## 6. UGC / community safeguards

Consumer has user-generated content. Reviewer notes should identify the visible controls for:

- report objectionable content/reviews;
- report users/accounts where applicable;
- block users;
- community guidelines/policy acceptance;
- moderation/escalation path.

Do not submit until these controls work in the production-candidate build using a normal reviewer account.

## 7. Ads and billing

Kleenest uses Google Mobile Ads for network ads and keeps Kleenest Sponsored recommendations separate from organic trust/freshness ranking.

Consumer Remove Ads is a one-time digital entitlement:

- product ID: `kleenest_remove_ads_lifetime`
- intended price: $5 one-time
- Android purchase owner: Google Play Billing
- entitlement granted only after server verification
- restore purchase flow included

Before production submission:

- create/activate the matching Play Console in-app product;
- complete license-test purchase;
- verify server-side receipt validation succeeds;
- verify entitlement persists after restart/sign-in;
- verify Restore purchase works;
- verify Google/network ads are suppressed while Kleenest Sponsored recommendations remain.

## 8. Data Safety reconciliation — Consumer

Reconcile the exact production AAB and backend before answering the form. Expected areas include:

- account/authentication identifiers for signed-in users;
- optional public profile information;
- approximate/precise location when the relevant feature is used;
- optional background location for explicitly enabled Live Network;
- photos where the user chooses to upload;
- user-generated text/content and messages;
- app interaction/progression/preference state;
- push token/device identifier data used for notifications;
- purchase/entitlement state;
- diagnostics only where the final packaged SDKs/services actually transmit them.

For every data type, distinguish:
- collected vs shared under Google's definitions;
- required vs optional;
- purposes actually used;
- whether processing is by Kleenest or a service provider.

Do not infer the final form solely from this document; inspect the final artifact and production network/service inventory.

## 9. Reviewer access

Prepare one disposable Consumer reviewer account that:

- can sign in without requiring access to the developer's personal email;
- is not privileged/admin;
- can open Live Network;
- can access community/report/block flows;
- can reach Membership / Remove Ads;
- contains no personal beta-tester data.

Record the username/email and password only in Play Console reviewer-access fields. Do not commit credentials to the repository.

## 10. Final release gate

Before uploading to production, all must be true:

- no open PRs;
- no unresolved failing CI on `main`;
- exact production AAB built from the intended release commit;
- target SDK and package identity verified from the artifact;
- public legal URLs live;
- background-location video URL supplied;
- Sensitive app permissions declaration complete;
- Data Safety complete and reconciled;
- reviewer account/instructions supplied;
- account deletion verified end-to-end;
- UGC reporting/blocking verified;
- billing/license test and restore verified;
- Play Console shows no unresolved blocking warnings.


## Official Google references

- Background location: https://support.google.com/googleplay/android-developer/answer/9799150
- Sensitive permissions declarations: https://support.google.com/googleplay/android-developer/answer/9214102
- Prominent disclosure and consent: https://support.google.com/googleplay/android-developer/answer/11150561
- Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
