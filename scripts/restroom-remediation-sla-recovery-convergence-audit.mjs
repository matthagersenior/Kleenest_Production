import fs from 'node:fs';

const files={
  authority:'supabase/migrations/20260831181500_business_restroom_remediation_sla_proof_event_convergence.sql',
  operations:'supabase/migrations/20260831181550_business_restroom_remediation_sla_operations_projection.sql',
  consumer:'supabase/migrations/20260831181600_consumer_amenity_business_recovery_projection.sql',
  service:'src/services/remediation.js',
  panel:'src/runtime/BusinessRemediationPanel.jsx',
  mobileService:'apps/consumer-mobile/services/amenities.ts',
  mobilePanel:'apps/consumer-mobile/components/LocationAmenityInventory.tsx',
};
const failures=[];
for(const [name,file] of Object.entries(files))if(!fs.existsSync(file))failures.push(`missing ${name}: ${file}`);
if(!failures.length){
  const authority=fs.readFileSync(files.authority,'utf8').toLowerCase();
  const operations=fs.readFileSync(files.operations,'utf8').toLowerCase();
  const consumer=fs.readFileSync(files.consumer,'utf8').toLowerCase();
  const service=fs.readFileSync(files.service,'utf8');
  const panel=fs.readFileSync(files.panel,'utf8');
  const mobileService=fs.readFileSync(files.mobileService,'utf8');
  const mobilePanel=fs.readFileSync(files.mobilePanel,'utf8');
  for(const token of ['due_at','escalation_level','resolution_media_id','restroom_remediation_sla_hours','trg_sync_restroom_remediation_from_observation','event_opened','process_restroom_remediation_slas','kleenest-restroom-remediation-sla','*/15 * * * *','business_remediation_sla_escalated','p_proof_media_id','photo proof is required for critical remediation','photo_id','proof_available',"set search_path=''",'grant execute on function public.business_manage_restroom_remediation(uuid,uuid,text,uuid,text,uuid) to authenticated,service_role'])if(!authority.includes(token))failures.push(`Remediation SLA authority missing ${token}.`);
  for(const token of ['sla_state','minutes_to_due','proof_storage_path','priority_derived_4_8_12_24_48_hours','resolution_media_id'])if(!operations.includes(token))failures.push(`Remediation operations projection missing ${token}.`);
  for(const token of ['business_response_status','reported','being_addressed','addressed','business_response_at','business_proof_available','business_restroom_remediation_cases'])if(!consumer.includes(token))failures.push(`Consumer recovery projection missing ${token}.`);
  for(const token of ['proofMediaId','p_proof_media_id','resolveBusinessRestroomRemediation'])if(!service.includes(token))failures.push(`Remediation service proof contract missing ${token}.`);
  for(const token of ['uploadBusinessLocationPhoto','createBusinessMedia','CRITICAL OVERDUE','Due ${when(row.due_at)}','Resolution photo proof','Photo proof is required for critical remediation','Resolve + record evidence','SLA met','SLA missed'])if(!panel.includes(token))failures.push(`Remediation SLA/proof presentation missing ${token}.`);
  for(const token of ['business_response_status','business_response_at','business_proof_available'])if(!mobileService.includes(token))failures.push(`Mobile amenity contract missing ${token}.`);
  for(const token of ['BUSINESS ALERTED','BUSINESS ADDRESSING','BUSINESS REPORTED FIX','photo proof','Community evidence still remains visible'])if(!mobilePanel.includes(token))failures.push(`Mobile recovery presentation missing ${token}.`);
}
if(failures.length){console.error('Restroom remediation SLA/recovery convergence audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Restroom remediation SLA/recovery convergence audit passed.');
