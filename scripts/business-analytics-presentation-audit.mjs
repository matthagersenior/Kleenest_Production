import fs from 'node:fs';
const service=fs.readFileSync('src/services/workspaces.js','utf8');
const page=fs.readFileSync('src/runtime/BusinessWorkspacePage.jsx','utf8');
const mobileIntelligence=fs.readFileSync('apps/business-mobile/app/intelligence.tsx','utf8');
const mobileAnalytics=fs.readFileSync('apps/business-mobile/app/analytics.tsx','utf8');
const mobilePresentationPath='apps/business-mobile/services/intelligencePresentation.ts';
const locationMigrationPath='supabase/migrations/20260907223000_business_location_intelligence_rollup.sql';
const requiredRpcs=['business_campaign_analytics','business_engagement_analytics','business_location_analytics','business_location_detail','business_location_intelligence','business_qr_detail','business_review_detail','business_benchmark_analytics','business_campaign_detail','business_event_detail','business_media_detail','business_occupancy_analytics','business_partner_analytics','business_partner_detail','business_roi_analytics','business_visitors_analytics'];
for(const rpc of requiredRpcs)if(!service.includes(`client.rpc('${rpc}'`))throw new Error(`business analytics service missing ${rpc}`);
if(!service.includes('Promise.allSettled'))throw new Error('business analytics must degrade gracefully when an optional analytics surface is unavailable');
for(const label of ['Authorized performance analytics','QR ATTRIBUTION','REVIEW DETAIL','CAMPAIGNS','EVENTS','MEDIA','ROI'])if(!page.includes(label))throw new Error(`business analytics presentation missing ${label}`);
for(const days of ['[7,30,90]','setDays(value)'])if(!page.includes(days))throw new Error('business analytics date-window controls are incomplete');
if(!page.includes('unavailableCount'))throw new Error('business analytics presentation must surface partial availability');

if(!fs.existsSync(mobilePresentationPath))throw new Error('business mobile analytics must share an operator-safe presentation helper');
else {
  const presentation=fs.readFileSync(mobilePresentationPath,'utf8');
  for(const token of ['formatBusinessIntelligenceValue','formatBusinessIntelligenceLabel','businessIntelligenceErrorMessage','isBusinessInternalField'])if(!presentation.includes(token))throw new Error(`business mobile intelligence presentation missing ${token}`);
  for(const raw of ['business_id','location_id','generated_at'])if(!presentation.includes(raw))throw new Error(`business mobile intelligence presentation must explicitly suppress/format ${raw}`);
}
for(const [source,label] of [[mobileIntelligence,'advanced intelligence'],[mobileAnalytics,'quick analytics']]){
  if(!source.includes('formatBusinessIntelligenceValue')||!source.includes('formatBusinessIntelligenceLabel'))throw new Error(`business mobile ${label} must use operator-safe value/label formatting`);
  if(source.includes('>{section.error}</Text>'))throw new Error(`business mobile ${label} must not render raw backend errors`);
}
if(mobileIntelligence.includes("String(row.id||row.location_id")||mobileAnalytics.includes("String(row.id||row.location_id"))throw new Error('business mobile intelligence must not use internal identifiers as operator-facing identity');
if(!fs.existsSync(locationMigrationPath))throw new Error('business location intelligence timeout repair migration is missing');
else {
  const migration=fs.readFileSync(locationMigrationPath,'utf8');
  for(const token of ['event_rollup','count(*) filter','business_location_intelligence'])if(!migration.includes(token))throw new Error(`business location intelligence timeout repair missing ${token}`);
  if(/select count\(\*\) from public\.data_feature_events/i.test(migration))throw new Error('business location intelligence must not use repeated correlated data_feature_events count subqueries');
}
console.log(`Business analytics presentation audit passed for ${requiredRpcs.length} RPC surfaces plus mobile operator-safe intelligence.`);
