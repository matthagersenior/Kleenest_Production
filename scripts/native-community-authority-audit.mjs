import fs from 'node:fs';
const required=['apps/consumer-mobile/services/community.ts','apps/consumer-mobile/services/contributors.ts','apps/consumer-mobile/app/location/[id].tsx','apps/consumer-mobile/app/social.tsx','apps/consumer-mobile/app/contributor/[id].tsx','packages/mobile-core/src/index.ts','supabase/migrations/20260830224000_canonical_community_contributor_profiles.sql'];
const failures=[];
for(const file of required) if(!fs.existsSync(file)) failures.push(`missing native community authority file: ${file}`);
if(!failures.length){
  const helpful=fs.readFileSync('apps/consumer-mobile/services/community.ts','utf8');
  const contributors=fs.readFileSync('apps/consumer-mobile/services/contributors.ts','utf8');
  const location=fs.readFileSync('apps/consumer-mobile/app/location/[id].tsx','utf8');
  const community=fs.readFileSync('apps/consumer-mobile/app/social.tsx','utf8');
  const profile=fs.readFileSync('apps/consumer-mobile/app/contributor/[id].tsx','utf8');
  const core=fs.readFileSync('packages/mobile-core/src/index.ts','utf8');
  const migration=fs.readFileSync('supabase/migrations/20260830224000_canonical_community_contributor_profiles.sql','utf8');
  if(!helpful.includes("rpc('toggle_review_like'")) failures.push('Helpful-review mutation must use toggle_review_like RPC.');
  if(helpful.includes("from('review_likes')")) failures.push('Native client must not mutate review_likes directly.');
  if(!location.includes('toggleHelpfulReview')||!location.includes('Helpful')) failures.push('Location community reviews must expose the canonical Helpful action.');
  if(!location.includes('Useful reviews can earn contributor badges')) failures.push('Helpful action must explain contributor-quality progression.');
  if(!location.includes("pathname:'/contributor/[id]'")) failures.push('Location reviews must link contributors to their public profile.');
  if(!core.includes('contributor:review.user_id?')||!core.includes('helpful_count')) failures.push('Location review service must hydrate contributor identity and helpful totals without PostgREST relationship embeds.');
  if(!contributors.includes("rpc('community_search_contributors'")||!contributors.includes("rpc('community_contributor_profile'")) failures.push('Contributor discovery and profiles must use privacy-safe community RPCs.');
  if(community.includes("from('profiles')")||community.includes('searchMobilePeople')) failures.push('Community UI must not rely on direct profile-table discovery.');
  if(!community.includes('searchContributors')||!community.includes("pathname:'/contributor/[id]'")) failures.push('Community must use safe discovery and link to contributor profiles.');
  if(!profile.includes('getContributorProfile')||!profile.includes('helpful votes')||!profile.includes('Badges')||!profile.includes('Published reviews')) failures.push('Contributor profile must surface public progression, helpfulness, badges and reviews.');
  if(!migration.includes('security definer')||!migration.includes('revoke all on function public.community_search_contributors')||!migration.includes('grant execute on function public.community_contributor_profile(uuid) to authenticated')) failures.push('Community contributor RPCs must be locked to authenticated callers.');
  if(/email|subscription_tier|is_admin|is_platform_owner/i.test(migration)) failures.push('Community contributor RPCs must not expose private account fields.');
}
if(failures.length){console.error('Native community authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native community authority audit passed.');
