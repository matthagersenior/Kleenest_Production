import fs from 'node:fs';

const files={
  workflow:'supabase/migrations/20260831171000_reverification_workflow_convergence.sql',
  mission:'supabase/migrations/20260831171100_reverification_mission_execution.sql',
  trust:'apps/consumer-mobile/services/trustMissions.ts',
  qrService:'apps/consumer-mobile/services/qrActions.ts',
  qrScreen:'apps/consumer-mobile/app/qr.tsx',
  businessService:'src/services/reverification.js',
  businessPanel:'src/runtime/BusinessReverificationPanel.jsx',
  businessPage:'src/runtime/BusinessWorkspacePage.jsx',
};
const failures=[];
for(const [name,file] of Object.entries(files))if(!fs.existsSync(file))failures.push(`missing ${name}: ${file}`);
if(!failures.length){
  const workflow=fs.readFileSync(files.workflow,'utf8').toLowerCase();
  const mission=fs.readFileSync(files.mission,'utf8').toLowerCase();
  const trust=fs.readFileSync(files.trust,'utf8');
  const qrService=fs.readFileSync(files.qrService,'utf8');
  const qrScreen=fs.readFileSync(files.qrScreen,'utf8');
  const businessService=fs.readFileSync(files.businessService,'utf8');
  const businessPanel=fs.readFileSync(files.businessPanel,'utf8');
  const businessPage=fs.readFileSync(files.businessPage,'utf8');
  for(const token of ['3_to_1_canonical_observation_consensus','business_reverification_queue','business_create_reverification_qr','trust_reverification','trust_mission','needs_reverification','resolved_by_consensus'])if(!workflow.includes(token))failures.push(`Reverification workflow migration missing ${token}.`);
  for(const token of ['start_reverification_trust_mission','complete_reverification_trust_mission','requires_conflict_resolution','reverification_cleared','contradictions_before','contradictions_after'])if(!mission.includes(token))failures.push(`Reverification mission migration missing ${token}.`);
  for(const token of ['revoke all on function public.business_reverification_queue(uuid) from public,anon','grant execute on function public.business_reverification_queue(uuid) to authenticated,service_role','revoke all on function public.start_reverification_trust_mission(uuid,text) from public,anon','grant execute on function public.complete_reverification_trust_mission(uuid) to authenticated,service_role'])if(!(workflow+mission).includes(token))failures.push(`Reverification authority missing ${token}.`);
  for(const token of ["'qr_reverification'","rpc('start_reverification_trust_mission'","rpc('complete_reverification_trust_mission'",'requires_conflict_resolution','reverification_cleared'])if(!trust.includes(token))failures.push(`Mobile trust mission service missing ${token}.`);
  for(const token of ["rpc('resolve_custom_qr_action'","rpc('record_qr_attribution'",'trust_mission',"'qr_reverification'"])if(!qrService.includes(token))failures.push(`Mobile QR action service missing ${token}.`);
  for(const token of ['REVERIFICATION MISSION','Start trust mission','executeQrAction'])if(!qrScreen.includes(token))failures.push(`Mobile QR presentation missing ${token}.`);
  if(!businessService.includes("rpc('business_reverification_queue'")||!businessService.includes("rpc('business_create_reverification_qr'"))failures.push('Business reverification service must use canonical queue and QR RPCs.');
  for(const token of ['REVERIFICATION OPERATIONS','Create reverification QR','priority_score','suggested_action'])if(!businessPanel.includes(token))failures.push(`Business reverification panel missing ${token}.`);
  if(!businessPage.includes('BusinessReverificationPanel'))failures.push('Business workspace must render the reverification control panel.');
}
if(failures.length){console.error('Reverification workflow convergence audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Reverification workflow convergence audit passed.');
