# Google Play background-location declaration drafts

**Baseline:** 2026-09-05

Consumer, Business and Fleet request Android background location for distinct opt-in geofence features. Keep each declaration focused on one package's core user-facing use case. Do not reuse a Consumer justification for Business or Fleet.

Official policy reference: https://support.google.com/googleplay/android-developer/answer/9799150

## Consumer — `com.kleenest.app`

### Feature to declare

**Consumer Live Network restroom geofence presence**

Declare this as one background-location feature. Visit/check-in verification and nearby-restroom alerts are user-visible outcomes of the same geofence-presence feature, not separate declaration features.

### Play Console — main purpose of the app

Kleenest helps people find useful nearby places and bathrooms, understand what they offer, and judge how recently their information was confirmed. Signed-in users can optionally enable Live Network so Kleenest can recognize eligible entry to and exit from known restroom regions when the app is not open.

### Play Console — why background location is required

**Ready-to-paste declaration:**

Kleenest uses background location only when a signed-in user explicitly enables Consumer Live Network restroom geofence presence. Live Network registers a limited set of nearby known restroom regions with the operating system. While Kleenest is closed or not in use, Android can report entry to or exit from those registered regions so Kleenest can maintain the user's eligible restroom-presence state, support the visit and check-in verification lifecycle, and provide a nearby-restroom alert when appropriate. Foreground-only location cannot provide the same experience because the relevant geofence entry or exit may occur while Kleenest is not visible. Normal map discovery and search remain available without Live Network, users can disable Live Network at any time, and Kleenest does not use background location for advertising.

### Why foreground-only is insufficient

The declared feature is specifically designed to recognize registered restroom-region entry and exit while Kleenest is not visible. Foreground-only access would stop that geofence-presence behavior when the user leaves the app, so the visit/check-in verification lifecycle and eligible entry alert could not continue as designed.

### Data minimization evidence

- Live Network is off until the user explicitly enables it.
- Normal map discovery and search do not require background location.
- The app registers only nearby known restroom regions rather than starting unrestricted continuous background tracking.
- Android registers at most 100 nearby regions; iOS registers at most 20.
- A geofence event records an eligible presence heartbeat; an entry event may create a nearby-restroom notification.
- Background location is not used for advertising.
- The user can turn Live Network off from the same user-facing screen and can revoke device permission in system settings.

### Prominent disclosure text implemented in app

“Kleenest collects location data to enable Live Network restroom geofencing even when the app is closed or not in use. When you enable this feature, Android can monitor nearby restroom regions in the background so Kleenest can recognize eligible restroom-region entry or exit, support your visit and check-in verification flow, and send nearby-restroom alerts. Kleenest does not use this background location for advertising, and you can turn Live Network off at any time.”

This dialogue appears when the user taps **Enable Live Network**, before Kleenest attempts the location-permission flow.

### Play reviewer access instructions

1. Sign in with the supplied Consumer reviewer account.
2. Open **Live Network**.
3. Confirm the screen initially shows Live Network off unless the reviewer account/device has already enabled it.
4. Tap **Enable Live Network**.
5. Read the complete Kleenest background-location disclosure and tap **Continue**.
6. Complete Android location permission/settings as prompted.
7. Return to Live Network and confirm it reports enabled status and a nearby-region count when qualifying restroom regions are available.
8. The reviewer can tap **Turn off** to stop registered geofencing.

If the review device is not physically near a seeded restroom region, the declaration video should demonstrate the resulting entry behavior on a device/location where it can be reproduced.

### Required declaration video

Keep the final submitted video approximately 30 seconds where practical and make the declared feature unmistakable.

1. Start from Kleenest on an Android device and show the signed-in Consumer experience.
2. Open **Live Network** and show it off.
3. Tap **Enable Live Network**.
4. Hold on the full prominent disclosure long enough to read the complete text.
5. Tap **Continue** and show the Android runtime/settings permission flow.
6. Return to Live Network and show enabled state plus registered nearby regions.
7. Demonstrate the declared feature operating while Kleenest is not in use: show a registered restroom-region entry producing the user-visible nearby-restroom effect and/or the resulting eligible presence/check-in state.
8. Reopen Live Network and show **Turn off**.
9. Also capture a denial/re-entry flow as supporting evidence. If the 30-second declaration video cannot show both consent and denial clearly, retain the longer evidence recording for resubmission/support.

### Store-listing sentence

Use a concise description that makes the feature discoverable without overstating it:

**Optional Live Network can recognize eligible entry to and exit from nearby restroom regions while Kleenest is not in use, supporting visit verification and timely nearby-restroom alerts.**

### Privacy-policy alignment

The in-app privacy policy and public privacy URL must state that Consumer Live Network is optional, can use background location while the app is closed or not in use for registered restroom geofences, supports eligible visit/check-in verification and alerts, is not used for advertising, and can be disabled.

## Business — `com.kleenest.business`

### Feature

**Business Live Network geofence operations**

### Proposed declaration summary

Kleenest Business uses background location only after an authorized business operator explicitly enables Business Live Network. Android then monitors the business's active Kleenest location geofences while the app is closed or not in use so eligible operational enter/exit events and related alerts can continue for the enabled operating feature. The operator can use the rest of Kleenest Business without enabling Live Network and can disable it from the same screen.

### Why foreground-only is insufficient

Business Live Network is designed to monitor enabled operational geofences outside an active foreground session. Foreground-only location would stop those geofence events when the operator leaves the app and would make the enabled Live Network feature unreliable.

### Prominent disclosure text implemented in app

“Kleenest Business collects location data to enable Business Live Network geofence operations even when the app is closed or not in use. When you enable this feature, Android monitors active Business location geofences in the background so Kleenest can record operational enter/exit events and deliver eligible alerts. This background location is not used for advertising, and you can disable Live Network at any time.”

### Review video storyboard

1. Sign in to a seeded Business reviewer workspace with at least one geofence-ready location.
2. Navigate to Live Network.
3. Show the disabled device state and business geofence list.
4. Tap **Enable Live Network**.
5. Record the Business prominent disclosure dialog in full.
6. Tap **Continue** and record Android permission prompts.
7. Return to Live Network and show enabled status/geofence registration.
8. Tap **Disable Live Network** and show it off.

## Fleet — `com.kleenest.fleet`

### Feature

**Fleet active-route geofence execution**

### Proposed declaration summary

Kleenest Fleet uses background location only when an authorized Fleet operator explicitly enables Live Network for a selected route. Android monitors the route's geofence-ready stops while Fleet is closed or not in use so the operational workflow can detect eligible route-stop enter/exit events and support route alerts. Fleet planning, dispatch, driver/vehicle management and other operations remain available without enabling background geofencing, and Live Network can be stopped at any time.

### Why foreground-only is insufficient

Active route execution may continue while the operator or driver is using navigation or another app. Foreground-only location would stop the selected route's geofence monitoring whenever Kleenest Fleet is no longer visible, preventing the declared arrival/departure automation from working as intended.

### Prominent disclosure text implemented in app

“Kleenest Fleet collects location data to enable active route geofence enter/exit alerts even when the app is closed or not in use. When you enable Live Network for this route, Android monitors the route’s stop geofences in the background so Fleet can detect operational arrivals and departures and deliver eligible route alerts. This background location is not used for advertising, and you can stop Live Network at any time.”

### Review video storyboard

1. Sign in to a seeded Fleet workspace with a route containing geofence-ready stops.
2. Navigate to Live Network + Signals and select the route.
3. Show the disabled runtime state.
4. Tap **Enable Live Network**.
5. Record the Fleet prominent disclosure dialog in full.
6. Tap **Continue** and record Android location permission prompts.
7. Return to the screen and show geofence runtime ON.
8. Tap **Stop Live Network** and show it OFF.

## Submission checks for all three packages

Before uploading each declaration/video:

- confirm the exact submitted AAB still requests background location;
- confirm the disclosure wording and navigation in the video matches that AAB;
- keep the privacy policy and Data Safety answers synchronized with the same use case;
- ensure the video is recorded on Android and clearly shows the disclosure before the system permission prompt;
- do not show personal customer data or reviewer credentials in the video;
- if the feature is removed or background access is no longer necessary, remove the permission from the package instead of keeping a stale declaration.
