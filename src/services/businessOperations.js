import { getSupabase } from '../lib/supabase.js';

function requireId(value,label){if(!value)throw new Error(`${label} is required.`);return value}
async function rpc(name,args){const{data,error}=await getSupabase().rpc(name,args);if(error)throw error;return data}
function safeImageExtension(file){const ext=String(file?.name||'image').split('.').pop()?.toLowerCase()||'jpg';return ['jpg','jpeg','png','webp'].includes(ext)?ext:'jpg'}

export function manageBusinessLocation(businessId,{locationId=null,action='create',payload={}}={}){requireId(businessId,'Business id');return rpc('business_manage_location',{p_business_id:businessId,p_location_id:locationId,p_action:action,p_payload:payload})}
export function createBusinessLocation(businessId,payload){return manageBusinessLocation(businessId,{action:'create',payload})}
export function updateBusinessLocation(businessId,locationId,payload){return manageBusinessLocation(businessId,{locationId:requireId(locationId,'Location id'),action:'update',payload})}
export function deactivateBusinessLocation(businessId,locationId){return manageBusinessLocation(businessId,{locationId:requireId(locationId,'Location id'),action:'deactivate'})}

export function manageBusinessPromotion(businessId,{promotionId=null,action='create',payload={}}={}){requireId(businessId,'Business id');return rpc('business_manage_promotion',{p_business_id:businessId,p_promotion_id:promotionId,p_action:action,p_payload:payload})}
export function createBusinessPromotion(businessId,payload){return manageBusinessPromotion(businessId,{action:'create',payload})}
export function updateBusinessPromotion(businessId,promotionId,payload){return manageBusinessPromotion(businessId,{promotionId:requireId(promotionId,'Promotion id'),action:'update',payload})}
export function deactivateBusinessPromotion(businessId,promotionId){return manageBusinessPromotion(businessId,{promotionId:requireId(promotionId,'Promotion id'),action:'deactivate'})}
export function setBusinessPromotionActive(businessId,promotionId,active){return rpc('business_set_promotion_active',{p_business_id:requireId(businessId,'Business id'),p_promotion_id:requireId(promotionId,'Promotion id'),p_active:Boolean(active)})}
export function deleteBusinessPromotion(businessId,promotionId){return rpc('business_delete_promotion',{p_business_id:requireId(businessId,'Business id'),p_id:requireId(promotionId,'Promotion id')})}

export function manageBusinessCampaign(businessId,{campaignId=null,action='create',name=null,campaignType=null,goal=null,status=null}={}){requireId(businessId,'Business id');return rpc('business_manage_campaign',{p_business_id:businessId,p_campaign_id:campaignId,p_action:action,p_name:name,p_campaign_type:campaignType,p_goal:goal,p_status:status})}
export function createBusinessCampaign(businessId,payload){return manageBusinessCampaign(businessId,{...payload,action:'create'})}
export function updateBusinessCampaign(businessId,campaignId,payload){return manageBusinessCampaign(businessId,{...payload,campaignId:requireId(campaignId,'Campaign id'),action:'update'})}
export function setBusinessCampaignStatus(businessId,campaignId,active){return manageBusinessCampaign(businessId,{campaignId:requireId(campaignId,'Campaign id'),action:active?'activate':'pause'})}

export function manageBusinessEvent(businessId,{eventId=null,action='create',payload={}}={}){requireId(businessId,'Business id');return rpc('business_manage_event',{p_business_id:businessId,p_event_id:eventId,p_action:action,p_payload:payload})}
export function createBusinessEvent(businessId,payload){return manageBusinessEvent(businessId,{action:'create',payload})}
export function updateBusinessEvent(businessId,eventId,payload){return manageBusinessEvent(businessId,{eventId:requireId(eventId,'Event id'),action:'update',payload})}
export function deleteBusinessEvent(businessId,eventId){return manageBusinessEvent(businessId,{eventId:requireId(eventId,'Event id'),action:'delete'})}

export function manageBusinessQr(businessId,{locationId=null,qrId=null,action='create',payload={}}={}){requireId(businessId,'Business id');return rpc('business_manage_qr',{p_business_id:businessId,p_location_id:locationId,p_qr_id:qrId,p_action:action,p_payload:payload})}
export function createBusinessQr(businessId,locationId,payload={}){return manageBusinessQr(businessId,{locationId:requireId(locationId,'Location id'),action:'create',payload})}
export function updateBusinessQr(businessId,qrId,payload,locationId=null){return manageBusinessQr(businessId,{locationId,qrId:requireId(qrId,'QR id'),action:'update',payload})}
export function deactivateBusinessQr(businessId,qrId,locationId=null){return manageBusinessQr(businessId,{locationId,qrId:requireId(qrId,'QR id'),action:'deactivate'})}
export function createCustomBusinessQr(businessId,{locationId=null,label='',purpose='checkin',actionType='checkin',actionPayload={},customization={},singleUse=false,maxRedemptions=null}={}){requireId(businessId,'Business id');return rpc('business_create_custom_qr',{p_business_id:businessId,p_location_id:locationId,p_label:label,p_purpose:purpose,p_action_type:actionType,p_action_payload:actionPayload,p_customization:customization,p_single_use:Boolean(singleUse),p_max_redemptions:maxRedemptions==null?null:Number(maxRedemptions)})}
export function updateCustomBusinessQr(businessId,qrId,{label='',purpose='custom',actionType='custom',actionPayload={},customization={},active=true,singleUse=false,maxRedemptions=null}={}){requireId(businessId,'Business id');requireId(qrId,'QR id');return rpc('business_update_custom_qr',{p_business_id:businessId,p_qr_id:qrId,p_label:label,p_purpose:purpose,p_action_type:actionType,p_action_payload:actionPayload,p_customization:customization,p_active:Boolean(active),p_single_use:Boolean(singleUse),p_max_redemptions:maxRedemptions==null?null:Number(maxRedemptions)})}
export function setCustomBusinessQrActive(businessId,qrId,active){return rpc('business_set_qr_active',{p_business_id:requireId(businessId,'Business id'),p_qr_id:requireId(qrId,'QR id'),p_active:Boolean(active)})}
export function deleteCustomBusinessQr(businessId,qrId){return rpc('business_delete_qr',{p_business_id:requireId(businessId,'Business id'),p_qr_id:requireId(qrId,'QR id')})}
export async function uploadBusinessQrBrandingLogo(businessId,file){
  requireId(businessId,'Business id');if(!file)throw new Error('Branding image is required.');
  const client=getSupabase();const{data:{user},error:userError}=await client.auth.getUser();if(userError)throw userError;if(!user)throw new Error('Authentication required.');
  const path=`${businessId}/${user.id}/${crypto.randomUUID()}.${safeImageExtension(file)}`;
  const{error}=await client.storage.from('qr-branding').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type||undefined});if(error)throw error;
  const{data}=client.storage.from('qr-branding').getPublicUrl(path);return {path,url:data?.publicUrl||null};
}

export function listBusinessContests(businessId){return rpc('business_list_contests',{p_business_id:requireId(businessId,'Business id')})}
export function manageBusinessContest(businessId,{contestId=null,action='create',payload={}}={}){return rpc('business_manage_contest',{p_business_id:requireId(businessId,'Business id'),p_contest_id:contestId,p_action:action,p_payload:payload})}
export function createBusinessContest(businessId,payload){return manageBusinessContest(businessId,{action:'create',payload})}
export function updateBusinessContest(businessId,contestId,payload){return manageBusinessContest(businessId,{contestId:requireId(contestId,'Contest id'),action:'update',payload})}
export function setBusinessContestStatus(businessId,contestId,action){if(!['activate','pause','resume'].includes(action))throw new Error('Unsupported contest status action.');return manageBusinessContest(businessId,{contestId:requireId(contestId,'Contest id'),action})}
export function deleteBusinessContest(businessId,contestId){return manageBusinessContest(businessId,{contestId:requireId(contestId,'Contest id'),action:'delete'})}

export function listBusinessMedia(businessId){return rpc('business_list_media',{p_business_id:requireId(businessId,'Business id')})}
export async function uploadBusinessLocationPhoto(file){
  if(!file)throw new Error('Photo file is required.');
  const client=getSupabase();const{data:{user},error:userError}=await client.auth.getUser();if(userError)throw userError;if(!user)throw new Error('Authentication required.');
  const path=`${user.id}/${crypto.randomUUID()}.${safeImageExtension(file)}`;
  const{error}=await client.storage.from('location-photos').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type||undefined});if(error)throw error;return path;
}
export function createBusinessMedia(businessId,{locationId=null,storagePath,caption=null,mediaType='photo',mimeType=null,sizeBytes=null,width=null,height=null,sortOrder=0}={}){requireId(storagePath,'Storage path');return rpc('business_create_media',{p_business_id:requireId(businessId,'Business id'),p_location_id:requireId(locationId,'Location id'),p_storage_path:storagePath,p_caption:caption,p_media_type:mediaType,p_mime_type:mimeType,p_size_bytes:sizeBytes,p_width:width,p_height:height,p_sort_order:Number(sortOrder)||0})}
export function updateBusinessMedia(businessId,mediaId,{storagePath,caption=null,mediaType='photo',sortOrder=0}={}){return rpc('business_update_media',{p_business_id:requireId(businessId,'Business id'),p_media_id:requireId(mediaId,'Media id'),p_storage_path:requireId(storagePath,'Storage path'),p_caption:caption,p_media_type:mediaType,p_sort_order:Number(sortOrder)||0})}
export function deleteBusinessMedia(businessId,mediaId){return rpc('business_delete_media',{p_business_id:requireId(businessId,'Business id'),p_media_id:requireId(mediaId,'Media id')})}

export function getBusinessProfile(businessId){return rpc('business_get_profile',{p_business_id:requireId(businessId,'Business id')})}
export function updateBusinessProfile(businessId,{name=null,description=null,website=null,phone=null,email=null,logoUrl=null}={}){return rpc('business_update_profile',{p_business_id:requireId(businessId,'Business id'),p_name:name,p_description:description,p_website:website,p_phone:phone,p_email:email,p_logo_url:logoUrl})}

export function replyToBusinessReview(businessId,reviewId,reply){requireId(businessId,'Business id');requireId(reviewId,'Review id');return rpc('business_reply_review',{p_business_id:businessId,p_review_id:reviewId,p_reply:String(reply??'')})}
