# Kleenest Google Play listing drafts

**Baseline:** 2026-09-05

These drafts are intentionally conservative: they describe features present in the canonical four-app repository and avoid unsupported awards, guarantees, pricing claims, or claims that require external substantiation. Reconcile copy against the exact production AAB before submission.

## Consumer — Kleenest

**Package:** `com.kleenest.app`

**App name:** Kleenest

**Short description:** Find trusted restrooms with community details, routes, reviews and access tools.

**Full description:**

Kleenest helps you find restrooms you can use with more confidence. Explore nearby locations, compare practical details and trust signals, plan bathroom-first routes, save useful stops, and contribute real-world updates after a visit.

Use Kleenest to:

- explore nearby restroom locations on the map and in search;
- review location details, amenities, evidence and community trust signals;
- save useful locations and plan routes around restroom stops;
- record eligible visits and check-ins;
- scan Kleenest QR codes for supported location and engagement experiences;
- contribute reviews, ratings, photos and amenity updates where available;
- participate in community, progression, quests, badges and games where enabled;
- manage notification, privacy, safety, blocking and account controls.

Optional Live Network features can use location in the background after you enable the feature and grant Android permission. This lets Android monitor nearby restroom regions and provide eligible nearby-restroom alerts while the app is closed or not in use. Live Network can be turned off at any time.

Kleenest includes community reporting and blocking, support tools, privacy controls and account-deletion options. Restroom conditions, hours, accessibility and availability can change. Kleenest provides decision support rather than a guarantee about any location.

## Business — Kleenest Business

**Package:** `com.kleenest.business`

**App name:** Kleenest Business

**Short description:** Manage locations, QR engagement, trust operations, analytics and business networks.

**Full description:**

Kleenest Business gives authorized operators one workspace for managing their Kleenest presence and operating bathroom-quality programs across locations and networks.

Use Kleenest Business to:

- manage business and location information;
- create and version branded QR experiences with QR Studio;
- connect QR actions to supported check-in, review, promotion, contest, loyalty, reward, event and trust workflows;
- review business analytics and operational signals;
- manage remediation, reverification and preventive bathroom-quality work;
- upload supported evidence for operational workflows;
- configure reporting schedules and governance outputs;
- manage campaigns, promotions and enterprise/network programs where enabled;
- publish eligible business notifications through server-authorized audience controls;
- monitor aggregate Live Network motifs and configured business geofences.

Optional Business Live Network can use location in the background after an authorized operator enables the feature and grants Android permission. This supports active Business geofence operations and eligible alerts while the app is closed or not in use. Live Network can be disabled at any time.

Kleenest Business requires an authorized Kleenest business/operator account. Access and features are controlled by server-side business membership and entitlement rules.

## Fleet — Kleenest Fleet

**Package:** `com.kleenest.fleet`

**App name:** Kleenest Fleet

**Short description:** Plan routes, dispatch teams, manage fleet work and execute stops online or offline.

**Full description:**

Kleenest Fleet turns Kleenest location and trust data into an operational route and dispatch workspace for authorized fleet teams.

Use Kleenest Fleet to:

- plan routes from canonical Kleenest locations;
- dispatch routes and manage route status;
- execute ordered stops and record arrival, service, completion, departure or skip timing;
- manage drivers, vehicles and assignments;
- track maintenance and operational metrics;
- surface preventive bathroom-quality work alongside normal route operations;
- monitor selected locations and route signals;
- preserve field stop events offline and replay them through the server-authorized recovery flow when connectivity returns.

Optional Fleet Live Network can use location in the background after an authorized operator enables it for a route and grants Android permission. Android can then monitor route-stop geofences while the app is closed or not in use to support eligible arrival/departure events and route alerts. Live Network can be stopped at any time.

Kleenest Fleet requires an authorized Fleet workspace. Route, driver, vehicle, geofence and operational state remain server-authoritative.

## KleenestOS — Owner / platform operations

**Package:** `com.kleenest.platform`

**App name:** KleenestOS

**Short description:** Operate Kleenest businesses, moderation, platform data, economy and system health.

**Full description:**

KleenestOS is the authorized platform operations application for Kleenest owners and platform administrators.

Use KleenestOS to:

- review platform health, ingestion and operational status;
- administer business verification, access, memberships and service capabilities;
- manage Fleet and Enterprise access for eligible businesses;
- triage and resolve moderation, safety and reported AI content;
- configure progression objectives, XP actions and supply/economy controls;
- use the audited Data Workbench for supported platform records;
- inspect network, messaging and operational state;
- access advanced owner-only administration through server-enforced authorization.

KleenestOS does not request background location in the current release. It is intended for authorized platform operators and should use controlled distribution/reviewer access unless a public listing is intentionally approved.

## Final listing reconciliation

Before submission for each package:

1. Verify every named feature exists and is accessible in the submitted AAB for the reviewer account.
2. Remove any feature that is intentionally disabled for the release track.
3. Keep location/background-location language synchronized with the privacy policy and Play sensitive-permission declaration.
4. Do not add pricing or promotional claims until the matching Play products, billing behavior and terms are live.
5. Check store character limits in Play Console and trim without changing the meaning.
