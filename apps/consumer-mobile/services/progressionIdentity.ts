import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type PublicProgressionIdentity={
  level:number;
  level_title:string;
  lifetime_xp:number;
  trust_score:number;
  trust_rank:string;
  evidence_level:string;
  badge_count:number;
  showcase_slots:number;
  public_showcase_unlocked:boolean;
};

export async function listProgressionIdentities(userIds:string[]){
  const ids=[...new Set((userIds||[]).map(String).filter(Boolean))].slice(0,100);
  if(!ids.length)return{} as Record<string,PublicProgressionIdentity>;
  const{data,error}=await getKleenestSupabaseClient().rpc('community_progression_identities',{p_user_ids:ids});
  if(error)throw error;
  const rows=Array.isArray(data)?data:[];
  return Object.fromEntries(rows.map((row:any)=>[String(row.user_id),row.identity||{}])) as Record<string,PublicProgressionIdentity>;
}
