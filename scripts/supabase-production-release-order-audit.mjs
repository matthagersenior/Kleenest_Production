import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const read=(file)=>{
  const full=path.join(root,file);
  if(!fs.existsSync(full)){failures.push(`missing ${file}`);return ''}
  return fs.readFileSync(full,'utf8');
};
const expect=(file,needle,label=needle)=>{const text=read(file);if(text&&!text.includes(needle))failures.push(`${file} missing ${label}`)};
const reject=(file,needle,label=needle)=>{const text=read(file);if(text&&text.includes(needle))failures.push(`${file} still contains ${label}`)};

const deploy='.github/workflows/supabase-production-migrations.yml';
expect(deploy,'name: Deploy Supabase Migrations to Production','production migration workflow name');
expect(deploy,'workflows: ["Production CI"]','Production CI workflow_run gate');
expect(deploy,'github.event.workflow_run.head_sha','exact triggering main SHA checkout');
expect(deploy,'SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}','Supabase access-token secret');
expect(deploy,'SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}','Supabase DB-password secret');
expect(deploy,'SUPABASE_PROJECT_ID: ssgesjzdvdsqacdtasje','production project ref');
expect(deploy,"echo \"mode=deploy\" >> \"$GITHUB_OUTPUT\"",'privileged deploy mode');
expect(deploy,"echo \"mode=verify\" >> \"$GITHUB_OUTPUT\"",'credentialless verification mode');
expect(deploy,"if: steps.release_mode.outputs.mode == 'deploy'",'privileged CLI actions restricted to deploy mode');
expect(deploy,'supabase/setup-cli@v1','Supabase CLI setup');
expect(deploy,'supabase link --project-ref "$SUPABASE_PROJECT_ID"','linked production project');
expect(deploy,'supabase migration list','migration-history verification');
expect(deploy,'supabase db push --dry-run','pre-deploy migration preview');
expect(deploy,'supabase db push','production migration deployment');
expect(deploy,'node scripts/supabase-production-ledger-readiness.mjs','fail-closed production ledger verification');

const readiness='scripts/supabase-production-ledger-readiness.mjs';
expect(readiness,"const managedFloor='20260917061009'",'managed production migration floor');
expect(readiness,'production_migration_applied','read-only production migration probe');
expect(readiness,'if(missing.length)','missing migration fail-closed guard');
expect(readiness,'Configure deploy credentials or apply those migrations before OTA.','unapplied migration block message');

const ota='.github/workflows/ota-family.yml';
expect(ota,'workflows: ["Deploy Supabase Migrations to Production"]','database deployment as automatic OTA predecessor');
reject(ota,'workflows: ["Production CI"]','direct Production CI → OTA bypass');
reject(ota,'workflow_dispatch:','manual OTA bypass');
reject(ota,'releases/family-ota.txt','release-file push OTA bypass');

const guard='.github/workflows/supabase-production-release-order-fast.yml';
expect(guard,'push:\n    branches: [main]','main-branch release-order guard');
expect(guard,'pull_request:\n    branches: [main]','PR release-order guard');

const sourceMigration='supabase/migrations/20260917061009_quality_pass_intelligence_progression.sql';
const hardeningMigration='supabase/migrations/20260917061342_quality_pass_intelligence_security_hardening.sql';
const readinessMigration='supabase/migrations/20260917202827_production_migration_readiness_probe.sql';
for(const migration of [sourceMigration,hardeningMigration,readinessMigration]){
  if(!fs.existsSync(path.join(root,migration)))failures.push(`missing production-history migration ${migration}`);
}
if(fs.existsSync(path.join(root,'supabase/migrations/20260917050000_quality_pass_intelligence_progression.sql')))failures.push('stale pre-apply migration timestamp 20260917050000 is still present');
if(fs.existsSync(path.join(root,'supabase/migrations/20260917061250_quality_pass_intelligence_security_hardening.sql')))failures.push('stale incorrect hardening timestamp 20260917061250 is still present');
expect(hardeningMigration,'revoke all on function public.consumer_nearby_progression_opportunities','anonymous Coverage Mission RPC revoke');
expect(hardeningMigration,'user_id = (select auth.uid())','optimized trust-watch RLS');
expect(readinessMigration,'security definer','migration readiness probe definer');
expect(readinessMigration,'supabase_migrations.schema_migrations','authoritative migration ledger lookup');
expect(readinessMigration,'returns only whether a migration version is recorded','boolean-only probe contract');

if(failures.length){
  console.error(`Supabase production release-order audit failed (${failures.length}):`);
  for(const failure of failures)console.error(` - ${failure}`);
  process.exit(1);
}
console.log('Supabase production release-order audit passed: source matches the production ledger, privileged deployment remains supported, credentialless verification fails closed on pending migrations, DB readiness gates OTA, and the guard runs on PRs and main.');
