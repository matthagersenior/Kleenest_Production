import { getKleenestSupabaseClient } from './index';

function titleFor(item:any){
  const payload=item?.payload||{};
  if(item?.kind==='checkin')return 'Checked in';
  if(item?.kind==='review')return `Left a ${Number(payload.stars||0)}★ review`;
  const type=String(payload.activity_type||'Community activity').replaceAll('_',' ');
  return type.charAt(0).toUpperCase()+type.slice(1);
}

function detailFor(item:any){
  const payload=item?.payload||{};
  if(item?.kind==='checkin')return [payload.verification_method,payload.distance_meters==null?null:`${Math.max(0,Math.round(Number(payload.distance_meters)))} m`,payload.points_awarded?`+${payload.points_awarded} pts`:null].filter(Boolean).join(' · ');
  if(item?.kind==='review')return payload.comment||(payload.cleanliness_pct!=null?`${payload.cleanliness_pct}% cleanliness`:'');
  return payload?.metadata?.summary||'';
}

export async function listMobileActivity(limit=40){
  const bounded=Math.min(Math.max(Number(limit)||40,1),100);
  const {data,error}=await getKleenestSupabaseClient().rpc('my_activity_feed',{p_limit:bounded});
  if(error)throw error;
  return (Array.isArray(data)?data:[]).map((item:any)=>({
    id:String(item.id),
    kind:item.kind,
    locationId:item.location_id||null,
    contributorId:item?.payload?.metadata?.target_user_id||null,
    createdAt:item.created_at,
    title:titleFor(item),
    detail:detailFor(item),
    verified:Boolean(item?.payload?.verified),
    location:item.location_id?{id:item.location_id,name:item.location_name||'Restroom'}:null,
  }));
}
