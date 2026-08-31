import fs from 'node:fs';
function read(path){return fs.readFileSync(path,'utf8')}
function need(text,token,label){if(!text.includes(token))throw new Error(`${label} missing ${token}.`)}

const lifecycle=read('supabase/migrations/20260831215622_preventive_work_lifecycle_notifications_and_sla.sql');
const materializer=read('supabase/migrations/20260831215904_automatic_preventive_work_materialization.sql');
const fleetSla=read('supabase/migrations/20260831220432_fleet_preventive_sla_priority_convergence.sql');
const performance=read('supabase/migrations/20260831221110_preventive_execution_performance.sql');
const dispatch=read('supabase/migrations/20260831221433_fleet_preventive_dispatch_convergence.sql');
const handoff=read('supabase/migrations/20260831222335_preventive_dispatch_handoff_visibility.sql');
const service=read('src/services/remediation.js');
const workspaces=read('src/services/workspaces.js');
const businessControl=read('src/runtime/BusinessReverificationPanel.jsx');
const business=read('src/runtime/BusinessPreventiveMaintenancePanel.jsx');
const performancePanel=read('src/runtime/BusinessPreventiveExecutionPerformancePanel.jsx');
const handoffPanel=read('src/runtime/BusinessPreventiveDispatchHandoffPanel.jsx');
const dispatchPanel=read('src/runtime/FleetPreventiveDispatchPanel.jsx');
const mobile=read('apps/consumer-mobile/components/PreventiveVerificationCard.tsx');
const notificationRouting=read('apps/consumer-mobile/services/notificationRouting.ts');
const fleet=read('src/runtime/FleetWorkspacePage.jsx');

for(const token of ['due_soon_notified_at','escalated_at','escalation_level','notify_preventive_work_order_lifecycle','process_preventive_work_order_slas','kleenest-preventive-work-sla','*/15 * * * *','preventive_work_created','preventive_work_assigned','preventive_work_started','preventive_work_completed','preventive_work_due_soon','preventive_work_overdue','preventive_work_critical_overdue',"work_order='||new.id::text",'to service_role'])need(lifecycle,token,'Preventive lifecycle migration');
for(const token of ['materialize_restroom_preventive_work_orders','automatic_preventive_materializer','server_authoritative','on conflict do nothing','kleenest-preventive-work-materializer','0 * * * *','to service_role'])need(materializer,token,'Automatic preventive materializer');
for(const token of ['due_soon','escalated','critical_overdue',"coalesce(escalation_level,0)>=2","verification_status='failed'","due_at>now() and due_at<=now()+interval '4 hours'",'to authenticated,service_role'])need(fleetSla,token,'Fleet preventive SLA authority');
for(const token of ['business_restroom_preventive_execution_performance','completion_rate_pct','on_time_completion_pct','escalation_rate_pct','proof_rate_pct','median_completion_hours','average_start_hours','critical_escalated','to authenticated,service_role'])need(performance,token,'Preventive execution performance authority');
for(const token of ['fleet_preventive_dispatch_opportunities','fleet_attach_preventive_work_to_route','fleet_route_stops','preventive_work_order_id',"source','preventive_work_order'",'already_attached','dispatch_locked','status<>\'planned\'','to authenticated,service_role'])need(dispatch,token,'Fleet preventive dispatch authority');
for(const token of ['fleet_route_stop_id','fleet_route_id','fleet_route_name','fleet_route_status','fleet_stop_status','fleet_stop_order','fleet_scheduled_for','fleet_dispatch_locked','preventive_work_order_id','to authenticated,service_role'])need(handoff,token,'Preventive dispatch handoff authority');
need(service,'getBusinessRestroomPreventiveExecutionPerformance','Preventive execution performance service');
for(const token of ['getFleetPreventiveDispatchOpportunities','attachPreventiveWorkToFleetRoute','fleet_preventive_dispatch_opportunities','fleet_attach_preventive_work_to_route','preventiveDispatch'])need(workspaces,token,'Fleet preventive dispatch service');
for(const token of ["params.get('work_order')",'focusPreventiveWorkOrderId','focusWorkOrderId={focusPreventiveWorkOrderId}','BusinessPreventiveExecutionPerformancePanel','<BusinessPreventiveExecutionPerformancePanel businessId={businessId}/>','BusinessPreventiveDispatchHandoffPanel','<BusinessPreventiveDispatchHandoffPanel businessId={businessId}/>'])need(businessControl,token,'Preventive alert/performance/handoff control');
for(const token of ['focusWorkOrderId','ALERT CONTEXT','Due soon','Critical overdue','CRITICAL OVERDUE','DUE SOON','escalation_level','escalated_at','uploadBusinessLocationPhoto','createBusinessMedia','Preventive maintenance proof','proofMediaId','Maintenance photo proof (optional)','Photo proof linked'])need(business,token,'Business preventive lifecycle presentation');
for(const token of ['PREVENTIVE EXECUTION PERFORMANCE','Completion rate','On-time completion','Escalation rate','Proof-backed','Median completion','Average start','Critical escalations','does not alter restroom trust'])need(performancePanel,token,'Business preventive execution performance presentation');
for(const token of ['FLEET HANDOFF','Routed preventive work','Active routed work','fleet_route_stop_id','fleet_route_name','dispatch linkage only','work order remains the maintenance authority'])need(handoffPanel,token,'Business preventive dispatch handoff presentation');
for(const token of ['PREVENTIVE DISPATCH','existing Fleet stop model','no parallel task or dispatch lifecycle','Choose planned route','Add to route','canonical Fleet route stop','assigned_route_stop_id'])need(dispatchPanel,token,'Fleet preventive dispatch presentation');
for(const token of ['BUSINESS MAINTENANCE PHOTO','proof_available','proof_url','not restroom truth','what you observe during your verified visit'])need(mobile,token,'Mobile preventive proof');
for(const token of ['isRestroomOperations','work_order_id',"type.includes('preventive_work')","type.includes('preventive_maintenance')",'Restroom'])need(notificationRouting,token,'Native preventive notification routing');
for(const token of ['FleetPreventiveDispatchPanel','preventiveDispatch','Proof-backed completed','PHOTO PROOF','business photo proof','Due soon','Escalated','Critical overdue','Verified effective','CRITICAL OVERDUE','DUE SOON','scheduleSummary.critical_overdue','preventionUrl(row.id)','never substitute for visitor evidence'])need(fleet,token,'Fleet preventive lifecycle presentation');

console.log('Preventive work lifecycle convergence audit passed.');
