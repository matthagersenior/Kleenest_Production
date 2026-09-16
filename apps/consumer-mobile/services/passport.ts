import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type PassportItemVisibility='visit'|'stamp';

async function requireUser(){
  const client=getKleenestSupabaseClient();
  const{data,error}=await client.auth.getUser();
  if(error)throw error;
  if(!data.user)throw new Error('Sign in to open your Kleenest Passport.');
  return data.user;
}

export async function getPassportSnapshot(){
  await requireUser();
  const{data,error}=await getKleenestSupabaseClient().rpc('consumer_passport_snapshot');
  if(error)throw error;
  return data||{summary:{places:0,visits:0,cities:0,states:0,achievement_stamps:0},recent_visits:[],achievement_stamps:[],cities:[],states:[],place_types:[],next_collections:[]};
}

export async function setPassportVisibility(itemType:PassportItemVisibility,itemId:string,visible:boolean){
  await requireUser();
  const{data,error}=await getKleenestSupabaseClient().rpc('consumer_set_passport_visibility',{
    p_item_type:itemType,p_item_id:itemId,p_visible:visible
  });
  if(error)throw error;
  return data||{};
}

export async function getPublicPassportSummary(userId:string){
  if(!userId)return{places:0,cities:0,states:0,stamps:[]};
  const{data,error}=await getKleenestSupabaseClient().rpc('public_passport_summary',{p_user_id:userId});
  if(error)throw error;
  return data||{places:0,cities:0,states:0,stamps:[]};
}
