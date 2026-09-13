# Consumer Explore continuous-scroll + card parity design

**Date:** 2026-09-12  
**Scope:** Native Consumer Explore + GitHub Pages Consumer Web/PWA  
**Goal:** Make Explore feel like one coherent consumer journey, remove the split-scroll map/results behavior, standardize location-card information/actions, and promote the GitHub Pages consumer surface into a legitimate consumer web-app option.

## Product decisions

### 1. Explore is one continuous vertical experience

Native Explore uses one primary vertical scroll surface:

1. Header / search
2. Nearby vs. Along route controls
3. Radius / amenity controls
4. Map
5. Selected map-pin card when a place is selected
6. Results heading
7. Result cards
8. Missing-place contribution

The map scrolls completely offscreen when the user scrolls into results. There is no sticky map, mini-map, split-pane layout, or independent results scroller.

Map gestures remain available while the map is onscreen. The page itself remains the primary scroll surface outside deliberate map interaction.

Pull-to-refresh remains available for the Explore page.

### 2. Shared card information contract

Map-pin cards and result cards must use the same canonical place-information rules so they cannot drift apart.

The shared information model should surface, when available:

- business/location name and brand identity
- distance from the current/search origin
- address
- route-mode miles/minutes ahead
- route-mode distance off route
- restroom status: verified, restroom evidence, or needs verification
- cleanliness percentage
- rating and review count
- accessibility
- changing table/family feature
- smart-restroom indicator
- relevant requested amenity matches
- community/trust evidence and freshness
- reliable open/closed status when canonical hours data is available

Unknown values must remain unknown; the UI must not invent values or turn missing evidence into positive evidence.

### 3. Map-pin card density

The selected map-pin card is compact and glanceable.

Use icons plus numeric values wherever the meaning remains clear, for example:

- rating: ★ 4.6
- cleanliness: ✨ 92%
- verified visits: ✓ 18
- accessibility: ♿
- changing table: 👶
- smart bathroom: ◉
- verified state: ✓
- amenity-match icons where the icon is unambiguous

Keep text for information that does not compress safely into an icon:

- location/business name
- distance
- address
- route miles/minutes ahead
- distance off route
- state labels that need explanation, such as “Needs verification”

Do not introduce a synthetic generic “trust score” unless there is a separately approved, defensible scoring model.

The three primary actions remain explicit text buttons:

- Start navigation
- Add to route
- Full details

### 4. Result-card density

Search-result cards carry enough context to make a decision after the map has scrolled offscreen.

Each result card includes the same canonical place data, with room for explanatory labels where useful.

Every result card exposes direct actions:

- Start navigation
- Add to route
- Full details

Tapping/selecting the informational portion of the card still selects/focuses the corresponding map location for users who scroll back to the map.

### 5. Action behavior

Native:
- Start navigation opens the existing Google Maps driving URL through Expo Linking.
- Add to route uses the existing Consumer route-add path and telemetry.
- Full details opens the canonical Consumer location detail route.

Web/PWA:
- Start navigation opens the existing direct navigation URL.
- Add to route opens the existing web Route page with the location ID seeded in the query string.
- Full details opens the canonical web location route.

Actions must not be hidden behind a second interaction.

### 6. GitHub Pages Consumer Web/PWA positioning

The GitHub Pages consumer surface is treated as **Kleenest Consumer Web**, not a demo-only website.

It should support the core consumer loop:

**find → evaluate → navigate → route → save → check in/review → account/community**

Native applications may retain enhanced device/platform capabilities, but the web app should remain a viable consumer option where browser APIs support the feature.

Existing PWA foundations remain authoritative:
- installable web-app manifest
- standalone display
- service worker
- offline shell
- push handler
- geolocation
- mobile bottom navigation

### 7. Web Explore parity

Web Explore should converge with the same consumer contract:

- rich place cards
- distance and trust/restroom signals
- direct Start navigation
- direct Add to route
- Full details
- mobile-first layout
- proper full-page document scrolling
- map selection card and result cards use the same place-signal rules where practical

The web surface does not need pixel-perfect native duplication; it does need behavior and decision-information parity.

## Implementation boundaries

Prefer focused shared helpers/components over copying signal logic into multiple cards.

Native changes should stay within Consumer presentation/components unless a missing canonical data field requires an existing service projection adjustment.

Web changes should stay within runtime consumer components/styles/services where possible.

Do not alter Business, Fleet, Enterprise, or KleenestOS authority.

Do not weaken current adaptive-search, trust, caching, route, or security contracts.

## Verification contract

Regression coverage must prove:

- Native Explore no longer advertises or implements “map stays fixed” split scrolling.
- Native Explore has one primary vertical scroll surface.
- Native result cards expose Start navigation, Add to route, and Full details.
- Native selected map card preserves those same actions.
- Map cards prefer compact icon/numeric signals rather than long trust prose.
- Web Explore exposes Start navigation, Add to route, and Full details from each result.
- Web map-selected card exposes the same three actions.
- PWA manifest/service worker registration remain intact.
- Consumer presentation/security authority audits remain green.
- Native Consumer typecheck and web production build remain green.

## Out of scope

- A sticky or collapsing mini-map.
- A new trust-score algorithm.
- Replacing Google Maps as the launch target for direct navigation.
- Rebuilding native and web with a single cross-platform UI framework.
- Broad unrelated Consumer redesign.
