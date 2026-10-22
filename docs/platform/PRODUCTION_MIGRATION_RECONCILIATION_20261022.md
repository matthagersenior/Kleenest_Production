# Kleenest Supabase production migration history reconciliation — October 22, 2026

**Production project:** `ssgesjzdvdsqacdtasje`  
**Source authority:** `Kleenest_Production/main`  
**Resolution:** Reconstruct source history from Supabase's *actual stored applied SQL*, repair verified-but-unrecorded history entries, and apply one genuinely missing checkpoint schema after a live read-only source extraction proof.

## Why releases were blocked

GitHub OIDC release readiness (`scripts/supabase-production-ledger-readiness.mjs`) correctly rejected divergence in `supabase_migrations.schema_migrations`: Supabase MCP migration calls had generated real execution-time versions that did not correspond to the planned migration file timestamps. The gate is intentionally bidirectional. **It was not weakened or disabled.**

## Repair evidence

1. Captured actual `version`, `name` and `statements` from `supabase_migrations.schema_migrations`; restored all 20 production-only files with their original, production-recorded SQL. These are *actual applied changes*, not placeholders.
2. Removed nine source migrations that duplicated the effects of production migrations under a different timestamp. Matched using normalized code and manually checked the affected deployed structures; preserved the production-recorded version and SQL.
3. Five source-only migrations were **already effective** in production but absent from history: `20261018224500` (service-only AI worker bridge), `20261018225800` (owner-authorized AI jobs snapshot), `20261018231000` (four enabled deep intelligence catalogs), `20261018231500` (daily deep-intelligence function and active cron), and `20261018235530` (30-minute dispatcher functions and active cron). Their required runtime objects, guards, catalogs and schedules were verified *before* inserting corresponding metadata-only history records in a serialized transaction. No DDL or duplicate scheduled jobs were executed for these five.
4. The only genuinely missing schema was `overture_hydration_checkpoints`. Before applying it, the live **read-only** Overture GeoParquet extraction was tested with a production-representative tile (2026-09-23.1 release), returning 250 rows; no task was claimed and no database write occurred. Test proof: [Overture preflight run 39849199175](https://github.com/matthagersenior/Kleenest_Production/actions/runs/39849199175).
5. Fixed the Overture extraction code for GeoParquet's native `GEOMETRY` column (previous nested `ST_GeomFromWKB(geometry)` caused a DuckDB BinderException); updated corresponding unit test.
6. Applied the checkpoint migration through Supabase. It recorded production version `20261022202950`; moved the source SQL file to the same version **after byte-for-byte comparison against stored production SQL**. Verified the checkpoint table exists, its RLS is enabled and claim/stage functions are present.
7. Read back both ledgers and compared exact timestamp sets at the strict gate's managed floor `20260917061009`: **144 source versions, 144 production versions, zero source-only, zero production-only, zero duplicate source versions**.

## Preserve release safety

- Keep the OIDC strict bidirectional readiness check intact. Do not mark unapplied migrations as applied, drop migration records or bypass the release gate.
- For future schema migrations, use the **native GitHub-to-Supabase migration deployment flow** so source filenames are registered with their exact 14-digit timestamp.
- If the supported Supabase MCP `apply_migration` tool is used on the production database, it chooses an execution-time migration version. Before merging related source code, read `supabase_migrations.schema_migrations`, record its **actual** SQL and version, and align the source migration file. Otherwise the release gate will correctly reject the divergence.
- A matching migration ledger is **necessary but not sufficient** for production readiness: CI, native binaries, service availability and user-flow smoke tests are separate gates.
- No credentials, private account data or raw query outputs from customer tables were copied to GitHub.

## Post-merge checks

1. Run strict OIDC `Supabase Production Release Order Fast` on `main`; it must report identical ledgers.
2. Verify active Overture hydration scheduled worker can claim and stage under service permissions without exposing public RPC privileges. Check staged candidate counts and failure alerts.
3. Verify KleenestOS owner AI dashboard permissions and the new Smart Facilities product controls remain intact.
4. Continue existing Consumer/Owner OTA and Pages publishing only after their normal release gates pass.
