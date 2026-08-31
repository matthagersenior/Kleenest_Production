import { getKleenestSupabaseClient } from './index';

const publicContributorColumns = 'id,display_name,username,avatar_url,bio,points,level,streak,total_check_ins,total_reviews';

export async function hydratePublicContributors(ids:string[]){
  const unique=[...new Set(ids.filter(Boolean).map(String))].slice(0,100);
  if(!unique.length)return [];
  const {data,error}=await getKleenestSupabaseClient().rpc('community_contributor_summaries',{p_user_ids:unique});
  if(error)throw error;
  return Array.isArray(data)?data:[];
}

export async function listMobileLocationReviews(locationId:string,limit=30){
  const client=getKleenestSupabaseClient();
  const {data,error}=await client.from('reviews').select('id,location_id,user_id,check_in_id,stars,cleanliness_pct,comment,status,business_reply,business_replied_at,helpful_count,created_at').eq('location_id',locationId).eq('status','published').order('created_at',{ascending:false}).limit(limit);
  if(error)throw error;
  const reviews=data||[];
  const profiles=await hydratePublicContributors(reviews.map((row:any)=>String(row.user_id||'')).filter(Boolean));
  const byId=new Map(profiles.map((profile:any)=>[String(profile.id),profile]));
  return reviews.map((review:any)=>({...review,contributor:review.user_id?byId.get(String(review.user_id))||null:null}));
}

export async function searchMobilePeople(term:string){
  const query=String(term||'').trim();
  if(query.length<2)return [];
  const {data,error}=await getKleenestSupabaseClient().rpc('community_search_contributors',{p_query:query,p_limit:25});
  if(error)throw error;
  return Array.isArray(data)?data:[];
}

export { publicContributorColumns };
