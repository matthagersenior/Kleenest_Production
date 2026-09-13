import fs from 'node:fs';

const failures=[];
const read=(path)=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const requireTokens=(label,text,tokens)=>{for(const token of tokens)if(!text.includes(token))failures.push(`${label} missing ${token}`);};

const trustAuthority=read('supabase/migrations/20260913130000_business_community_photo_trust_authority.sql');
const moderationAuthority=read('supabase/migrations/20260913133000_review_photo_moderation_fleet_operator_convergence.sql');
const photoActions=read('apps/consumer-mobile/components/PhotoTrustActions.tsx');
const ownerModeration=read('apps/platform-mobile/app/moderation.tsx');
const businessProduct=read('apps/business-mobile/services/product.ts');
const businessMedia=read('apps/business-mobile/services/media.ts');
const businessLocations=read('apps/business-mobile/app/locations.tsx');
const businessGrowth=read('apps/business-mobile/app/growth.tsx');
const businessActions=read('apps/business-mobile/services/actionRegistry.ts');
const consumerPresentation=read('apps/consumer-mobile/services/locationPresentation.ts');
const explore=read('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx');
const details=read('apps/consumer-mobile/app/location/[id].tsx');

requireTokens('Community photo trust authority',trustAuthority,[
  'business_photo_disputes',
  'business_list_location_community_photos',
  'business_dispute_review_photo',
  'review_photos',
  'contributor_reputation',
  "r.status='published'",
  "date_part('day', now()-r.created_at)",
  'coalesce(cr.reputation_score,0)',
  "'review-photos'::text",
  'drop function if exists public.business_set_location_consumer_photo',
  'mobile_location_presentation_v1',
]);
if(!/order by[\s\S]{0,420}freshness_rank[\s\S]{0,220}reputation_score desc[\s\S]{0,220}review_created_at desc/i.test(trustAuthority)){
  failures.push('Community consumer photo selection must rank freshness first, then contributor reputation, then review recency.');
}
const presentationAuthority=(trustAuthority.split('create function public.mobile_location_presentation_v1')[1]||'');
if(/business_photo_disputes/i.test(presentationAuthority)){
  failures.push('A Business dispute must not automatically hide community evidence from consumers.');
}

requireTokens('Photo moderation authority',moderationAuthority,['review_photo_reports','review_photo_votes',"'privacy','explicit','relevance','other'",'admin_list_review_photo_reports','admin_resolve_review_photo_report',"rp.moderation_status='visible'","'platform_owner'"]);
requireTokens('Consumer photo moderation controls',photoActions,['Helpful ·','Not helpful ·','Flag','immediate owner review']);
requireTokens('KleenestOS photo moderation',ownerModeration,['Photo flags','Hide photo','Restore photo']);
requireTokens('Business product service',businessProduct,['listBusinessLocationCommunityPhotos','disputeBusinessReviewPhoto']);
if(businessProduct.includes('setBusinessLocationConsumerPhoto'))failures.push('Business service must not expose authority to choose the consumer community photo.');
requireTokens('Business media upload',businessMedia,['location-photos','pickAndUploadBusinessLocationPhoto','business_create_media','businessLocationPhotoUrl','businessReviewPhotoUrl','review-photos']);
if(businessLocations.includes('Choose consumer photo'))failures.push('Business location UI must not let a Business choose the consumer community photo.');
requireTokens('Business location UI',businessLocations,['Add official photo']);
requireTokens('Business media and disputes UI',businessGrowth,['Official location media','Community photo evidence','Flag / dispute','disputeBusinessReviewPhoto','businessReviewPhotoUrl']);
if(/Use on consumer cards|CONSUMER PHOTO|setBusinessLocationConsumerPhoto/.test(businessGrowth))failures.push('Business Growth UI still contains consumer-photo selection controls.');
requireTokens('Business action registry',businessActions,['disputeBusinessReviewPhoto']);
if(businessActions.includes('setBusinessLocationConsumerPhoto'))failures.push('Business action registry must not register consumer-photo selection authority.');

requireTokens('Consumer location presentation service',consumerPresentation,['consumer_photo_bucket','consumer_photo_source','consumer_photo_trust_score','publicLocationPhotoUrl','review-photos']);
requireTokens('Consumer Explore photo presentation',explore,['attachLocationPresentations','consumer_photo_url','cardPhoto','markerPhoto','selectedPhoto']);
requireTokens('Consumer detail photo presentation',details,['getLocationPresentation','consumer_photo_url','COMMUNITY TRUST PHOTO','COMMUNITY PHOTOS','TRUSTED + FRESH']);
const explorePhotoUses=(explore.match(/consumer_photo_url/g)||[]).length;
if(explorePhotoUses<3)failures.push('Consumer Explore must use the canonical trust-ranked community photo on result cards, map pins, and selected pin cards.');

if(failures.length){
  console.error('Consumer location photo trust authority audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Consumer location photo trust authority passed: primary consumer imagery is community supplied, freshness/trust ranked, and Business disputes preserve moderation neutrality.');
