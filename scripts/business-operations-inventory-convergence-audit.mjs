import fs from 'node:fs';

const files={
  migration:'supabase/migrations/20260831173800_business_operations_inventory_convergence.sql',
  service:'src/services/businessOperations.js',
  workspace:'src/runtime/BusinessWorkspacePage.jsx',
  operations:'src/runtime/BusinessOperationsPanel.jsx',
  advanced:'src/runtime/BusinessAdvancedOperationsPanel.jsx',
};
const failures=[];
for(const [name,file] of Object.entries(files))if(!fs.existsSync(file))failures.push(`missing ${name}: ${file}`);
if(!failures.length){
  const migration=fs.readFileSync(files.migration,'utf8').toLowerCase();
  const service=fs.readFileSync(files.service,'utf8');
  const workspace=fs.readFileSync(files.workspace,'utf8');
  const operations=fs.readFileSync(files.operations,'utf8');
  const advanced=fs.readFileSync(files.advanced,'utf8');
  for(const token of ['business_operations_inventory','security definer',"set search_path = ''",'business_can_manage','advanced_allowed','locations','promotions','campaigns','events','qr_codes','reviews','contests','media','revoke all on function public.business_operations_inventory(uuid) from public,anon','grant execute on function public.business_operations_inventory(uuid) to authenticated,service_role'])if(!migration.includes(token))failures.push(`Operations inventory migration missing ${token}.`);
  if(!service.includes("rpc('business_operations_inventory'"))failures.push('Business operations service must use canonical inventory RPC.');
  for(const token of ['getBusinessOperationsInventory','operationalData','inventory.campaigns','inventory.reviews','inventory.qr_codes','inventory.promotions','inventory.events','inventory.media','OPERATIONAL INVENTORY'])if(!workspace.includes(token))failures.push(`Business workspace inventory wiring missing ${token}.`);
  for(const token of ['return true','return false','if(await run','business_reply','max_redemptions','CAMPAIGN CONTROL','QR LIFECYCLE','LOCATION CONTROL'])if(!operations.includes(token))failures.push(`Business operations lifecycle missing ${token}.`);
  for(const token of ['createCustomBusinessQr','updateCustomBusinessQr','setCustomBusinessQrActive','deleteCustomBusinessQr','createBusinessContest','updateBusinessContest','setBusinessContestStatus','deleteBusinessContest','createBusinessMedia','updateBusinessMedia','deleteBusinessMedia','updateBusinessLocation','updateBusinessPromotion','updateBusinessCampaign','updateBusinessEvent'])if(!advanced.includes(token))failures.push(`Advanced business lifecycle missing ${token}.`);
}
if(failures.length){console.error('Business operations inventory convergence audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Business operations inventory convergence audit passed.');
