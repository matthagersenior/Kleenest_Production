import fs from 'node:fs';

const updateMigration=fs.readFileSync('supabase/migrations/20260831163401_business_profile_control_plane.sql','utf8');
const readMigration=fs.readFileSync('supabase/migrations/20260831163402_business_profile_read_control_plane.sql','utf8');
const service=fs.readFileSync('src/services/businessOperations.js','utf8');
const workspaceService=fs.readFileSync('src/services/workspaces.js','utf8');
const panel=fs.readFileSync('src/runtime/BusinessAdvancedOperationsPanel.jsx','utf8');
const workspace=fs.readFileSync('src/runtime/BusinessWorkspacePage.jsx','utf8');

for(const token of [
  'create or replace function public.business_update_profile(',
  'security invoker',
  "set search_path = ''",
  'revoke execute on function public.business_update_profile(uuid,text,text,text,text,text,text) from public, anon;',
  'grant execute on function public.business_update_profile(uuid,text,text,text,text,text,text) to authenticated, service_role;',
]) if(!updateMigration.includes(token)) throw new Error(`business profile update authority missing: ${token}`);

for(const token of [
  'create or replace function public.business_get_profile(',
  'security definer',
  "set search_path = ''",
  'public.business_can_manage(p_business_id)',
  'public.is_platform_owner_session()',
  'revoke execute on function public.business_get_profile(uuid) from public, anon;',
  'grant execute on function public.business_get_profile(uuid) to authenticated, service_role;',
]) if(!readMigration.includes(token)) throw new Error(`business profile read authority missing: ${token}`);

for(const token of [
  "rpc('business_update_profile'",
  "rpc('business_get_profile'",
  'uploadBusinessQrBrandingLogo',
  "storage.from('qr-branding').upload",
  'updateBusinessMedia',
  'updateBusinessContest',
  'updateBusinessPromotion',
  'setBusinessPromotionActive',
  'deleteBusinessPromotion',
  'updateCustomBusinessQr',
]) if(!service.includes(token)) throw new Error(`business control service missing: ${token}`);

for(const token of ["client.rpc('business_get_profile'","client.rpc('business_promotion_detail'","client.rpc('business_promotion_analytics'"]) if(!workspaceService.includes(token)) throw new Error(`business workspace service missing: ${token}`);

for(const token of ['Business profile','Promotion lifecycle','Contest lifecycle','Advanced QR branding','Edit QR lifecycle','Media library','updateBusinessProfile','uploadBusinessQrBrandingLogo','updateBusinessMedia','updateBusinessContest','updateBusinessPromotion']) if(!panel.includes(token)) throw new Error(`business control presentation missing: ${token}`);

for(const token of ['businessProfile={businessProfile}','promotionSummary','analytics?.promotions']) if(!workspace.includes(token)) throw new Error(`business workspace control binding missing: ${token}`);

console.log('Business control plane completeness audit passed.');
