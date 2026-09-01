import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
const one=(value:any)=>Array.isArray(value)?value[0]??null:value??null;

export type FamilyState={group:any|null;members:any[];invites:any[];premium:boolean;seatsUsed:number;seatsTotal:5;seatsAvailable:number;isOwner:boolean};

export async function getFamilyState():Promise<FamilyState>{
  const {data:{user}}=await client().auth.getUser();
  const [{data:ownedGroups,error:ownedError},{data:membership,error:memberLookupError},{data:premium,error:premiumError}]=await Promise.all([
    client().from('family_groups').select('*').limit(1),
    user?.id?client().from('family_members').select('group_id,relationship').eq('user_id',user.id).limit(1):Promise.resolve({data:[],error:null} as any),
    client().rpc('family_has_premium_access'),
  ]);
  if(ownedError)throw ownedError;if(memberLookupError)throw memberLookupError;if(premiumError)throw premiumError;
  const owned=Array.isArray(ownedGroups)?ownedGroups[0]??null:ownedGroups??null;
  const mine=Array.isArray(membership)?membership[0]??null:membership??null;
  const groupId=owned?.id||mine?.group_id||null;
  if(!groupId)return {group:null,members:[],invites:[],premium:Boolean(one(premium)),seatsUsed:0,seatsTotal:5,seatsAvailable:5,isOwner:false};
  const {data:group,error:groupError}=await client().from('family_groups').select('*').eq('id',groupId).maybeSingle();
  if(groupError)throw groupError;
  const isOwner=Boolean(user?.id&&group?.owner_id===user.id);
  const [{data:members,error:memberError},{data:invites,error:inviteError}]=await Promise.all([
    client().from('family_members').select('*').eq('group_id',groupId).order('created_at',{ascending:true}),
    isOwner?client().from('family_invites').select('*').eq('group_id',groupId).order('created_at',{ascending:false}):Promise.resolve({data:[],error:null} as any),
  ]);
  if(memberError)throw memberError;if(inviteError)throw inviteError;
  const seatsUsed=Math.min(5,(members||[]).length);
  return {group:group||null,members:members||[],invites:invites||[],premium:Boolean(one(premium)),seatsUsed,seatsTotal:5,seatsAvailable:Math.max(0,5-seatsUsed),isOwner};
}
export async function createFamilyGroup(name?:string){const{data,error}=await client().rpc('create_family_group',{p_name:name||'My Family'});if(error)throw error;return data;}
export async function inviteFamilyMember(email:string){const normalized=email.trim().toLowerCase();if(!normalized)throw new Error('Enter an email address.');const state=await getFamilyState();if(!state.group||!state.isOwner)throw new Error('Only the Family owner can invite members.');if(state.seatsAvailable<1)throw new Error('Your five Family seats are already in use.');const{data,error}=await client().rpc('invite_family_member',{p_email:normalized});if(error)throw error;return data;}
export async function acceptFamilyInvite(){const{data,error}=await client().rpc('accept_family_invite');if(error)throw error;return data;}
export async function removeFamilyMember(memberId:string){const{data,error}=await client().rpc('remove_family_member',{p_member_id:memberId});if(error)throw error;return Boolean(data);}
export async function leaveFamilyGroup(){const{data,error}=await client().rpc('leave_family_group');if(error)throw error;return Boolean(data);}
export async function cancelFamilyInvite(inviteId:string){const{data,error}=await client().rpc('cancel_family_invite',{p_invite_id:inviteId});if(error)throw error;return Boolean(data);}
export async function refreshFamilyPremiumAccess(){const{data,error}=await client().rpc('family_has_premium_access');if(error)throw error;return Boolean(one(data));}
