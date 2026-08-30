import { getSupabase } from '../lib/supabase.js';

const profileColumns='id,display_name,username,avatar_url,bio,points,level';

async function hydrateProfiles(ids){
  const unique=[...new Set((ids||[]).filter(Boolean))];
  if(!unique.length) return [];
  const {data,error}=await getSupabase().from('profiles').select(profileColumns).in('id',unique);
  if(error) throw error;
  const byId=new Map((data||[]).map((profile)=>[profile.id,profile]));
  return unique.map((id)=>byId.get(id)).filter(Boolean);
}

export async function searchPeople(term){
  const query=String(term||'').trim();
  if(query.length<2) return [];
  const pattern=`%${query.replace(/[%_]/g,'\\$&')}%`;
  const client=getSupabase();
  const [byName,byUsername]=await Promise.all([
    client.from('profiles').select(profileColumns).ilike('display_name',pattern).limit(20),
    client.from('profiles').select(profileColumns).ilike('username',pattern).limit(20),
  ]);
  if(byName.error) throw byName.error;
  if(byUsername.error) throw byUsername.error;
  const merged=new Map();
  for(const profile of [...(byName.data||[]),...(byUsername.data||[])]) merged.set(profile.id,profile);
  return [...merged.values()].slice(0,25);
}

export async function listFollowing(){
  const {data,error}=await getSupabase().rpc('list_following_users',{p_limit:100});
  if(error) throw error;
  return hydrateProfiles((data||[]).map((row)=>row.following_id));
}

export async function listFollowers(){
  const {data,error}=await getSupabase().rpc('list_follower_users',{p_limit:100});
  if(error) throw error;
  return hydrateProfiles((data||[]).map((row)=>row.follower_id));
}

export async function toggleFollow(userId){
  if(!userId) throw new Error('User id is required.');
  const {data,error}=await getSupabase().rpc('toggle_follow_user',{p_target_user_id:userId});
  if(error) throw error;
  return data;
}
