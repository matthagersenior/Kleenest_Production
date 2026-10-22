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
assertContains('supabase/migrations/20261022004233_owner_guest_returning_visitor_groups.sql',[
  'private.owner_guest_visitor_groups','public.owner_guest_visitor_groups',
  'public.is_platform_owner_session()',"LIMIT 20",'visitor_label',
  'REVOKE ALL ON FUNCTION public.owner_guest_visitor_groups(integer) FROM PUBLIC, anon;',
  'GRANT EXECUTE ON FUNCTION private.owner_guest_visitor_groups(integer) TO authenticated;',
]);
const guestGroupsMigration=read('supabase/migrations/20261022004233_owner_guest_returning_visitor_groups.sql');
if (guestGroupsMigration.includes('GRANT EXECUTE ON FUNCTION public.owner_guest_visitor_groups(integer) TO anon')) {
  throw new Error('Guest repeat visitor histories must be owner-only.');
}
assertContains('apps/platform-mobile/app/guest-insights.tsx',[
  'owner_guest_visitor_groups', 'Guest histories',
  "(visitor.visit_count??0)>1",'visitor.friction_events>0',
  'visitor.registration_linked', 'visitor.sessions.map',
]);
assertContains('supabase/migrations/20261022030130_guest_meaningful_return_analytics.sql',[
  "interval '30 minutes'",'visit_clusters','visit_count',
  'private.owner_guest_visit_summary','public.owner_guest_visit_summary',
  'public.is_platform_owner_session()',
  'REVOKE ALL ON FUNCTION public.owner_guest_visit_summary(integer) FROM PUBLIC, anon;',
]);
assertContains('apps/platform-mobile/app/guest-insights.tsx',[
  'owner_guest_visit_summary', 'Separated returning IDs',
  'visitor.visit_count??0','visit_windows?.map','Rapid relaunches',
  "visitorFilter==='relaunch'",
]);
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
assertContains('apps/platform-mobile/app/_layout.tsx',[
  'Tabs.Screen name="growth" options={{href:null',
  'TabIcon symbol="🏠"','TabIcon symbol="📧"',
]);
assertContains('apps/platform-mobile/app/guest-insights.tsx',[
  'style={{flex:1,backgroundColor:theme.canvas}}',"minHeight:'100%'",
]);
assertContains('apps/platform-mobile/components/UserTallyPanel.tsx',['href="/guest-insights"']);
assertContains('packages/mobile-core/src/appSearch.ts',["id:'guest-insights'","route:'/guest-insights'"]);
const registry=JSON.parse(read('config/feature-lifecycle.json'));
const guest=registry.features.find(x=>x.id==='platform.guest-insights');
if(!guest||guest.status!=='wired')throw new Error('Guest Insights lifecycle must remain wired until release verified.');
assertContains('supabase/migrations/20261022032717_owner_guest_discovery_funnel.sql',[
  'private.owner_guest_discovery_funnel','public.owner_guest_discovery_funnel',
  'public.is_platform_owner_session()','guest_app_sessions','discovery_result_sessions',
  'intentional_discovery_sessions','place_selected_sessions','returning_discovery_visitor_ids',
  'REVOKE ALL ON FUNCTION public.owner_guest_discovery_funnel(integer) FROM PUBLIC,anon;',
]);
assertContains('apps/platform-mobile/app/guest-insights.tsx',[
  "owner_guest_discovery_funnel",'Guest → Discovery funnel',
  'intentional_discovery_sessions','discovery_rate_percent',
  'guest_entry_discovery_visitor_ids','non_discovery_sessions',
]);
console.log('Guest Insights data, privacy, searchable owner UI, and lifecycle contracts passed.');
