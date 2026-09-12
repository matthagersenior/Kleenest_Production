import fs from 'node:fs';

const failures=[];
const required=(path)=>{if(!fs.existsSync(path)){failures.push(`missing ${path}`);return'';}return fs.readFileSync(path,'utf8');};

const migration=required('supabase/migrations/20260912120000_owner_developer_partner_control_plane.sql');
const service=required('apps/platform-mobile/services/developerPartners.ts');
const screen=required('apps/platform-mobile/app/developers.tsx');
const layout=required('apps/platform-mobile/app/_layout.tsx');
const admin=required('supabase/functions/platform-partner-admin/index.ts');
const portal=required('supabase/functions/platform-developer-portal/index.ts');
const api=required('supabase/functions/platform-api/index.ts');

for(const token of [
  'platform_product_bundles','platform_partner_product_access','platform_partner_control_log',
  'owner_platform_partner_directory','owner_platform_partner_detail','owner_create_platform_partner',
  'owner_update_platform_partner','owner_apply_platform_product_bundle','owner_platform_partner_invite',
  'owner_revoke_platform_api_key','owner_disable_platform_webhook','owner_set_platform_partner_billing',
  'starter_api','route_intelligence','place_intelligence','fleet_integration','enterprise_data',
  'nearby','route','place_details','place_match'
]) if(!migration.includes(token)) failures.push(`developer partner migration missing contract token: ${token}`);

for(const token of [
  'getDeveloperPartners','getDeveloperPartnerDetail','createDeveloperPartner','updateDeveloperPartner',
  'applyDeveloperBundle','inviteDeveloperMember','revokeDeveloperCredential','disableDeveloperWebhook',
  'setDeveloperPartnerBilling'
]) if(!service.includes(token)) failures.push(`KleenestOS developer service missing ${token}`);

for(const token of [
  'Developer Platform','Partner workspaces','Product bundle','API products','Per minute','Per month',
  'Team access','Credentials & origins','Webhooks','Billing','Audit trail','Suspend partner'
]) if(!screen.includes(token)) failures.push(`KleenestOS developer workspace missing UI contract: ${token}`);

if(!layout.includes('<Tabs.Screen name="developers"')) failures.push('KleenestOS must expose Developer Platform as a primary owner workspace');
if(!admin.includes('product_access')) failures.push('partner admin summary must expose product access');
if(!portal.includes('API products')) failures.push('customer developer portal must show enabled API products');
if(!portal.includes('Integration surfaces')) failures.push('customer developer portal must show enabled integration surfaces');
if(!admin.includes("bundleKey || 'starter_api'")) failures.push('new partner workspaces must default to Starter API');
if(!migration.includes("'product_not_enabled'")) failures.push('database authorization must deny unassigned API products');
if(!api.includes('p_route: route')) failures.push('platform API must authorize the canonical requested route');
if(!api.includes("auth.reason === 'product_not_enabled'")) failures.push('platform API must return product access denials as forbidden');

if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log('KleenestOS developer partner control-plane audit passed.');
