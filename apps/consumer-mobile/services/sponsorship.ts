import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type SponsoredCard={
  campaign_id:string;
  placement_code:string;
  label:string;
  sponsor_name:string;
  headline:string;
  body:string|null;
  cta_label:string;
  destination_url:string;
  target_location_id:string|null;
  creative_mode:'text_only'|'image_text'|'image_only';
  image_url:string|null;
  image_alt:string|null;
  logo_url:string|null;
};

const client=()=>getKleenestSupabaseClient();

export async function listSponsoredCards(surface:string,context:Record<string,unknown>={}):Promise<SponsoredCard[]>{
  const{data,error}=await client().rpc('consumer_sponsored_cards',{p_surface:surface,p_context:context});
  if(error)return[];
  return (Array.isArray(data)?data:[]).map((row:any)=>({
    campaign_id:String(row.campaign_id),
    placement_code:String(row.placement_code),
    label:String(row.label||'Sponsored'),
    sponsor_name:String(row.sponsor_name||'Sponsor'),
    headline:String(row.headline||''),
    body:row.body?String(row.body):null,
    cta_label:String(row.cta_label||'Learn more'),
    destination_url:String(row.destination_url||''),
    target_location_id:row.target_location_id?String(row.target_location_id):null,
    creative_mode:(['image_text','image_only'] as const).includes(String(row.creative_mode) as 'image_text'|'image_only')?(String(row.creative_mode) as 'image_text'|'image_only'):'text_only',
    image_url:row.image_url?String(row.image_url):null,
    image_alt:row.image_alt?String(row.image_alt):null,
    logo_url:row.logo_url?String(row.logo_url):null,
  })).filter(row=>row.campaign_id&&row.placement_code&&row.headline&&row.destination_url);
}

export async function recordSponsoredEvent(card:SponsoredCard,eventType:'impression'|'click'|'dismiss',contextClass?:string){
  const{data}=await client().auth.getSession();
  if(!data.session)return;
  await client().rpc('record_sponsored_event',{p_campaign_id:card.campaign_id,p_placement_code:card.placement_code,p_event_type:eventType,p_context_class:contextClass||null});
}
