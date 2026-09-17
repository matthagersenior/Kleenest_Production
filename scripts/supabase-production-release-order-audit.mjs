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
expect(deploy,'supabase/setup-cli@v1','Supabase CLI setup');
expect(deploy,'SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}','Supabase access-token secret');
expect(deploy,'SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}','Supabase DB-password secret');
expect(deploy,'SUPABASE_PROJECT_ID: ssgesjzdvdsqacdtasje','production project ref');
expect(deploy,'supabase link --project-ref "$SUPABASE_PROJECT_ID"','linked production project');
expect(deploy,'supabase migration list','migration-history verification');
expect(deploy,'supabase db push --dry-run','pre-deploy migration preview');
expect(deploy,'supabase db push','production migration deployment');

const ota='.github/workflows/ota-family.yml';
expect(ota,'workflows: ["Deploy Supabase Migrations to Production"]','database deployment as automatic OTA predecessor');
reject(ota,'workflows: ["Production CI"]','direct Production CI → OTA bypass');

const sourceMigration='supabase/migrations/20260917061009_quality_pass_intelligence_progression.sql';
const hardeningMigration='supabase/migrations/20260917061250_quality_pass_intelligence_security_hardening.sql';
if(!fs.existsSync(path.join(root,sourceMigration)))failures.push(`missing production-history migration ${sourceMigration}`);
if(!fs.existsSync(path.join(root,hardeningMigration)))failures.push(`missing production-history migration ${hardeningMigration}`);
if(fs.existsSync(path.join(root,'supabase/migrations/20260917050000_quality_pass_intelligence_progression.sql')))failures.push('stale pre-apply migration timestamp 20260917050000 is still present');
expect(hardeningMigration,'revoke all on function public.consumer_nearby_progression_opportunities','anonymous Coverage Mission RPC revoke');
expect(hardeningMigration,'user_id = (select auth.uid())','optimized trust-watch RLS');

if(failures.length){
  console.error(`Supabase production release-order audit failed (${failures.length}):`);
  for(const failure of failures)console.error(` - ${failure}`);
  process.exit(1);
}
console.log('Supabase production release-order audit passed: production migration history is source-controlled and DB deployment gates automatic family OTA.');
