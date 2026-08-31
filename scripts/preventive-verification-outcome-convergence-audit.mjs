import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function requireToken(text,token,label){if(!text.includes(token))throw new Error(`${label} missing ${token}.`)}

const migration=read('supabase/migrations/20260831195200_preventive_work_independent_verification_outcomes.sql');
const mobileService=read('apps/consumer-mobile/services/recoveryHistory.ts');
const mobileCard=read('apps/consumer-mobile/components/PreventiveVerificationCard.tsx');
const inventory=read('apps/consumer-mobile/components/LocationAmenityInventory.tsx');
const business=read('src/runtime/BusinessPreventiveMaintenancePanel.jsx');
const fleet=read('src/runtime/FleetWorkspacePage.jsx');

for(const token of ['verification_status','verification_outcome','verification_observation_id','verified_by','verified_at','followup_work_order_id','get_location_preventive_verification_opportunities','confirm_preventive_work_order','community_preventive_confirmation','preventive_confirmation','failed_preventive_verification','post_maintenance_issue_followup','preventive_maintenance_verified','preventive_maintenance_failed_verification','awaiting_independent_verification','independently_verified_history'])requireToken(migration,token,'Preventive verification migration');
for(const token of ["A verified check-in after the preventive maintenance is required","Business members cannot verify their own preventive maintenance","status='completed' and w.verification_status='pending'","confidence,verification_method,check_in_id","0.95,'community_preventive_confirmation'","on conflict do nothing"])requireToken(migration,token,'Preventive verification authority');
requireToken(migration,"revoke all on function public.confirm_preventive_work_order(uuid,text,text) from public,anon",'Preventive confirmation ACL');
requireToken(migration,"grant execute on function public.confirm_preventive_work_order(uuid,text,text) to authenticated,service_role",'Preventive confirmation ACL');

for(const token of ['PreventiveVerificationOpportunity','PreventiveVerificationResult','get_location_preventive_verification_opportunities','confirm_preventive_work_order','awaiting_verification','verified_effective','failed_verification'])requireToken(mobileService,token,'Mobile preventive verification service');
for(const token of ['VERIFY PREVENTIVE WORK','Working now','Issue still present','recent verified visitor','verified_visit_ready','eligible_to_verify'])requireToken(mobileCard,token,'Mobile preventive verification UI');
requireToken(inventory,'PreventiveVerificationCard','Location trust integration');

for(const token of ['Awaiting verification','Verified effective','Failed prevention','AWAITING COMMUNITY VERIFICATION','COMMUNITY VERIFIED EFFECTIVE','FOLLOW-UP REQUIRED','Independent visitor verification is still required'])requireToken(business,token,'Business preventive outcomes');
for(const token of ['Awaiting verification','Verified effective','Failed verification','FOLLOW-UP REQUIRED','AWAITING COMMUNITY VERIFICATION','fresh community evidence has shown the issue persists'])requireToken(fleet,token,'Fleet preventive outcomes');

console.log('Preventive verification outcome convergence audit passed.');
