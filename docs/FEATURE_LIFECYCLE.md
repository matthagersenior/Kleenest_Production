# Kleenest Feature Lifecycle

Kleenest uses **usable vertical slices** as the definition of a feature.

A table, migration, RPC, service, route, component, hidden screen, or feature flag is not by itself a completed feature.

## Lifecycle

`legacy-unverified → idea → data → backend → wired → discoverable → usable → persistent → verified → live`

`internal` is reserved for intentionally non-user-facing infrastructure.

Only **live** means the feature may be described as implemented, complete, shipped, or available without qualification.

## Requirements for live

A live user-facing feature must document all of the following in `config/feature-lifecycle.json`:

- the intended actor, discoverable entry point, and successful outcome;
- UI evidence and service/local-logic evidence;
- discoverability/navigation evidence;
- loading, empty, error, and success states;
- persistent state and refresh behavior, or an explicit stateless contract;
- automated verification;
- production or production-equivalent verification.

The lifecycle audit also checks that all capabilities in `config/product-parity.json` are registered.

## Existing capabilities

Capabilities that existed before this contract are marked `legacy-unverified`. This is deliberately not a claim that they are broken; it means the old parity checks mainly proved structural presence. They must be certified through the lifecycle before being called live under the new standard.

## Pull requests

For product-changing pull requests after PR #319, the PR body must include:

```
Feature-ID: consumer.discovery
Target-State: legacy-unverified
User-Flow: Explore > search > nearby results
Verification: node scripts/consumer-qa-regressions.test.mjs
```

Use comma-separated Feature IDs when one change affects multiple registered features.

For intentionally internal infrastructure:

```
Feature-ID: internal:<short-name>
Target-State: internal
User-Flow: N/A - internal infrastructure
Verification: <command or audit>
```

The checked-in registry state must match `Target-State`. Moving a feature to `live` therefore requires the registry to contain the complete evidence and pass the lifecycle audit.

## Reporting rule

When discussing Kleenest status:

- schema/data only → say **data**;
- service/API only → say **backend**;
- connected code without proven UX → say **wired**;
- reachable but not fully proven → say **discoverable/usable/persistent** as appropriate;
- tested but not production-certified → say **verified**;
- only a fully evidenced production feature → say **live**.

This contract exists so hidden capability work cannot be mistaken for a finished product feature.
