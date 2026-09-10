# Business / Enterprise Truth Hardening

Goal: make every Business/Enterprise sales claim traceable to an app seam, canonical entitlement, protected database authority, and deterministic demo evidence.

## Task 1 — Acceptance release gate
- Maintain `config/business-enterprise-acceptance.json` as the claim matrix.
- Verify service-to-RPC seams and critical schema assumptions in `scripts/business-enterprise-truth-audit.mjs`.
- Run the audit in the dedicated `Business Enterprise Truth Gate` workflow on relevant PRs/pushes.
- Treat Business member role/schema parity as part of this gate.

## Task 2 — Enterprise demo tenant
- Reuse `Matt Test Business` because it is already Enterprise-tier and `is_demo_test=true`.
- Seed five demo-only locations, QR activity/redemptions, Enterprise partners/campaign outcomes/allocations, remediation, preventive work, fleet routes, and an operational alert.
- Tag every seeded row using deterministic source/metadata markers so it can be audited and distinguished from real data.
- Expose `business_enterprise_truth_demo_snapshot()` as the authenticated acceptance readout.

## Task 3 — Canonical product authority
- Use `business_tier_capability_matrix()` as the single product truth.
- Add `business_capability_allowed()` for capability-scoped authorization.
- Make Enterprise network/campaign/allocation reads matrix-backed.
- Add table-level guards so legacy mutation RPCs cannot bypass the Enterprise-only contract.
- Keep `enterprise_operational_portfolio_snapshot()` Enterprise-only.

## Task 4 — Security / release hardening
- Remove anonymous/public execute from QR Studio RPCs while preserving authenticated/service-role execution.
- Verify Supabase security advisor output after migration.
- Require Production CI, Product Parity, Security Gate, and Business Enterprise Truth Gate before main is allowed to move. Repository administration must enforce these required checks; the current connector cannot mutate branch protection.
- Enable Supabase leaked-password protection in Auth settings if supported by the project plan; this is an Auth configuration control, not a database migration.

## Verification
- Demonstrate a red first run of the new truth gate.
- Apply the demo seed and authority migrations to Kleenest Production.
- Query deterministic evidence counts and capability matrix results.
- Confirm QR Studio anonymous execute is removed.
- Run Supabase security advisors.
- Require all PR checks to pass before merge.
