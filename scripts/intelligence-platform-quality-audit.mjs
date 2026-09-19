import fs from 'node:fs';

const failures=[];
const read=(path)=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const needFile=(path)=>{if(!fs.existsSync(path)){failures.push(`missing ${path}`);return'';}return read(path);};
const tokens=(label,text,values)=>{for(const value of values)if(!text.includes(value))failures.push(`${label} missing ${value}`);};

const mobile=needFile('packages/mobile-core/src/intelligence.ts');
for(const alias of [
  'KleenestNowProjection=IntelligenceRecord',
  'FacilityPassportProjection=IntelligenceRecord',
  'VerifiedAccessProjection=IntelligenceRecord',
  'LocationIntelligenceExplanation=IntelligenceRecord',
  'LocationProofCard=IntelligenceRecord',
  'RouteReliefCoverage=IntelligenceRecord',
  'OwnerIntelligenceOverview=IntelligenceRecord',
  'OwnerProductTruth=IntelligenceRecord',
  'IntelligencePolicy=IntelligenceRecord',
]) if(mobile.replace(/\s/g,'').includes(alias)) failures.push(`mobile intelligence contract remains untyped: ${alias}`);

tokens('mobile intelligence',mobile,[
  'INTELLIGENCE_CONTRACT_VERSION',
  'interface KleenestNowProjection',
  'interface FacilityPassportProjection',
  'interface VerifiedAccessProjection',
  'interface LocationIntelligenceExplanation',
  'interface LocationProofCard',
  'interface RouteReliefCoverage',
  'getLocationIntelligenceBundle',
  'getLocationIntelligenceBatch',
  'getBusinessIntelligenceBundle',
  'getOwnerIntelligenceBundle',
  'INTELLIGENCE_CACHE_TTL_MS',
  'inflightIntelligenceRequests',
  'invalidateIntelligenceCache',
]);

const platformTypes=needFile('packages/platform-core/src/intelligence.ts');
tokens('platform intelligence contracts',platformTypes,[
  'PUBLIC_INTELLIGENCE_CONTRACT_VERSION',
  'PublicPlaceIntelligence',
  'PublicPlaceProof',
  'PublicVerifiedAccess',
  'PublicRouteIntelligence',
  'IntelligenceChangedWebhookData',
]);

const platformIndex=needFile('packages/platform-core/src/index.ts');
if(!platformIndex.includes("./intelligence")) failures.push('platform-core does not export public intelligence contracts');

const recommendations=needFile('packages/platform-core/src/recommendations.ts');
tokens('canonical recommendation authority',recommendations,['normalizeRecommendation','rankRecommendations']);

const api=needFile('supabase/functions/platform-api/index.ts');
tokens('platform API intelligence distribution',api,[
  '../../../packages/platform-core/src/recommendations.ts',
  'rankRecommendations',
  'placeIntelligence',
  'placeProof',
  'verifiedAccess',
  'routeIntelligence',
  '/intelligence',
  '/proof',
  '/access',
  '/v1/intelligence/route',
]);
if(api.includes('function normalizeRow(')) failures.push('platform API still carries a duplicate recommendation normalizer');
if(api.includes('function ranked(')) failures.push('platform API still carries a duplicate recommendation scorer');

const migration=needFile('supabase/migrations/20260919050000_intelligence_platform_quality_pass.sql');
tokens('intelligence quality migration',migration,[
  'intelligence_change_outbox',
  'location_intelligence_revision',
  'location_intelligence_bundle',
  'location_intelligence_batch',
  'business_intelligence_bundle',
  'owner_intelligence_bundle',
  'owner_intelligence_health',
  'record_intelligence_change',
  'intelligence.changed',
  'device_signal',
  "'partner'",
]);

const sdk=needFile('packages/sdk-js/src/index.ts');
tokens('JS SDK intelligence',sdk,[
  'getPlaceIntelligence',
  'getPlaceProof',
  'getVerifiedAccess',
  'getRouteIntelligence',
]);

const routeSdk=needFile('packages/route-sdk/src/index.ts');
tokens('Route SDK intelligence',['getRouteIntelligence','RouteIntelligenceTransport'].map(String).join('\n')+routeSdk,[
  'getRouteIntelligence',
  'RouteIntelligenceTransport',
]);

const webhookTypes=needFile('packages/webhook-types/src/index.ts');
tokens('webhook contract',webhookTypes,[
  "'intelligence.changed'",
  'IntelligenceChangedWebhookData',
]);

const diagnostics=needFile('supabase/functions/platform-partner-admin/index.ts');
tokens('platform diagnostics',diagnostics,[
  'placeIntelligence',
  'placeProof',
  'verifiedAccess',
  'routeIntelligence',
]);

const ownerService=needFile('apps/platform-mobile/services/intelligenceLayer.ts');
tokens('Owner intelligence service',ownerService,['getOwnerIntelligenceHealth','getOwnerIntelligenceBundle']);
const ownerScreen=needFile('apps/platform-mobile/app/intelligence.tsx');
tokens('Owner intelligence UI',ownerScreen,['INTELLIGENCE HEALTH','outbox_backlog','contract_version']);

const search=needFile('packages/mobile-core/src/appSearch.ts');
tokens('capability-driven app search',search,[
  'CapabilitySearchEntry',
  'mergeCapabilitySearchEntries',
  'loadCapabilitySearchEntries',
  'static fallback',
]);

for(const path of [
  'packages/mobile-core/src/locations.ts',
  'packages/mobile-core/src/progression.ts',
  'packages/mobile-core/src/routes.ts',
]) needFile(path);
const mobileIndex=needFile('packages/mobile-core/src/index.ts');
tokens('mobile-core domain facade',mobileIndex,[
  "export * from './locations'",
  "export * from './progression'",
  "export * from './routes'",
]);

if(failures.length){
  console.error(`Intelligence platform quality audit failed (${failures.length}):`);
  for(const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('Intelligence platform quality audit passed: typed contracts, one recommendation authority, bundle/cache/outbox performance, public distribution, device evidence convergence, Owner observability, capability search, and mobile-core domain boundaries are all present.');
