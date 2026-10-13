# Kleenest Production Agent Contract

`main` is the single production source of truth for the Kleenest app family. Short-lived branches and pull requests are transport mechanisms only; they are never a finished state.

## Completion contract

For every implementation, upgrade, fix, migration, dependency update, or release change:

1. Start from current `main`.
2. Prefer one focused branch and one PR per task. Do not create parallel PRs for the same change.
3. A task is **not complete** when code is pushed, a PR is opened, or CI is merely running.
4. Stay with the change through required CI. If CI fails, inspect the failing job/log, fix the actual cause, push the fix, and re-run/observe CI in the same task.
5. Treat transient CI failures as retryable once. Repeated failures require a code/configuration fix, not repeated blind reruns.
6. Merge the PR into `main` as soon as required checks are green and repository rules permit it.
7. Delete the merged task branch when possible.
8. Before reporting completion, verify:
   - the PR is merged or intentionally closed;
   - the resulting commit is on `main`;
   - required checks for the merged/current `main` state are not left failing because of this task;
   - no duplicate or superseded PR for the same work remains open.
9. Never leave a task in a "PR open", "CI pending", "waiting for checks", or "needs branch update" state unless an external credential/approval or an actual unresolved failure makes completion impossible. In that case, report the exact blocker and evidence.
10. If `main` advances while a PR is running, refresh the PR branch only when GitHub's merge rules require it. Do not fail application CI merely because the branch is behind `main`.

## Product completion

A Kleenest feature is not implemented merely because schema, migrations, RPCs, services, routes, or hidden code exist. Normal intended users must be able to discover it, navigate to it, use it successfully, receive feedback, and see persisted state after refresh/relaunch. Verify the relevant production or production-equivalent surface before calling the feature complete.

## Repository hygiene

Keep `main` canonical. Avoid long-lived integration, repair, sync, or duplicate feature branches. Do not preserve an old branch as an alternate source of behavior once its intended work is represented on `main`.

## Production migration identity

- Supabase migration versions are release identities, not interchangeable timestamps. Once Production has applied a migration, the file in `supabase/migrations/` must retain the **exact version in `supabase_migrations.schema_migrations`** and its original SQL.
- Before reconciling drift, compare the complete Production ledger against the source tree, then compare content of any apparently renamed migration. If production SQL matches but the local filename does not, restore the deployed version in source rather than rerunning SQL or fabricating migration ledger records.
- Do not delete Production migration records, reapply an already-applied migration under a new version, or edit deployed SQL to silence release checks. Follow-on schema changes require a new migration.
- After a reconciliation, verify no source-only or Production-only versions remain, keep all SQL unchanged, and let the OIDC-backed production-readiness gate verify the deployed `main` commit.
