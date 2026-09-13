# Consumer Explore continuous-scroll + card parity implementation plan

## Task 1 — Guard the approved UX contract

**Files**
- `scripts/native-consumer-presentation-convergence-audit.mjs`
- proposed: `scripts/consumer-web-pwa-parity-audit.mjs` if existing web audit coverage cannot express the contract
- relevant CI workflow(s) that already run consumer presentation/web audits

**Behavior**
- Fail if native Explore contains the old “map stays fixed” split-scroll contract.
- Require one primary vertical scroll surface for native Explore.
- Require native result cards and selected map card to expose Start navigation, Add to route, and Full details.
- Require compact selected-map signals instead of the long trust sentence.
- Require web Explore result cards and map selection card to expose the same three actions.
- Preserve PWA manifest + service-worker registration checks.

**Focused verification**
- Audit must fail against the pre-change implementation.
- Audit must pass only after Tasks 2–4.

## Task 2 — Native Explore continuous scrolling + canonical card signals

**Files**
- `apps/consumer-mobile/features/AdaptiveExploreScreen.tsx`
- `apps/consumer-mobile/components/RestroomSignals.tsx`

**Interfaces**
- Add/export a compact signal presentation for selected-map cards using existing row fields and trust enrichment.
- Result-card props gain direct action callbacks: select, start navigation, add to route, full details.
- Existing search, adaptive expansion, route search, cache, geocoding, telemetry, and navigation helpers remain authoritative.

**Behavior**
- Replace the outer fixed header/map + nested `FlatList` arrangement with one vertical scroll surface.
- Map scrolls naturally offscreen.
- Pull-to-refresh remains on the primary scroll surface.
- Preserve horizontal scrollers for radius and amenities.
- Result cards show decision-critical identity, address, distance/route position, restroom signals, trust/freshness, and direct actions.
- Selected map card uses compact icons/numbers plus text only for name/address/distance/status that cannot safely compress.
- Do not create a synthetic trust score.

**Edge cases**
- Missing coordinates disable Start navigation without hiding the other actions.
- Unknown ratings/cleanliness/amenities are omitted rather than displayed as zero.
- Cached results retain the same card/action behavior.
- Along-route results continue to show route position and distance off route.

**Focused verification**
- Consumer TypeScript typecheck.
- Native consumer presentation convergence audit.
- Adaptive Explore audit.

## Task 3 — GitHub Pages Consumer Explore parity

**Files**
- `src/runtime/ExplorePage.jsx`
- `src/styles.css`
- small shared runtime helper/component only if it reduces duplicate card signal logic

**Behavior**
- Preserve normal document scrolling; no nested result pane.
- Enrich web result cards with canonical available restroom/trust signals.
- Add direct Start navigation, Add to route, and Full details actions to every result.
- Add the same three actions to the map-selected card.
- Add-to-route routes to `/route?add=<locationId>`.
- Maintain mobile-first responsive behavior and existing MapLibre selection behavior.

**Edge cases**
- Missing coordinates disable/omit Start navigation.
- Missing signal values are omitted.
- Existing search/radius/geolocation failures remain visible and non-destructive.

**Focused verification**
- Web production build.
- Consumer web parity audit.
- Existing GitHub Pages convergence checks.

## Task 4 — PWA positioning and final integration verification

**Files**
- `public/manifest.webmanifest` only if product copy needs clarification
- existing web/consumer audit and documentation surfaces as needed

**Behavior**
- Preserve installable standalone PWA behavior, service worker, push handler, geolocation, and bottom navigation.
- Treat the Pages runtime as Kleenest Consumer Web without removing native-only advantages.

**Final verification**
- Native consumer typecheck.
- Web production build.
- Consumer presentation/adaptive-search audits.
- Product parity/security/authority audits that cover Consumer.
- PR checks green at final head before merge.
- Merge only after final-head verification.

## Unresolved product decisions

None. The user explicitly chose natural full-page scrolling with the map scrolling offscreen, compact icon/number map cards, richer result cards, and direct text actions for Start navigation / Add to route / Full details.
