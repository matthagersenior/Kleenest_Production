# Google Play background-location declaration drafts

**Baseline:** 2026-09-05

Consumer, Business and Fleet request Android background location for distinct opt-in geofence features. Keep each declaration focused on one package's core user-facing use case. Do not reuse a Consumer justification for Business or Fleet.

Official policy reference: https://support.google.com/googleplay/android-developer/answer/9799150

## Consumer — `com.kleenest.app`

### Feature

**Consumer Live Network nearby-restroom alerts**

### Proposed declaration summary

Kleenest uses background location only when the user explicitly enables Consumer Live Network. The feature lets Android monitor nearby restroom geofence regions while Kleenest is closed or not in use so the app can create eligible nearby-restroom alerts when the user enters a monitored restroom region. The user can use normal Kleenest discovery without enabling Live Network and can turn Live Network off at any time.

### Why foreground-only is insufficient

The user-facing value is an alert triggered when the device enters a monitored restroom region while the user is not actively viewing Kleenest. Restricting location to foreground use would remove the feature's background geofence behavior rather than merely reduce its precision.

### Prominent disclosure text implemented in app

“Kleenest collects location data to enable Live Network nearby-restroom alerts even when the app is closed or not in use. When you enable this feature, Android can monitor nearby restroom regions in the background and notify you when you enter one. Kleenest does not use this background location for advertising, and you can turn Live Network off at any time.”

### Review video storyboard

1. Launch Consumer and navigate to Live Network.
2. Show Live Network in the disabled state and the feature explanation.
3. Tap **Enable Live Network**.
4. Record the Kleenest prominent disclosure dialog in full.
5. Tap **Continue**.
6. Record the Android foreground/background location permission flow.
7. Return to Live Network and show the enabled state/registered regions.
8. Tap **Turn off** and show the disabled state.

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
