import fs from 'node:fs';
function read(path){return fs.readFileSync(path,'utf8')}
function need(text,token,label){if(!text.includes(token))throw new Error(`${label} missing ${token}.`)}

const lifecycle=read('supabase/migrations/20260831215622_preventive_work_lifecycle_notifications_and_sla.sql');
const materializer=read('supabase/migrations/20260831215904_automatic_preventive_work_materialization.sql');
const fleetSla=read('supabase/migrations/20260831220432_fleet_preventive_sla_priority_convergence.sql');
const performance=read('supabase/migrations/20260831221110_preventive_execution_performance.sql');
const service=read('src/services/remediation.js');
const businessControl=read('src/runtime/BusinessReverificationPanel.jsx');
const business=read('src/runtime/BusinessPreventiveMaintenancePanel.jsx');
const performancePanel=read('src/runtime/BusinessPreventiveExecutionPerformancePanel.jsx');
const mobile=read('apps/consumer-mobile/components/PreventiveVerificationCard.tsx');
const notificationRouting=read('apps/consumer-mobile/services/notificationRouting.ts');
const fleet=read('src/runtime/FleetWorkspacePage.jsx');

for(const token of ['due_soon_notified_at','escalated_at','escalation_level','notify_preventive_work_order_lifecycle','process_preventive_work_order_slas','kleenest-preventive-work-sla','*/15 * * * *','preventive_work_created','preventive_work_assigned','preventive_work_started','preventive_work_completed','preventive_work_due_soon','preventive_work_overdue','preventive_work_critical_overdue',"work_order='||new.id::text",'to service_role'])need(lifecycle,token,'Preventive lifecycle migration');
for(const token of ['materialize_restroom_preventive_work_orders','automatic_preventive_materializer','server_authoritative','on conflict do nothing','kleenest-preventive-work-materializer','0 * * * *','to service_role'])need(materializer,token,'Automatic preventive materializer');
for(const token of ['due_soon','escalated','critical_overdue',"coalesce(escalation_level,0)>=2","verification_status='failed'","due_at>now() and due_at<=now()+interval '4 hours'",'to authenticated,service_role'])need(fleetSla,token,'Fleet preventive SLA authority');
for(const token of ['business_restroom_preventive_execution_performance','completion_rate_pct','on_time_completion_pct','escalation_rate_pct','proof_rate_pct','median_completion_hours','average_start_hours','critical_escalated','to authenticated,service_role'])need(performance,token,'Preventive execution performance authority');
need(service,'getBusinessRestroomPreventiveExecutionPerformance','Preventive execution performance service');
for(const token of ["params.get('work_order')",'focusPreventiveWorkOrderId','focusWorkOrderId={focusPreventiveWorkOrderId}','BusinessPreventiveExecutionPerformancePanel','<BusinessPreventiveExecutionPerformancePanel businessId={businessId}/>'])need(businessControl,token,'Preventive alert/performance control');
for(const token of ['focusWorkOrderId','ALERT CONTEXT','Due soon','Critical overdue','CRITICAL OVERDUE','DUE SOON','escalation_level','escalated_at','uploadBusinessLocationPhoto','createBusinessMedia','Preventive maintenance proof','proofMediaId','Maintenance photo proof (optional)','Photo proof linked'])need(business,token,'Business preventive lifecycle presentation');
for(const token of ['PREVENTIVE EXECUTION PERFORMANCE','Completion rate','On-time completion','Escalation rate','Proof-backed','Median completion','Average start','Critical escalations','does not alter restroom trust'])need(performancePanel,token,'Business preventive execution performance presentation');
for(const token of ['BUSINESS MAINTENANCE PHOTO','proof_available','proof_url','not restroom truth','what you observe during your verified visit'])need(mobile,token,'Mobile preventive proof');
for(const token of ['isRestroomOperations','work_order_id',"type.includes('preventive_work')","type.includes('preventive_maintenance')",'Restroom'])need(notificationRouting,token,'Native preventive notification routing');
for(const token of ['Proof-backed completed','PHOTO PROOF','business photo proof','Due soon','Escalated','Critical overdue','Verified effective','CRITICAL OVERDUE','DUE SOON','scheduleSummary.critical_overdue','preventionUrl(row.id)','never substitute for visitor evidence'])need(fleet,token,'Fleet preventive lifecycle presentation');

console.log('Preventive work lifecycle convergence audit passed.');
