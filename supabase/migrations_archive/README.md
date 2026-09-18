# Supabase migration archive

This directory preserves source-controlled migration files whose SQL is already represented in the Kleenest Production migration ledger under a different applied timestamp or equivalent production migration.

The active `supabase/migrations/` directory is reconciled to the authoritative production ledger so the native Supabase GitHub integration can deploy from `main` without rewriting production migration history.

Do not move archived migrations back into the active directory without first checking the production ledger. New schema changes must use new migration timestamps and remain in `supabase/migrations/`.

Reconciliation performed 2026-09-17:
- Production ledger entries preserved in active history: 1,338
- Previously source-only applied duplicates moved here: 181
- Confirmed pending source migrations left active: 6
- Native GitHub deployment probe left active: 1
