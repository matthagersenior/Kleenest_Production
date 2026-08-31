import fs from 'node:fs';

const migrationPath='supabase/migrations/20260831074500_mobile_contributor_relationship_status_authority.sql';
const servicePath='apps/consumer-mobile/services/contributors.ts';
const screenPath='apps/consumer-mobile/app/contributor/[id].tsx';
const socialPath='apps/consumer-mobile/app/social.tsx';
const failures=[];
for(const file of[migrationPath,servicePath,screenPath,socialPath])if(!fs.existsSync(file))failures.push(`missing contributor relationship file: ${file}`);
if(!failures.length){
 const migration=fs.readFileSync(migrationPath,'utf8'),service=fs.readFileSync(servicePath,'utf8'),screen=fs.readFileSync(screenPath,'utf8'),social=fs.readFileSync(socialPath,'utf8');
 if(!migration.includes('community_relationship_status')||!migration.includes("set search_path = ''")||!migration.includes('f.follower_id=v_user and f.following_id=p_user_id')||!migration.includes('f.follower_id=p_user_id and f.following_id=v_user'))failures.push('Relationship status must be self-scoped over both follow directions.');
 if(!migration.includes('revoke all on function public.community_relationship_status(uuid) from public,anon')||!migration.includes('grant execute on function public.community_relationship_status(uuid) to authenticated,service_role'))failures.push('Relationship status must be authenticated-only.');
 if(!service.includes("rpc('community_relationship_status'")||!service.includes('relationship:relationship||null'))failures.push('Contributor profile service must load canonical relationship state alongside the profile.');
 for(const label of ['Mutual','Following','Follow back','Follow'])if(!screen.includes(`'${label}'`))failures.push(`Contributor profile missing relationship label: ${label}`);
 if(!screen.includes('await toggleMobileFollow(userId);await load()'))failures.push('Follow mutation must reload canonical relationship state after completion.');
 if(!screen.includes('Follows you')||!screen.includes('You follow each other'))failures.push('Contributor UI must expose incoming and mutual relationship context.');
 if(screen.includes('Follow / Unfollow'))failures.push('Generic ambiguous follow label must not return on contributor profile.');
 if(!social.includes('const followerIds=useMemo')||!social.includes('relationshipLabel(id,followingIds,followerIds)'))failures.push('Community search must derive relationship labels from already-loaded following/follower sets without N+1 calls.');
 for(const label of ["return'Mutual'","return'Following'","return'Follow back'","return'Follow'"])if(!social.includes(label))failures.push(`Community search missing explicit relationship state: ${label}`);
 if(social.includes('Follow / Unfollow'))failures.push('Generic ambiguous follow label must not remain in Community search.');
}
if(failures.length){console.error('Native contributor relationship audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native contributor relationship audit passed.');
