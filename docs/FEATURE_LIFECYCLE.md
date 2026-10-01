# Kleenest Feature Lifecycle

Kleenest uses **usable vertical slices** as the definition of a feature.

A table, migration, RPC, service, route, component, hidden screen, or feature flag is not by itself a completed feature.

## Lifecycle

`legacy-unverified → idea → data → backend → wired → discoverable → understandable → usable → persistent → verified → live`

`internal` is reserved for intentionally non-user-facing infrastructure.

Only **live** means the feature may be described as implemented, complete, shipped, or available without qualification.

## Requirements for live

A live user-facing feature must document all of the following in `config/feature-lifecycle.json`:

- the intended actor, discoverable entry point, plain-language value promise, primary action, successful outcome, and visible success cue;
- a reasonable path to first value of seven user steps or fewer;
- plain-language comprehension evidence showing the feature can be understood without implementation terminology;
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
- reachable but not yet clear to an ordinary user → say **discoverable**;
- clear enough that the intended user can understand the promise and next action → say **understandable**;
- usable/persistent but not fully verified → say **usable/persistent** as appropriate;
- tested but not production-certified → say **verified**;
- only a fully evidenced production feature → say **live**.

This contract exists so hidden capability work cannot be mistaken for a finished product feature.


## Product comprehension rule

Kleenest exists to reduce a real-world decision to something a normal person can understand and act on quickly.

For every user-facing feature, verify:

1. **What do I get?** The value promise is visible before advanced controls.
2. **What do I do?** The primary action is obvious in ordinary language.
3. **What happened?** Success is visible without interpreting internal status.
4. **Was Kleenest worth using?** The user reaches useful value in seven actions or fewer unless the workflow is inherently multi-stage.

Terms such as canonicalization, ingestion, RPC, evidence gaps, progression, corridor, and internal trust mechanics must not be required vocabulary for an ordinary Consumer or Business user. Those concepts can remain in KleenestOS or supporting explanations where appropriate.
