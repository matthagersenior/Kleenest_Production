import * as ImagePicker from 'expo-image-picker';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data;}

export type SponsoredPlacement={placement_code:string;surface:string;slot:string;format:string;frequency_cap_daily:number};
export type SponsoredCreativeDraft={uri:string;fileName:string|null;mimeType:string|null;fileSize:number|null;width:number|null;height:number|null};
export type BusinessSponsoredCampaign={
 id:string;business_id:string;name:string;sponsor_name:string;headline:string;body:string|null;cta_label:string;destination_url:string;
 status:string;submission_status:string;targeting:Record<string,unknown>;frequency_cap_daily:number;impression_cap_total:number|null;
 placements:string[];impressions:number;clicks:number;dismissals:number;review_note?:string|null;
 creative_mode:'text_only'|'image_text'|'image_only';image_url?:string|null;image_alt?:string|null;logo_url?:string|null;
};
export type BusinessSponsorshipSnapshot={
 placements:SponsoredPlacement[];
 campaigns:BusinessSponsoredCampaign[];
 rules:{organic_ranking_affected:boolean;trust_affected:boolean;remove_ads_applies:boolean;activation_requires_approval:boolean;allowed_targeting_keys:string[]};
};

export async function getBusinessSponsorshipSnapshot(businessId:string):Promise<BusinessSponsorshipSnapshot>{
 const data:any=await rpc('business_sponsorship_snapshot',{p_business_id:businessId});
 return {
  placements:Array.isArray(data?.placements)?data.placements:[],
  campaigns:Array.isArray(data?.campaigns)?data.campaigns:[],
  rules:data?.rules||{},
 };
}

export function saveBusinessSponsoredCampaign(businessId:string,input:{
 id?:string|null;name:string;headline:string;body?:string;ctaLabel?:string;destinationUrl:string;targeting?:Record<string,unknown>;
 frequencyCapDaily?:number;impressionCapTotal?:number|null;placementCodes:string[];submit?:boolean;
 creativeMode?:'text_only'|'image_text'|'image_only';imageUrl?:string|null;imageAlt?:string|null;logoUrl?:string|null;
}){
 return rpc('business_upsert_sponsored_campaign',{
  p_business_id:businessId,
  p_campaign_id:input.id??null,
  p_name:input.name,
  p_headline:input.headline,
  p_body:input.body??'',
  p_cta_label:input.ctaLabel??'Learn more',
  p_destination_url:input.destinationUrl,
  p_targeting:input.targeting??{},
  p_frequency_cap_daily:input.frequencyCapDaily??2,
  p_impression_cap_total:input.impressionCapTotal??null,
  p_placement_codes:input.placementCodes,
  p_submit:input.submit===true,
  p_creative_mode:input.creativeMode??'text_only',
  p_image_url:input.imageUrl??null,
  p_image_alt:input.imageAlt??null,
  p_logo_url:input.logoUrl??null,
 });
}

export function withdrawBusinessSponsoredCampaign(businessId:string,campaignId:string){
 return rpc('business_withdraw_sponsored_campaign',{p_business_id:businessId,p_campaign_id:campaignId});
}


const MAX_SPONSORED_CREATIVE_BYTES=5*1024*1024;
function extensionForCreative(asset:SponsoredCreativeDraft){
 const ext=asset.fileName?.split('.').pop()?.toLowerCase();
 if(ext&&['jpg','jpeg','png','webp'].includes(ext))return ext==='jpeg'?'jpg':ext;
 if(asset.mimeType==='image/png')return'png';
 if(asset.mimeType==='image/webp')return'webp';
 return'jpg';
}
export async function chooseSponsoredCreative():Promise<SponsoredCreativeDraft|null>{
 const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[16,9],quality:.86});
 if(result.canceled||!result.assets?.length)return null;
 const asset=result.assets[0];
 return {uri:asset.uri,fileName:asset.fileName||null,mimeType:asset.mimeType||null,fileSize:asset.fileSize??null,width:Number.isFinite(asset.width)?asset.width:null,height:Number.isFinite(asset.height)?asset.height:null};
}
export async function uploadBusinessSponsoredCreative(businessId:string,asset:SponsoredCreativeDraft){
 if(asset.fileSize!=null&&asset.fileSize>MAX_SPONSORED_CREATIVE_BYTES)throw new Error('Sponsored images must be 5 MB or smaller.');
 const response=await fetch(asset.uri);if(!response.ok)throw new Error('The selected sponsored image could not be read.');
 const bytes=await response.arrayBuffer();if(bytes.byteLength>MAX_SPONSORED_CREATIVE_BYTES)throw new Error('Sponsored images must be 5 MB or smaller.');
 const {data:auth,error:authError}=await client().auth.getUser();if(authError)throw authError;if(!auth.user)throw new Error('Sign in to upload sponsored creative.');
 const ext=extensionForCreative(asset);const contentType=asset.mimeType||(ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg');
 const path=`business/${businessId}/${auth.user.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
 const {error}=await client().storage.from('sponsored-ad-creatives').upload(path,bytes,{contentType,upsert:false});if(error)throw error;
 return client().storage.from('sponsored-ad-creatives').getPublicUrl(path).data.publicUrl;
}
