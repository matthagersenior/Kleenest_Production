import fs from 'node:fs';

const failures=[];
const read=(path)=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const requireTokens=(label,text,tokens)=>{for(const token of tokens)if(!text.includes(token))failures.push(`${label} missing ${token}`);};

const authority=read('supabase/migrations/20260913095946_business_consumer_location_photo_authority.sql');
const publicPresentation=read('supabase/migrations/20260913100458_consumer_location_photo_public_invoker.sql');
const businessProduct=read('apps/business-mobile/services/product.ts');
const businessMedia=read('apps/business-mobile/services/media.ts');
const businessLocations=read('apps/business-mobile/app/locations.tsx');
const businessGrowth=read('apps/business-mobile/app/growth.tsx');
const businessActions=read('apps/business-mobile/services/actionRegistry.ts');
const consumerPresentation=read('apps/consumer-mobile/services/locationPresentation.ts');
const explore=read('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx');
const details=read('apps/consumer-mobile/app/location/[id].tsx');

requireTokens('Business photo authority migration',authority,[
  'business_manages_location',
  'business_create_media',
  'business_list_media_v2',
  'business_set_location_consumer_photo',
  'update public.location_photos set is_featured=false',
  'update public.location_photos set is_featured=true',
  "location_id=p_location_id and media_type in ('photo','image')",
  'Business management access required for location',
]);
requireTokens('Public location presentation migration',publicPresentation,[
  'mobile_location_presentation_v1',
  'security invoker',
  'consumer_photo_id uuid',
  'consumer_photo_storage_path text',
  'order by p.is_featured desc,p.sort_order,p.created_at desc,p.id',
  'grant execute on function public.mobile_location_presentation_v1(uuid[]) to anon,authenticated,service_role',
]);
if(/business_name|business_logo_url/.test(publicPresentation))failures.push('Public location presentation RPC must expose only location-photo presentation fields.');

requireTokens('Business product service',businessProduct,['business_list_media_v2','business_set_location_consumer_photo','setBusinessLocationConsumerPhoto']);
requireTokens('Business media upload',businessMedia,['location-photos','pickAndUploadBusinessLocationPhoto','business_create_media','businessLocationPhotoUrl']);
requireTokens('Business location UI',businessLocations,['Add photo','Choose consumer photo',"pathname:'/growth'"]);
requireTokens('Business media chooser UI',businessGrowth,['Consumer location photos','Use on consumer cards','CONSUMER PHOTO','setBusinessLocationConsumerPhoto','businessLocationPhotoUrl']);
requireTokens('Business action registry',businessActions,['setBusinessLocationConsumerPhoto']);

requireTokens('Consumer location presentation service',consumerPresentation,['mobile_location_presentation_v1','consumer_photo_url','publicLocationPhotoUrl','attachLocationPresentations','location-photos']);
requireTokens('Consumer Explore photo presentation',explore,['attachLocationPresentations','consumer_photo_url','cardPhoto','markerPhoto','selectedPhoto']);
requireTokens('Consumer detail photo presentation',details,['getLocationPresentation','consumer_photo_url','BUSINESS-SELECTED LOCATION PHOTO','COMMUNITY PHOTOS','MOST HELPFUL','helpfulCount','reviewCreatedAt']);
const explorePhotoUses=(explore.match(/consumer_photo_url/g)||[]).length;
if(explorePhotoUses<3)failures.push('Consumer Explore must use the canonical consumer photo on result cards, map pins, and selected pin cards.');

if(failures.length){
  console.error('Consumer location photo authority audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Consumer location photo authority audit passed from claimed-business selection through search, map, details, and community gallery presentation.');
