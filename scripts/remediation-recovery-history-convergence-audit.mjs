import fs from 'node:fs';

const files={
  projections:'supabase/migrations/20260831184000_recovery_history_and_remediation_performance.sql',
  routing:'supabase/migrations/20260831184100_remediation_notification_routing_metadata.sql',
  service:'src/services/remediation.js',
  panel:'src/runtime/BusinessRemediationPanel.jsx',
  trustPanel:'src/runtime/BusinessReverificationPanel.jsx',
  webNotifications:'src/runtime/NotificationsPage.jsx',
  mobileService:'apps/consumer-mobile/services/recoveryHistory.ts',
  mobileTimeline:'apps/consumer-mobile/components/LocationRecoveryHistory.tsx',
  mobileInventory:'apps/consumer-mobile/components/LocationAmenityInventory.tsx',
  mobileRouting:'apps/consumer-mobile/services/notificationRouting.ts',
};
const failures=[];
for(const [name,file] of Object.entries(files))if(!fs.existsSync(file))failures.push(`missing ${name}: ${file}`);
if(!failures.length){
  const projections=fs.readFileSync(files.projections,'utf8').toLowerCase();
  const routing=fs.readFileSync(files.routing,'utf8').toLowerCase();
  const service=fs.readFileSync(files.service,'utf8');
  const panel=fs.readFileSync(files.panel,'utf8');
  const trustPanel=fs.readFileSync(files.trustPanel,'utf8');
  const webNotifications=fs.readFileSync(files.webNotifications,'utf8');
  const mobileService=fs.readFileSync(files.mobileService,'utf8');
  const mobileTimeline=fs.readFileSync(files.mobileTimeline,'utf8');
  const mobileInventory=fs.readFileSync(files.mobileInventory,'utf8');
  const mobileRouting=fs.readFileSync(files.mobileRouting,'utf8');

  for(const token of ['get_location_recovery_history','business_restroom_remediation_performance','proof_storage_path','community_confirmation','business_remediation','sla_met_pct','proof_rate_pct','median_resolution_minutes',"set search_path=''",'grant execute on function public.get_location_recovery_history(uuid) to anon,authenticated,service_role','revoke all on function public.business_restroom_remediation_performance(uuid,integer) from public,anon'])if(!projections.includes(token))failures.push(`Recovery/performance projection missing ${token}.`);
  for(const token of ['business_remediation_opened','business_remediation_assignment','business_remediation_sla_escalated','business_remediation_resolved',"'destination'","'web_destination'",'/workspace/business?business=','p_proof_media_id'])if(!routing.includes(token))failures.push(`Remediation routing migration missing ${token}.`);
  if(!service.includes("rpc('business_restroom_remediation_performance'"))failures.push('Business remediation service must consume canonical performance RPC.');
  for(const token of ['REMEDIATION PERFORMANCE','SLA and recovery accountability','Proof-backed fixes','Median resolution','focusCaseId','ALERT CONTEXT','getBusinessRestroomRemediationPerformance'])if(!panel.includes(token))failures.push(`Business remediation accountability UI missing ${token}.`);
  if(!trustPanel.includes("params.get('case')")||!trustPanel.includes('focusCaseId={focusCaseId}'))failures.push('Business trust operations must route alert case ids into remediation focus.');
  for(const token of ['web_destination','Open context','safeDestination','navigate(destination)'])if(!webNotifications.includes(token))failures.push(`Web notification deep-linking missing ${token}.`);
  for(const token of ["rpc('get_location_recovery_history'",'location-photos','getPublicUrl','proof_url'])if(!mobileService.includes(token))failures.push(`Mobile recovery service missing ${token}.`);
  for(const token of ['RECOVERY HISTORY','How reported issues were handled','VERIFIED RECOVERY PROOF','original community signal','business_addressing','community_confirmation'])if(!mobileTimeline.includes(token))failures.push(`Mobile recovery timeline missing ${token}.`);
  if(!mobileInventory.includes("import LocationRecoveryHistory from './LocationRecoveryHistory'")||!mobileInventory.includes('<LocationRecoveryHistory locationId={locationId} refreshToken={refreshToken}/>'))failures.push('Mobile amenity trust snapshot must render recovery history.');
  for(const token of ['safeInternalDestination','data.destination','type.includes(\'remediation\')'])if(!mobileRouting.includes(token))failures.push(`Mobile notification routing missing ${token}.`);
}
if(failures.length){console.error('Remediation recovery history convergence audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Remediation recovery history convergence audit passed.');
