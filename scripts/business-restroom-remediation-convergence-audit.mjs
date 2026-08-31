import fs from 'node:fs';

const files={
  workflow:'supabase/migrations/20260831180000_business_restroom_remediation_operations.sql',
  notifications:'supabase/migrations/20260831180500_business_restroom_remediation_notifications.sql',
  service:'src/services/remediation.js',
  panel:'src/runtime/BusinessRemediationPanel.jsx',
  trustPanel:'src/runtime/BusinessReverificationPanel.jsx',
  notificationPage:'src/runtime/NotificationsPage.jsx',
};
const failures=[];
for(const [name,file] of Object.entries(files))if(!fs.existsSync(file))failures.push(`missing ${name}: ${file}`);
if(!failures.length){
  const workflow=fs.readFileSync(files.workflow,'utf8').toLowerCase();
  const notifications=fs.readFileSync(files.notifications,'utf8').toLowerCase();
  const service=fs.readFileSync(files.service,'utf8');
  const panel=fs.readFileSync(files.panel,'utf8');
  const trustPanel=fs.readFileSync(files.trustPanel,'utf8');
  const notificationPage=fs.readFileSync(files.notificationPage,'utf8');
  for(const token of ['business_restroom_remediation_cases','business_restroom_remediation_operations','business_manage_restroom_remediation','source_observation_id','resolution_observation_id','business_remediation','resolved_by_business','auto_resolved','business_remediation_assignment','business_remediation_resolved',"set search_path=''",'revoke all on public.business_restroom_remediation_cases from public,anon,authenticated'])if(!workflow.includes(token))failures.push(`Remediation workflow missing ${token}.`);
  for(const token of ['notify_business_restroom_remediation_opened','trg_business_restroom_remediation_opened','business_remediation_opened',"set search_path=''",'owner','admin','manager'])if(!notifications.includes(token))failures.push(`Remediation notifications missing ${token}.`);
  for(const token of ["rpc('business_restroom_remediation_operations'","rpc('business_manage_restroom_remediation'",'claimBusinessRestroomRemediation','assignBusinessRestroomRemediation','startBusinessRestroomRemediation','resolveBusinessRestroomRemediation','dismissBusinessRestroomRemediation','reopenBusinessRestroomRemediation'])if(!service.includes(token))failures.push(`Remediation service missing ${token}.`);
  for(const token of ['RESTROOM REMEDIATION','Turn community evidence into operational fixes','Assign team member','Claim','Start work','Resolve + record evidence','Canonical remediation evidence linked','business-remediation observation'])if(!panel.includes(token))failures.push(`Remediation presentation missing ${token}.`);
  if(!trustPanel.includes("import BusinessRemediationPanel")||!trustPanel.includes('<BusinessRemediationPanel businessId={businessId} onChanged={onChanged}/>'))failures.push('Trust operations must render remediation operations in the same control plane.');
  for(const token of ['item.type','item.title','item.body'])if(!notificationPage.includes(token))failures.push(`Notification inbox must render generic remediation notification field ${token}.`);
}
if(failures.length){console.error('Business restroom remediation convergence audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Business restroom remediation convergence audit passed.');
