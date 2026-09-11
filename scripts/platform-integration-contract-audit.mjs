import fs from 'node:fs';

function required(path, pattern, message) {
  if (!fs.existsSync(path)) throw new Error(`Missing platform integration file: ${path}`);
  const text = fs.readFileSync(path, 'utf8');
  if (pattern && !pattern.test(text)) throw new Error(message ?? `Platform contract missing in ${path}`);
  return text;
}

required('packages/platform-core/src/types.ts', /RecommendationResponse/, 'Platform core must define RecommendationResponse.');
required('packages/platform-core/src/recommendations.ts', /rankRecommendations/, 'Platform core must expose deterministic ranking.');
required('packages/platform-core/src/deepLinks.ts', /kleenest:\/\/place/, 'Platform core must retain native place deep links.');

if (fs.existsSync('packages/sdk-js/src/index.ts')) {
  const sdk = required('packages/sdk-js/src/index.ts', /recommendNearby/, 'SDK must expose nearby recommendations.');
  if (!/recommendRoute/.test(sdk)) throw new Error('SDK must expose route recommendations.');
}
if (fs.existsSync('packages/map-layer/src/index.ts')) {
  required('packages/map-layer/src/index.ts', /FeatureCollection/, 'Map layer must emit GeoJSON FeatureCollection data.');
}
if (fs.existsSync('packages/widget/src/index.ts')) {
  required('packages/widget/src/index.ts', /mountKleenestFinder/, 'Widget must expose a framework-neutral mount function.');
}
if (fs.existsSync('packages/route-sdk/package.json')) {
  const pkg = JSON.parse(fs.readFileSync('packages/route-sdk/package.json', 'utf8'));
  if (pkg.dependencies?.['@kleenest/sdk-js']) throw new Error('Route SDK must not depend on the JS SDK implementation branch.');
  required('packages/route-sdk/src/index.ts', /RouteRecommendationTransport/, 'Route SDK must depend on a transport interface.');
}
if (fs.existsSync('packages/webhook-types/src/index.ts')) {
  const hooks = required('packages/webhook-types/src/index.ts', /place\.verification_changed/, 'Webhook contract must include verification changes.');
  if (!/HMAC/.test(hooks)) throw new Error('Webhook package must verify HMAC signatures.');
}
if (fs.existsSync('supabase/functions/platform-api/index.ts')) {
  const api = required('supabase/functions/platform-api/index.ts', /KLEENEST_PLATFORM_API_KEYS/, 'REST API must require configured partner credentials.');
  for (const rpc of ['map_network_nearby_v3', 'map_network_along_route_v1']) {
    if (!api.includes(rpc)) throw new Error(`REST API must delegate to existing ${rpc} RPC.`);
  }
}
if (fs.existsSync('mcp/kleenest-mcp/src/index.ts')) {
  const mcp = required('mcp/kleenest-mcp/src/index.ts', /find_nearby_restrooms/, 'MCP must expose nearby search.');
  for (const tool of ['find_restrooms_along_route', 'find_next_restroom']) {
    if (!mcp.includes(tool)) throw new Error(`MCP must expose ${tool}.`);
  }
  if (!mcp.includes('/v1/recommendations/')) throw new Error('MCP must delegate to REST instead of implementing a second recommendation engine.');
}

console.log('Kleenest platform integration contract audit passed.');
