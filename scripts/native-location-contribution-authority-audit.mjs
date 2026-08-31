import fs from 'node:fs';

const migration='supabase/migrations/20260831082500_mobile_location_contribution_rls_convergence.sql';
const failures=[];
if(!fs.existsSync(migration))failures.push(`missing location contribution migration: ${migration}`);
else{
  const sql=fs.readFileSync(migration,'utf8');
  for(const token of ['kleenest_location_claims_access','kleenest_location_submissions_owner','location_quality_observations_insert_own','location_observation_votes_own','review_amenity_feedback_authenticated_read','public.business_can_manage(business_id)','public.business_can_manage(claimed_business_id)'])if(!sql.includes(token))failures.push(`location contribution migration missing token: ${token}`);
  const unsafe=(sql.match(/auth\.uid\(\)/g)||[]).length;
  const safe=(sql.match(/\(select auth\.uid\(\)\)/g)||[]).length;
  if(unsafe!==safe)failures.push('all auth.uid() checks in location contribution migration must use init-plan-safe select form');
  if(!sql.includes('with check (user_id = (select auth.uid()))'))failures.push('quality observation writes must remain self-owned');
  if(!sql.includes('using ((select auth.uid()) is not null)'))failures.push('amenity feedback read must continue requiring a real signed-in user');
}
if(failures.length){console.error('Native location contribution authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native location contribution authority audit passed.');
