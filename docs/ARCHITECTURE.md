# Kleenest canonical architecture

## Purpose

This document defines ownership boundaries in `Kleenest_Production` so cleanup and future implementation do not reintroduce duplicate product surfaces or delete retained runtime/source material accidentally.

## Product surfaces

### Consumer — `apps/consumer-mobile`

The public-facing Kleenest application. It owns discovery and Explore, map/search/location detail behavior, verified visits/check-ins, reviews and photo evidence, QR scanning, trust/evidence presentation, saved places/routes, community/social features, progression/games, notifications, profile/support/legal/account controls and the Consumer web preview.

Consumer package: `com.kleenest.app`.

### Business — `apps/business-mobile`

The operator application for businesses and networks. It owns business/location administration, Business Core mutations, QR Studio and engagement programs, trust/remediation/reverification/preventive operations, analytics, reporting/governance, promotions/campaigns/contests/events, Live Network messaging/geofences and enterprise/network economy.

Business package: `com.kleenest.business`.

### Fleet — `apps/fleet-mobile`

The operational fleet application. It owns planner/map routing, dispatch, route and stop lifecycle, driver/vehicle administration, maintenance, geofence execution, route timing/signals, operational metrics and durable offline field-event replay.

Fleet package: `com.kleenest.fleet`.

### KleenestOS / Owner — `apps/platform-mobile`

The platform control plane. It owns owner authorization, system health/ingestion visibility, business verification/access/membership, moderation, progression/economy controls, audited data workbench operations, platform operations and network messaging oversight.

KleenestOS package: `com.kleenest.platform`.

## Shared mobile layer

`packages/mobile-core` contains cross-app primitives and contracts. Shared code belongs here only when behavior is genuinely common and does not collapse distinct authorization or product responsibilities between apps.

## Root web runtime

`src/` remains a retained runtime/reference surface. It is not permission to create a second canonical mobile implementation. Until the capability ledger marks remaining web/runtime reconciliation complete, cleanup must preserve it and reconcile unique behavior deliberately.

## Supabase authority

`supabase/` is the source-controlled backend boundary for migrations and Edge Functions that have been reconciled into the canonical repository.

Production authorization and state transitions should remain server authoritative. Mobile clients should invoke scoped RPCs/functions and then refresh authoritative state rather than locally inventing business truth.

Known live/source drift is tracked in `config/capability-parity-ledger.json`. Cleanup must not delete live backend behavior simply because its source has not yet been reconciled.

## Data and trust model

Kleenest distinguishes a place/location identity from observations, evidence, provenance, confidence, freshness, verification and contradictions. Product UI may present a simplified location record, but ingestion and trust systems should retain provenance and auditability without storing redundant copies of the same facts.

## Ingestion architecture

All place acquisition paths converge on `public.ingest_external_locations`. Acquisition code must not write canonical `locations` rows directly.

The ingestion layers are:

1. **Official Overture Places — primary broad POI backbone.** `.github/workflows/overture-places-ingest.yml` and `scripts/overture-places-ingest.py` read bounded Overture GeoParquet windows and use the canonical source key `overture`. Consumer/search hydration requests use `place_discovery_hydration_queue`.
2. **Civic/open data — authoritative local enrichment.** `corridor-open-data-ingestor` processes enabled source-specific adapters such as Chicago and Kansas City Socrata datasets. Overture must not be acquired through this adapter layer.
3. **OpenStreetMap — secondary discovery/enrichment.** `focus-ingestion-orchestrator` runs bounded Overpass work with source quotas, provider health breakers, a storage guard and overlap leases. Public Overpass availability is not a reason to raise concurrency.
4. **Interactive discovery.** `ingest-map-candidates-v3` may query live providers for latency-sensitive consumer discovery, but successful results still persist through `ingest_external_locations`.
5. **Cold provenance/archive.** `cold-provenance-offloader` and `geo-catalog-exporter` transfer verified immutable batches to Kleenest_Data object storage before eligible hot provenance rows are acknowledged/deleted.

`public.locations` is the hot canonical place registry. `external_location_records` is the hot source-identity/dedup map, not a raw payload warehouse. Historical/raw provenance belongs in the verified Kleenest_Data object archive.

A transport adapter and a canonical source identity are different concepts. Do not create alternate canonical source keys for the same provider merely because a different transport is used. In particular, legacy `overture_places` / Fused Overture acquisition is retired; existing rows are retained for coverage/provenance while new Overture acquisition uses `overture`.

Internal ingestion control tables remain in `public` only for compatibility with existing Edge Functions/RPCs. Future schema hardening should move control-plane state behind internal/service-only interfaces incrementally, with compatibility RPCs, rather than bulk schema moves that break deployed clients.

## Release and CI ownership

- `.github/workflows/ci.yml` — production/source authority gate.
- `.github/workflows/product-parity.yml` — cross-app capability and typecheck gate.
- `.github/workflows/android-family.yml` — four-app native release APK build, binary verification and Android 16 startup smoke.
- `.github/workflows/ota-family.yml` — family OTA publishing path where compatible.
- Consumer Pages/installer deployment owns the public web preview, legal pages and direct Consumer APK surface.

Production Google Play publishing uses each app's EAS `production` profile and Android App Bundle output. APK workflows are QA/installability proof, not the normal Play production upload format.

## Capability regression system

The canonical audits include:

- `scripts/product-parity-audit.mjs`
- `scripts/capability-parity-ledger-audit.mjs`
- `scripts/app-family-critical-path-audit.mjs`
- `scripts/operator-functional-parity-audit.mjs`
- `scripts/fleet-extended-operator-audit.mjs`
- `scripts/fleet-offline-recovery-audit.mjs`
- `scripts/play-store-matrix-audit.mjs`
- `scripts/repo-hygiene-audit.mjs`

When a bug reveals a semantic contract that can regress, encode the contract in an audit rather than relying only on prose.

## Cleanup rules

Before removing a file or workflow:

1. Search root package scripts.
2. Search all GitHub workflows.
3. Search app/package imports and references.
4. Determine whether the file is current implementation, migration helper, CI guardrail, historical provenance or obsolete output.
5. Preserve historical provenance in `docs/` or version history when deletion would make architectural decisions impossible to reconstruct.

Generated Expo native directories are not canonical source in this repository; CI generates them with clean prebuilds. Signing keys, environment files and release binaries are not source-controlled.
