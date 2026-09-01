import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
const one=(value:any)=>Array.isArray(value)?value[0]??null:value??null;

export type FamilyState={
  group:any|null;
  members:any[];
  invites:any[];
  premium:boolean;
  seatsUsed:number;
  seatsTotal:5;
  seatsAvailable:number;
};

export async function getFamilyState():Promise<FamilyState>{
  const [{data:groups,error:groupError},{data:premium,error:premiumError}]=await Promise.all([
    client().from('family_groups').select('*').limit(1),
    client().rpc('family_has_premium_access'),
  ]);
  if(groupError)throw groupError;
  if(premiumError)throw premiumError;
  const group=Array.isArray(groups)?groups[0]??null:groups??null;
  if(!group)return {group:null,members:[],invites:[],premium:Boolean(one(premium)),seatsUsed:0,seatsTotal:5,seatsAvailable:5};
  const groupId=group.id;
  const [{data:members,error:memberError},{data:invites,error:inviteError}]=await Promise.all([
    client().from('family_members').select('*').eq('family_group_id',groupId),
    client().from('family_invites').select('*').eq('family_group_id',groupId).order('created_at',{ascending:false}),
  ]);
  if(memberError)throw memberError;
  if(inviteError)throw inviteError;
  const activeMembers=(members||[]).filter((member:any)=>!member.removed_at&&!member.revoked_at&&String(member.status||'active')!=='removed');
  const seatsUsed=Math.min(5,Math.max(1,activeMembers.length));
  return {group,members:members||[],invites:invites||[],premium:Boolean(one(premium)),seatsUsed,seatsTotal:5,seatsAvailable:Math.max(0,5-seatsUsed)};
}

export async function createFamilyGroup(name?:string){
  const {data,error}=await client().rpc('create_family_group',name?{p_name:name}:{});
  if(error)throw error;
  return data;
}

export async function inviteFamilyMember(email:string){
  const normalized=email.trim().toLowerCase();
  if(!normalized)throw new Error('Enter an email address.');
  const state=await getFamilyState();
  if(!state.group)throw new Error('Create your Family group first.');
  if(state.seatsAvailable<1)throw new Error('Your five Family seats are already in use.');
  const {data,error}=await client().rpc('invite_family_member',{p_email:normalized});
  if(error)throw error;
  return data;
}

export async function acceptFamilyInvite(inviteId:string){
  const {data,error}=await client().rpc('accept_family_invite',{p_invite_id:inviteId});
  if(error)throw error;
  return data;
}

export async function refreshFamilyPremiumAccess(){
  const {data,error}=await client().rpc('family_has_premium_access');
  if(error)throw error;
  return Boolean(one(data));
}
