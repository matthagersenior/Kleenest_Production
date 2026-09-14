import fs from 'node:fs';

const failures=[];
const required=[
  'supabase/migrations/20260914151500_consumer_prior_knowledge_contributions.sql',
  'apps/consumer-mobile/services/priorKnowledge.ts',
  'apps/consumer-mobile/app/knowledge.tsx',
  'apps/consumer-mobile/app/_layout.tsx',
  'apps/consumer-mobile/app/location/[id].tsx',
  'apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',
  'src/services/community.js',
  'src/runtime/LocationPage.jsx',
];

for(const file of required){
  if(!fs.existsSync(file)) failures.push(`missing prior-knowledge feature file: ${file}`);
}

if(!failures.length){
  const read=file=>fs.readFileSync(file,'utf8');
  const migration=read(required[0]);
  const service=read(required[1]);
  const screen=read(required[2]);
  const layout=read(required[3]);
  const location=read(required[4]);
  const explore=read(required[5]);
  const webService=read(required[6]);
  const webLocation=read(required[7]);

  for(const token of [
    'consumer_record_discovery_evidence',
    "'evidence_class','prior_knowledge'",
    "'presence_verified',false",
    "'visit_verified',false",
    "'freshness_eligible',false",
    "'prior_knowledge',8",
    "0,12,true",
    "'community_contributor'",
    "v_action:=case when v_prior then 'prior_knowledge'",
    "'consumer_prior_knowledge'",
  ]) if(!migration.includes(token)) failures.push(`prior-knowledge migration missing token: ${token}`);

  for(const forbidden of ['insert into public.check_ins','kleenest_map_check_in','create or replace function public.consumer_submit_prior_knowledge']){
    if(migration.toLowerCase().includes(forbidden)) failures.push(`prior knowledge must not create a parallel privileged or verified-visit path: ${forbidden}`);
  }
  if(!migration.includes("if p_input ? 'amenities' then raise exception 'PRIOR_KNOWLEDGE_CANNOT_CREATE_AMENITY_EVIDENCE'; end if;")) failures.push('prior knowledge must reject canonical amenity payloads.');
  if(!migration.includes("case when v_prior then v_claimed_observed_at else now() end")) failures.push('prior knowledge must preserve declared historical recency instead of using submission time as observation freshness.');
  if(!migration.includes("if not v_prior then\n    select id into v_contrib")) failures.push('prior knowledge must not mutate the canonical discovery-contribution state used by stronger evidence.');

  if(!service.includes("rpc('consumer_record_discovery_evidence'")) failures.push('native prior-knowledge service must call the dedicated RPC.');
  if(!screen.includes('I Know This Place')) failures.push('native prior-knowledge screen must explain the I Know This Place path.');
  if(screen.includes('expo-location')||screen.includes('mobileCheckIn')) failures.push('native prior-knowledge screen must not request location or invoke check-in.');
  if(!layout.includes('<Tabs.Screen name="knowledge" options={{ href:null')) failures.push('prior-knowledge route must stay hidden from the primary consumer tab bar.');
  if(!screen.includes('not a check-in')||!screen.includes('verified current visit')) failures.push('native prior-knowledge screen must clearly distinguish historical knowledge from verified presence.');
  if(!screen.includes('xp_awarded')) failures.push('native prior-knowledge success state must surface the canonical XP award field.');
  if(!location.includes('I know this place')||!location.includes("pathname:'/knowledge'")) failures.push('native location detail must expose I know this place.');
  if(!explore.includes('onKnow')||!explore.includes('I know this place')||!explore.includes("pathname: '/knowledge'")) failures.push('native Explore cards and selected map location must expose I know this place.');
  if(!webService.includes('submitPriorKnowledge')||!webService.includes("rpc('consumer_record_discovery_evidence'")) failures.push('web community service must expose prior-knowledge submission.');
  if(!webLocation.includes('I know this place')||!webLocation.includes('PRIOR KNOWLEDGE')) failures.push('web location page must expose a separate prior-knowledge form.');
  if(!webLocation.includes('xp_awarded')) failures.push('web prior-knowledge success state must surface the canonical XP award field.');
}

if(failures.length){
  console.error('Consumer prior-knowledge contribution audit failed:');
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Consumer prior-knowledge contribution audit passed.');
