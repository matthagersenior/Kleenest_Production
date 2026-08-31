import fs from 'node:fs';

const files={
  migration:'supabase/migrations/20260831190000_community_fix_confirmation_and_reliability.sql',
  mobileService:'apps/consumer-mobile/services/recoveryHistory.ts',
  mobileTimeline:'apps/consumer-mobile/components/LocationRecoveryHistory.tsx',
  businessService:'src/services/remediation.js',
  businessReliability:'src/runtime/BusinessReliabilityPanel.jsx',
  trustOperations:'src/runtime/BusinessReverificationPanel.jsx',
  workspaces:'src/services/workspaces.js',
  fleet:'src/runtime/FleetWorkspacePage.jsx',
  routing:'apps/consumer-mobile/services/notificationRouting.ts',
};
const failures=[];
for(const [name,file] of Object.entries(files))if(!fs.existsSync(file))failures.push(`missing ${name}: ${file}`);
if(!failures.length){
  const migration=fs.readFileSync(files.migration,'utf8').toLowerCase();
  const mobileService=fs.readFileSync(files.mobileService,'utf8');
  const mobileTimeline=fs.readFileSync(files.mobileTimeline,'utf8');
  const businessService=fs.readFileSync(files.businessService,'utf8');
  const businessReliability=fs.readFileSync(files.businessReliability,'utf8');
  const trustOperations=fs.readFileSync(files.trustOperations,'utf8');
  const workspaces=fs.readFileSync(files.workspaces,'utf8');
  const fleet=fs.readFileSync(files.fleet,'utf8');
  const routing=fs.readFileSync(files.routing,'utf8');

  for(const token of ['remediation_confirmation','get_location_remediation_confirmation_opportunities','confirm_business_remediation','community_fix_confirmation','still_broken','community_confirmed_fix','business members cannot confirm their own remediation','a verified check-in after the business fix is required','business_remediation_recurrence','business_restroom_reliability','fleet_restroom_remediation_risk','recurrence_count','failed_fixes','operational_reliability_score',"set search_path=''",'revoke all on function public.confirm_business_remediation(uuid,text,text) from public,anon','grant execute on function public.get_location_remediation_confirmation_opportunities(uuid) to anon,authenticated,service_role'])if(!migration.includes(token))failures.push(`Confirmation/reliability migration missing ${token}.`);
  for(const token of ["rpc('get_location_remediation_confirmation_opportunities'","rpc('confirm_business_remediation'",'RemediationConfirmationOpportunity','still_broken','progression'])if(!mobileService.includes(token))failures.push(`Mobile confirmation service missing ${token}.`);
  for(const token of ['VERIFY A RECENT FIX','Did the business fix it?','Yes — fixed','Still broken','verified visit','confirmBusinessRemediation','A new business remediation case opened automatically'])if(!mobileTimeline.includes(token))failures.push(`Mobile confirmation UX missing ${token}.`);
  if(!businessService.includes("rpc('business_restroom_reliability'"))failures.push('Business remediation service must consume canonical reliability RPC.');
  for(const token of ['RESTROOM RELIABILITY','Separate recurring failures from one-time issues','Recurring failures','Failed fixes','community_confirmed_fixes','failed_fixes'])if(!businessReliability.includes(token))failures.push(`Business reliability presentation missing ${token}.`);
  if(!trustOperations.includes('BusinessReliabilityPanel')||!trustOperations.includes('<BusinessReliabilityPanel businessId={businessId}/>'))failures.push('Business trust operations must include recurrence reliability in the same control plane.');
  if(!workspaces.includes("client.rpc('fleet_restroom_remediation_risk'" )||!workspaces.includes('remediationRisk:remediationRisk.data'))failures.push('Fleet workspace service must consume canonical remediation risk.');
  for(const token of ['RESTROOM OPERATIONS RISK','Prioritize recurring and failed remediation across the fleet','Operational reliability','Failed-fix locations','failed_fix_count','Open operations'])if(!fleet.includes(token))failures.push(`Fleet remediation risk presentation missing ${token}.`);
  if(!routing.includes("type.includes('remediation')"))failures.push('Native notification routing must preserve remediation as restroom context.');
}
if(failures.length){console.error('Remediation confirmation/reliability convergence audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Remediation confirmation/reliability convergence audit passed.');
