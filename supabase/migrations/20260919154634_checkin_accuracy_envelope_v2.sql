-- Production-ledger reconciliation marker.
-- This migration was applied directly to Kleenest Production before its SQL was
-- committed to source control. The authoritative current check-in accuracy
-- function is converged idempotently by
-- 20261003102000_reconcile_live_schema_and_canonical_metric.sql.
select 1;
