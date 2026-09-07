import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
function unwrap<T>(data:T|null,error:{message?:string}|null):T{if(error)throw new Error(error.message||'Review evidence request failed.');if(data==null)throw new Error('Review evidence service returned no data.');return data;}

export async function getReviewEvidence(reviewId:string){const{data,error}=await client().rpc('mobile_review_evidence',{p_review_id:reviewId});return unwrap(data as Record<string,unknown>|null,error);}
export async function getLocationReviewEvidence(locationId:string,limit=20){const{data,error}=await client().rpc('mobile_location_review_evidence',{p_location_id:locationId,p_limit:limit});return unwrap((data??[]) as Array<Record<string,unknown>>,error);}
export async function getReviewPhotos(reviewIds:string[]){if(!reviewIds.length)return[];const{data,error}=await client().rpc('mobile_review_photos_for_reviews',{p_review_ids:reviewIds});return unwrap((data??[]) as Array<Record<string,unknown>>,error);}
