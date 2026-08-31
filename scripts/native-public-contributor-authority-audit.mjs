import fs from 'node:fs';

const required=[
  'packages/mobile-core/package.json',
  'packages/mobile-core/src/publicEntry.ts',
  'packages/mobile-core/src/publicContributors.ts',
  'supabase/migrations/20260831060500_mobile_public_contributor_projection_authority.sql',
];
const failures=[];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing public contributor authority file: ${file}`);

if(!failures.length){
  const pkg=fs.readFileSync(required[0],'utf8');
  const entry=fs.readFileSync(required[1],'utf8');
  const service=fs.readFileSync(required[2],'utf8');
  const migration=fs.readFileSync(required[3],'utf8');

  if(!pkg.includes('"main": "src/publicEntry.ts"')||!pkg.includes('"types": "src/publicEntry.ts"')) failures.push('Mobile core package must route runtime and types through the canonical public entry.');
  if(!entry.includes("export * from './index'")||!entry.includes('listMobileLocationReviews')||!entry.includes('searchMobilePeople')) failures.push('Public entry must preserve the core API while overriding cross-user contributor reads.');
  if(!service.includes("rpc('community_contributor_summaries'")||!service.includes('hydratePublicContributors')) failures.push('Cross-user review identity hydration must use the canonical contributor projection RPC.');
  if(!service.includes("rpc('community_search_contributors'")||service.includes("from('profiles')")) failures.push('Legacy people search must use privacy-safe contributor discovery and never query profiles directly.');
  if(!service.includes("from('reviews')")||!service.includes('contributor:review.user_id?')) failures.push('Location review loading must preserve published review data and attach safe contributor identity.');

  for(const token of ['public.community_contributor_summaries','security definer',"set search_path = ''",'auth.uid() is null','cardinality(p_user_ids)','public.profiles','coalesce(p.is_demo_test, false) = false']) if(!migration.toLowerCase().includes(token.toLowerCase())) failures.push(`Contributor projection migration missing authority token: ${token}`);
  if(!migration.includes('revoke all on function public.community_contributor_summaries(uuid[]) from public, anon')||!migration.includes('grant execute on function public.community_contributor_summaries(uuid[]) to authenticated')) failures.push('Contributor projection RPC must remain authenticated-only.');
  for(const forbidden of ['subscription_tier','role,','is_admin','is_platform_owner','is_business_user']) if(migration.includes(forbidden)) failures.push(`Contributor projection must not expose private/authorization field: ${forbidden}`);
  for(const legacy of ['users can insert their own profile','users can read their own profile','users can update their own profile']) if(!migration.includes(`drop policy if exists "${legacy}"`)) failures.push(`Contributor migration must remove duplicate legacy profile policy: ${legacy}`);
}

if(failures.length){console.error('Native public contributor authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native public contributor authority audit passed.');
