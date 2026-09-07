# Kleenest App Family Recovery Design

## Goal
Restore Consumer, Business, Fleet, and KleenestOS/Owner to feature-complete, deterministic Android builds that expose first-class authentication, preserve the mature app-specific UX, retain all canonical operational capabilities, and install as verified APKs.

## Approved recovery direction
The standalone Business, Fleet, and Owner repositories are the richer reference implementations for capabilities that have drifted out of the Production monorepo. Production remains the release repository, but its operator apps must converge to those richer implementations rather than replacing them with thinner generic surfaces. Consumer keeps its mature Explore-first experience and existing production authority.

## Authentication
Business, Fleet, and Owner must have obvious startup authentication surfaces instead of burying sign-in under Account. Each operator app must support email/password, password visibility with explicit Android text/cursor colors, and Google OAuth with app-specific native redirect schemes. Owner and Business sign-up behavior must preserve backend authority rules; creating an identity does not grant privileged capability.

## Live Network
Business and Fleet must expose their complete Live Network implementations: device status, foreground/background permission state, push registration, geofence controls, realtime/live motifs or signals, clear enable/disable actions, and graceful error handling. Owner/KleenestOS must not expose a route that terminates the process; any Live Network/platform messaging entry must resolve to a stable operational surface and must never chain unsafe Android permission transitions.

## Operator parity
The repository's operator-functional-parity audit is a product contract, not a token target. Business must regain QR designer/lifecycle, notification operations, engagement CRUD, prevention/trust/governance/enterprise economy, and rich Live Network controls. Fleet must retain vehicle/driver/route/maintenance/dispatch/execution/signals/metrics/sync/premium/enterprise policy surfaces. Owner must retain authoritative people/business/progression/data/moderation/ingestion/capability administration.

## Presentation
Restore app-specific component systems and navigation rather than generic card-only replacements. Sign-in is a first-class route/gate. Inputs always declare foreground/placeholder colors. Destructive or privileged controls remain explicit, audited, and backend-authorized.

## Build determinism and security
Production source is canonical after convergence. Build-time Firebase files remain ephemeral GitHub Actions secrets and are never committed. Release candidates use EAS-managed stable signing identities, validate Android package/project IDs, verify APK signatures/packages, and publish four separate artifacts only after typecheck, CI, parity, secret-hygiene, and APK verification pass.

## Acceptance criteria
1. Four APKs install and launch without immediate termination.
2. Owner and Business show a traditional sign-in/sign-up experience with visible inputs/password dots and Google sign-in.
3. Fleet exposes equally discoverable authentication and visible inputs.
4. Business/Fleet Live Network retain the richer operational controls; Owner Live Network/platform messaging does not crash.
5. Operator functional parity, family parity, secret hygiene, typecheck, and production CI are green except for external/account configuration gates explicitly documented as such.
6. Firebase configs are not source-controlled.
7. APK package names are com.kleenest.app, com.kleenest.business, com.kleenest.fleet, and com.kleenest.platform, each signed with a stable non-debug identity.
