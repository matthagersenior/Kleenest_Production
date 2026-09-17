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
expect(deploy,'id-token: write','GitHub OIDC permission');
expect(deploy,'SUPABASE_READINESS_AUDIENCE: kleenest-supabase-production-readiness','OIDC readiness audience');
expect(deploy,'RELEASE_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}','OIDC release SHA binding');
expect(deploy,"echo \"mode=deploy\" >> \"$GITHUB_OUTPUT\"",'privileged deploy mode');
expect(deploy,"echo \"mode=verify\" >> \"$GITHUB_OUTPUT\"",'credentialless verification mode');
expect(deploy,"if: steps.release_mode.outputs.mode == 'deploy'",'privileged CLI actions restricted to deploy mode');
expect(deploy,'supabase/setup-cli@v1','Supabase CLI setup');
expect(deploy,'supabase link --project-ref "$SUPABASE_PROJECT_ID"','linked production project');
expect(deploy,'supabase migration list','migration-history verification');
expect(deploy,'supabase db push --dry-run','pre-deploy migration preview');
expect(deploy,'supabase db push','production migration deployment');
expect(deploy,"if: steps.release_mode.outputs.mode == 'verify'",'OIDC readiness restricted to credentialless mode');
expect(deploy,'node scripts/supabase-production-ledger-readiness.mjs','fail-closed production ledger verification');
reject(deploy,'SUPABASE_PUBLISHABLE_KEY','publishable-key readiness bypass');

const readiness='scripts/supabase-production-ledger-readiness.mjs';
expect(readiness,"const managedFloor='20260917061009'",'managed production migration floor');
expect(readiness,'ACTIONS_ID_TOKEN_REQUEST_URL','GitHub OIDC request URL');
expect(readiness,'ACTIONS_ID_TOKEN_REQUEST_TOKEN','GitHub OIDC request token');
expect(readiness,'kleenest-supabase-production-readiness','OIDC audience');
expect(readiness,'/functions/v1/production-migration-readiness','OIDC-protected Supabase Edge Function');
expect(readiness,'expected_sha:releaseSha','OIDC SHA binding');
expect(readiness,'response.status===409','missing migration fail-closed guard');
expect(readiness,'Configure deploy credentials or apply those migrations before OTA.','unapplied migration block message');
reject(readiness,'/rest/v1/rpc/production_migration_applied','direct public RPC readiness access');
reject(readiness,'SUPABASE_PUBLISHABLE_KEY','publishable key in readiness verifier');

const edge='supabase/functions/production-migration-readiness/index.ts';
expect(edge,'https://token.actions.githubusercontent.com','GitHub OIDC issuer');
expect(edge,'kleenest-supabase-production-readiness','GitHub OIDC audience');
expect(edge,'matthagersenior/Kleenest_Production','exact repository binding');
expect(edge,'refs/heads/main','main ref binding');
expect(edge,'supabase-production-migrations.yml','exact workflow binding');
expect(edge,'workflow_run','workflow-run event binding');
expect(edge,'workflow_dispatch','manual database verification event binding');
expect(edge,'crypto.subtle.verify','OIDC signature verification');
expect(edge,'SUPABASE_SERVICE_ROLE_KEY','service-role internal RPC call');
expect(edge,'production_migration_applied','internal migration-ledger probe');
expect(edge,'body.expected_sha !== claims.sha','release SHA enforcement');

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
const oidcHardeningMigration='supabase/migrations/20260917205208_restrict_production_migration_readiness_probe_service_role.sql';
for(const migration of [sourceMigration,hardeningMigration,readinessMigration,oidcHardeningMigration]){
  if(!fs.existsSync(path.join(root,migration)))failures.push(`missing production-history migration ${migration}`);
}
if(fs.existsSync(path.join(root,'supabase/migrations/20260917050000_quality_pass_intelligence_progression.sql')))failures.push('stale pre-apply migration timestamp 20260917050000 is still present');
if(fs.existsSync(path.join(root,'supabase/migrations/20260917061250_quality_pass_intelligence_security_hardening.sql')))failures.push('stale incorrect hardening timestamp 20260917061250 is still present');
expect(hardeningMigration,'revoke all on function public.consumer_nearby_progression_opportunities','anonymous Coverage Mission RPC revoke');
expect(hardeningMigration,'user_id = (select auth.uid())','optimized trust-watch RLS');
expect(readinessMigration,'security definer','migration readiness probe definer');
expect(readinessMigration,'supabase_migrations.schema_migrations','authoritative migration ledger lookup');
expect(readinessMigration,'returns only whether a migration version is recorded','boolean-only probe contract');
expect(oidcHardeningMigration,'revoke all on function public.production_migration_applied(text) from anon','anonymous readiness RPC revoke');
expect(oidcHardeningMigration,'revoke all on function public.production_migration_applied(text) from authenticated','authenticated readiness RPC revoke');
expect(oidcHardeningMigration,'grant execute on function public.production_migration_applied(text) to service_role','service-role-only readiness RPC');

if(failures.length){
  console.error(`Supabase production release-order audit failed (${failures.length}):`);
  for(const failure of failures)console.error(` - ${failure}`);
  process.exit(1);
}
console.log('Supabase production release-order audit passed: source matches the production ledger, privileged deployment remains supported, credentialless verification uses GitHub OIDC instead of public RPC access, DB readiness gates OTA, and the guard runs on PRs and main.');
