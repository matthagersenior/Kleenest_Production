import fs from 'node:fs';
function read(path){return fs.readFileSync(path,'utf8')}
function need(text,token,label){if(!text.includes(token))throw new Error(`${label} missing ${token}.`)}

const migration=read('supabase/migrations/20260831215622_preventive_work_lifecycle_notifications_and_sla.sql');
const business=read('src/runtime/BusinessPreventiveMaintenancePanel.jsx');
const mobile=read('apps/consumer-mobile/components/PreventiveVerificationCard.tsx');
const fleet=read('src/runtime/FleetWorkspacePage.jsx');

for(const token of ['due_soon_notified_at','escalated_at','escalation_level','notify_preventive_work_order_lifecycle','process_preventive_work_order_slas','kleenest-preventive-work-sla','*/15 * * * *','preventive_work_created','preventive_work_assigned','preventive_work_started','preventive_work_completed','preventive_work_due_soon','preventive_work_overdue','preventive_work_critical_overdue',"set search_path=''",'to service_role'])need(migration,token,'Preventive lifecycle migration');
for(const token of ['uploadBusinessLocationPhoto','createBusinessMedia','Preventive maintenance proof','proofMediaId','Maintenance photo proof (optional)','Photo proof linked'])need(business,token,'Business preventive proof');
for(const token of ['BUSINESS MAINTENANCE PHOTO','proof_available','proof_url','not restroom truth','what you observe during your verified visit'])need(mobile,token,'Mobile preventive proof');
for(const token of ['Proof-backed completed','PHOTO PROOF','business photo proof','never substitute for visitor evidence'])need(fleet,token,'Fleet preventive proof');

console.log('Preventive work lifecycle convergence audit passed.');
