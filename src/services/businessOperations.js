import { getSupabase } from '../lib/supabase.js';

function requireId(value,label){if(!value)throw new Error(`${label} is required.`);return value}
async function rpc(name,args){const{data,error}=await getSupabase().rpc(name,args);if(error)throw error;return data}

export function manageBusinessLocation(businessId,{locationId=null,action='create',payload={}}={}){
  requireId(businessId,'Business id');
  return rpc('business_manage_location',{p_business_id:businessId,p_location_id:locationId,p_action:action,p_payload:payload});
}
export function createBusinessLocation(businessId,payload){return manageBusinessLocation(businessId,{action:'create',payload})}
export function updateBusinessLocation(businessId,locationId,payload){return manageBusinessLocation(businessId,{locationId:requireId(locationId,'Location id'),action:'update',payload})}
export function deactivateBusinessLocation(businessId,locationId){return manageBusinessLocation(businessId,{locationId:requireId(locationId,'Location id'),action:'deactivate'})}

export function manageBusinessPromotion(businessId,{promotionId=null,action='create',payload={}}={}){
  requireId(businessId,'Business id');
  return rpc('business_manage_promotion',{p_business_id:businessId,p_promotion_id:promotionId,p_action:action,p_payload:payload});
}
export function createBusinessPromotion(businessId,payload){return manageBusinessPromotion(businessId,{action:'create',payload})}
export function updateBusinessPromotion(businessId,promotionId,payload){return manageBusinessPromotion(businessId,{promotionId:requireId(promotionId,'Promotion id'),action:'update',payload})}
export function deactivateBusinessPromotion(businessId,promotionId){return manageBusinessPromotion(businessId,{promotionId:requireId(promotionId,'Promotion id'),action:'deactivate'})}

export function manageBusinessCampaign(businessId,{campaignId=null,action='create',name=null,campaignType=null,goal=null,status=null}={}){
  requireId(businessId,'Business id');
  return rpc('business_manage_campaign',{p_business_id:businessId,p_campaign_id:campaignId,p_action:action,p_name:name,p_campaign_type:campaignType,p_goal:goal,p_status:status});
}
export function createBusinessCampaign(businessId,payload){return manageBusinessCampaign(businessId,{...payload,action:'create'})}
export function updateBusinessCampaign(businessId,campaignId,payload){return manageBusinessCampaign(businessId,{...payload,campaignId:requireId(campaignId,'Campaign id'),action:'update'})}
export function setBusinessCampaignStatus(businessId,campaignId,active){return manageBusinessCampaign(businessId,{campaignId:requireId(campaignId,'Campaign id'),action:active?'activate':'pause'})}

export function manageBusinessEvent(businessId,{eventId=null,action='create',payload={}}={}){
  requireId(businessId,'Business id');
  return rpc('business_manage_event',{p_business_id:businessId,p_event_id:eventId,p_action:action,p_payload:payload});
}
export function createBusinessEvent(businessId,payload){return manageBusinessEvent(businessId,{action:'create',payload})}
export function updateBusinessEvent(businessId,eventId,payload){return manageBusinessEvent(businessId,{eventId:requireId(eventId,'Event id'),action:'update',payload})}
export function deleteBusinessEvent(businessId,eventId){return manageBusinessEvent(businessId,{eventId:requireId(eventId,'Event id'),action:'delete'})}

export function manageBusinessQr(businessId,{locationId=null,qrId=null,action='create',payload={}}={}){
  requireId(businessId,'Business id');
  return rpc('business_manage_qr',{p_business_id:businessId,p_location_id:locationId,p_qr_id:qrId,p_action:action,p_payload:payload});
}
export function createBusinessQr(businessId,locationId,payload={}){return manageBusinessQr(businessId,{locationId:requireId(locationId,'Location id'),action:'create',payload})}
export function updateBusinessQr(businessId,qrId,payload,locationId=null){return manageBusinessQr(businessId,{locationId,qrId:requireId(qrId,'QR id'),action:'update',payload})}
export function deactivateBusinessQr(businessId,qrId,locationId=null){return manageBusinessQr(businessId,{locationId,qrId:requireId(qrId,'QR id'),action:'deactivate'})}

export function replyToBusinessReview(businessId,reviewId,reply){
  requireId(businessId,'Business id');requireId(reviewId,'Review id');
  return rpc('business_reply_review',{p_business_id:businessId,p_review_id:reviewId,p_reply:String(reply??'')});
}
