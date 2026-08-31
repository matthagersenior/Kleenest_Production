import fs from 'node:fs';
const files={migration:'supabase/migrations/20260831173142_reverification_operations_lifecycle.sql',service:'src/services/reverification.js',panel:'src/runtime/BusinessReverificationPanel.jsx',mission:'apps/consumer-mobile/services/trustMissions.ts'};
const failures=[];for(const [name,file] of Object.entries(files))if(!fs.existsSync(file))failures.push(`missing ${name}: ${file}`);
if(!failures.length){
 const migration=fs.readFileSync(files.migration,'utf8').toLowerCase();const service=fs.readFileSync(files.service,'utf8');const panel=fs.readFileSync(files.panel,'utf8');const mission=fs.readFileSync(files.mission,'utf8');
 for(const token of ['business_reverification_cases','business_reverification_operations','business_manage_reverification_case','assigned_to','assigned_at','resolved_at','resolution_reason','canonical_trust_quality_cleared','consumer_reverification_cleared','reverification_case_id'])if(!migration.includes(token))failures.push(`Reverification lifecycle migration missing ${token}.`);
 for(const token of ['enable row level security','revoke all on table public.business_reverification_cases from public,anon,authenticated','revoke all on function public.business_reverification_operations(uuid) from public,anon','grant execute on function public.business_manage_reverification_case(uuid,uuid,text) to authenticated,service_role'])if(!migration.includes(token))failures.push(`Reverification lifecycle authority missing ${token}.`);
 for(const token of ["rpc('business_reverification_operations'","rpc('business_manage_reverification_case'",'assignBusinessReverificationCase','releaseBusinessReverificationCase','dismissBusinessReverificationCase','reopenBusinessReverificationCase'])if(!service.includes(token))failures.push(`Reverification operations service missing ${token}.`);
 for(const token of ['Run the restroom trust-quality queue','Assign to me','Release','Launch reverification QR','Dismiss','Reopen','Resolved','ASSIGNED TO YOU'])if(!panel.includes(token))failures.push(`Reverification operations UI missing ${token}.`);
 if(!mission.includes('reverification_cleared')||!mission.includes('more evidence still needed'))failures.push('Consumer mission status must preserve reverification completion outcome feedback.');
}
if(failures.length){console.error('Reverification operations lifecycle audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Reverification operations lifecycle audit passed.');
