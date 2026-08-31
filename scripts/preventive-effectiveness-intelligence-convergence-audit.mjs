import fs from 'node:fs';
function read(path){return fs.readFileSync(path,'utf8')}
function requireToken(text,token,label){if(!text.includes(token))throw new Error(`${label} missing ${token}.`)}
const migration=read('supabase/migrations/20260831203051_preventive_maintenance_effectiveness_intelligence.sql');
const service=read('src/services/remediation.js');
const business=read('src/runtime/BusinessPreventiveMaintenancePanel.jsx');
const workspaces=read('src/services/workspaces.js');
const fleet=read('src/runtime/FleetWorkspacePage.jsx');
const mobileService=read('apps/consumer-mobile/services/recoveryHistory.ts');
const mobileCard=read('apps/consumer-mobile/components/PreventiveVerificationCard.tsx');
for(const token of ['business_restroom_preventive_effectiveness','fleet_restroom_prevention_effectiveness','recurrence_7d','recurrence_30d','durable_30d','verification_rate_pct','effective_rate_pct','recurrence_rate_30d_pct','average_intervention_score','recommended_next_check_at','recurrence_detected','holding_so_far','maintenance_effectiveness_state'])requireToken(migration,token,'Effectiveness migration');
for(const token of ["status='absent'","o.observed_at>w.verified_at","o.id is distinct from w.verification_observation_id","Business membership required","Fleet access is not enabled for this business"])requireToken(migration,token,'Canonical effectiveness authority');
requireToken(migration,'revoke all on function public.business_restroom_preventive_effectiveness(uuid,integer) from public,anon','Business effectiveness ACL');
requireToken(migration,'revoke all on function public.fleet_restroom_prevention_effectiveness(uuid,integer) from public,anon','Fleet effectiveness ACL');
for(const token of ['getBusinessRestroomPreventiveEffectiveness','business_restroom_preventive_effectiveness'])requireToken(service,token,'Business effectiveness service');
for(const token of ['EFFECTIVENESS INTELLIGENCE','Intervention score','Independent verification','30d recurrence','Durable 30d','recurrence_detected','recommended_next_check_at'])requireToken(business,token,'Business effectiveness presentation');
for(const token of ['fleet_restroom_prevention_effectiveness','preventionEffectiveness'])requireToken(workspaces,token,'Fleet effectiveness service');
for(const token of ['PREVENTION EFFECTIVENESS','Measure whether preventive work actually holds','30d recurrence','7d recurrence','recurrence_detected','recommended_next_check_at'])requireToken(fleet,token,'Fleet effectiveness presentation');
for(const token of ['maintenance_effectiveness_state','recurrence_after_latest_effective_at','durable_30d','holding_so_far'])requireToken(mobileService,token,'Mobile effectiveness contract');
for(const token of ['RECURRENCE DETECTED','PREVENTION HOLDING 30+ DAYS','PREVENTION HOLDING','AWAITING INDEPENDENT VERIFICATION'])requireToken(mobileCard,token,'Mobile effectiveness presentation');
console.log('Preventive effectiveness intelligence convergence audit passed.');
