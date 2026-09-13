import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();

export type ClaimableLocation={
  id:string;
  name:string;
  address:string|null;
  city:string|null;
  state:string|null;
  postal_code:string|null;
  place_type:string|null;
  rating:number|null;
  review_count:number|null;
};

export type ProvisionBusinessInput={
  businessName:string;
  existingLocationId?:string|null;
  newLocation?:{
    name?:string;
    address?:string;
    city?:string;
    state?:string;
    postalCode?:string;
    country?:string;
  }|null;
};

export type ProvisionBusinessResult={
  businessId:string;
  businessName:string;
  workspaceCreated:boolean;
  locationId:string|null;
  locationAction:'none'|'already_owned'|'claim_submitted'|'location_created'|string;
  verificationStatus:string;
};

const fields='id,name,address,city,state,postal_code,place_type,rating,review_count';

export async function searchSelfServiceLocations(query:string):Promise<ClaimableLocation[]>{
  const q=query.trim();
  if(q.length<2)return[];
  const pattern=`%${q}%`;
  const build=(column:'name'|'address'|'city')=>client().from('locations').select(fields).eq('is_active',true).is('business_id',null).is('claimed_business_id',null).ilike(column,pattern).limit(12);
  const results=await Promise.all([build('name'),build('address'),build('city')]);
  const map=new Map<string,ClaimableLocation>();
  for(const result of results){
    if(result.error)throw result.error;
    for(const row of result.data||[])map.set(String(row.id),row as ClaimableLocation);
  }
  return [...map.values()].slice(0,20);
}

export async function provisionBusinessWorkspace(input:ProvisionBusinessInput):Promise<ProvisionBusinessResult>{
  const{data,error}=await client().functions.invoke('business-self-service-provision',{body:input});
  if(error)throw error;
  if(data?.error)throw new Error(String(data.error));
  if(!data?.businessId)throw new Error('Business workspace was not created.');
  return data as ProvisionBusinessResult;
}
