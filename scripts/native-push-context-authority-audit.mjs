import fs from 'node:fs';
const required=['supabase/migrations/20260831062500_native_push_atomic_delivery_claims.sql','supabase/functions/deliver-native-push-notification/index.ts','apps/consumer-mobile/services/notificationRouting.ts','apps/consumer-mobile/app/notifications.tsx'];
const failures=[];for(const file of required)if(!fs.existsSync(file))failures.push(`missing push context authority file: ${file}`);
if(!failures.length){
  const migration=fs.readFileSync(required[0],'utf8');
  const worker=fs.readFileSync(required[1],'utf8');
  const routing=fs.readFileSync(required[2],'utf8');
  const screen=fs.readFileSync(required[3],'utf8');
  for(const token of ['public.claim_native_push_deliveries','security definer',"set search_path = ''",'for update of t','on conflict(notification_id,token_id) do update','grant execute on function public.claim_native_push_deliveries(uuid,integer) to service_role'])if(!migration.includes(token))failures.push(`atomic push migration missing: ${token}`);
  if(!migration.includes('revoke all on function public.claim_native_push_deliveries(uuid,integer) from public,anon,authenticated'))failures.push('atomic delivery claim RPC must deny app and anonymous execution');
  if(!worker.includes("rpc('claim_native_push_deliveries'")||worker.includes("select('id,status,attempts')")||worker.includes("upsert({notification_id:notification.id"))failures.push('push worker must claim delivery attempts atomically through the service-only RPC');
  if(!worker.includes(".eq('id',claim.id)"))failures.push('push delivery state transitions must target the claimed delivery row');
  if(!routing.includes('export function notificationContext')||!routing.includes('export function notificationDestination'))failures.push('notification labels and destinations must share one routing authority');
  if(!routing.includes("return'Support'")||!routing.includes("return'Restroom'")||!routing.includes("return'Community'")||!routing.includes("return'Progress'"))failures.push('notification routing authority must preserve trust contexts');
  if(!screen.includes('notificationContext, notificationDestination')||/function notificationContext\(/.test(screen))failures.push('notification center must consume, not duplicate, canonical context routing');
}
if(failures.length){console.error('Native push context authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native push context authority audit passed.');
