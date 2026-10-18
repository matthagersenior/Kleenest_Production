import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const assertContains=(file,fragments)=>{
  const source=read(file);
  for(const text of fragments){
    if(!source.includes(text))throw new Error(`Guest Insights contract failed: ${file} missing ${text}`);
  }
};
assertContains('supabase/migrations/20261017151431_guest_journey_insights_20261017.sql',[
  'private.guest_journey_events','public.record_guest_journey_event',
  'private.owner_guest_journey_snapshot','public.owner_guest_journey_session',
  'private.guest_journey_conversions',"interval '30 days'",
  'public.is_platform_owner_session()',
]);
assertContains('supabase/migrations/20261018023035_owner_guest_journey_private_rpc_execute_grants_20261017.sql',[
  'GRANT EXECUTE ON FUNCTION private.owner_guest_journey_snapshot(integer) TO authenticated;',
  'GRANT EXECUTE ON FUNCTION private.owner_guest_journey_session(text) TO authenticated;',
]);
const ownerRpcGrant=read('supabase/migrations/20261018023035_owner_guest_journey_private_rpc_execute_grants_20261017.sql');
if (ownerRpcGrant.toLowerCase().includes(' to anon;') || ownerRpcGrant.toLowerCase().includes(' to public;')) {
  throw new Error('Guest Insights private analytics RPC must never be granted to anonymous/public roles.');
}
assertContains('apps/consumer-mobile/services/acquisitionAttribution.ts',[
  'safeGuestJourneyContext(context)','getKleenestGuestSessionId()',
  "p_visitor_key:visitorKey",'linkGuestJourneyRegistration',
]);
assertContains('apps/consumer-mobile/services/consumerTelemetry.ts',[
  'captureGuestJourneyEvent(eventName,id||null,metadata)',
]);
assertContains('apps/platform-mobile/app/guest-insights.tsx',[
  'owner_guest_journey_snapshot','owner_guest_journey_session',
  'No detailed guest sessions recorded yet',
]);
assertContains('apps/platform-mobile/components/UserTallyPanel.tsx',['href="/guest-insights"']);
assertContains('packages/mobile-core/src/appSearch.ts',["id:'guest-insights'","route:'/guest-insights'"]);
const registry=JSON.parse(read('config/feature-lifecycle.json'));
const guest=registry.features.find(x=>x.id==='platform.guest-insights');
if(!guest||guest.status!=='wired')throw new Error('Guest Insights lifecycle must remain wired until release verified.');
console.log('Guest Insights data, privacy, searchable owner UI, and lifecycle contracts passed.');
