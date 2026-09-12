import fs from 'node:fs';

function file(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function need(condition, message) {
  if (!condition) throw new Error(message);
}

const api=file('supabase/functions/platform-api/index.ts');
need(api.includes("'/v1/places/match'"), 'Platform API must expose POST /v1/places/match.');
need(api.includes('matchPlaces'), 'Platform API must implement a read-only place matcher.');
need(api.includes('matchedSignals'), 'Place matcher must explain deterministic match signals.');
need(!api.includes('consumer_match_or_create_discovery'), 'Platform matcher must not call the mutation-capable consumer discovery matcher.');

const core=file('packages/platform-core/src/types.ts');
for(const name of ['PlaceMatchRequest','PlaceMatchCandidate','PlaceMatchResponse']) {
  need(core.includes(`export type ${name}`), `Platform core must define ${name}.`);
}

const sdk=file('packages/sdk-js/src/index.ts');
need(sdk.includes('matchPlace('), 'JavaScript SDK must expose matchPlace.');
need(sdk.includes('/v1/places/match'), 'JavaScript SDK matchPlace must call the public v1 match route.');

const openapi=JSON.parse(file('docs/platform/openapi-v1.json'));
need(Boolean(openapi.paths?.['/v1/places/match']?.post), 'OpenAPI must document POST /v1/places/match.');
need(Boolean(openapi.components?.schemas?.PlaceMatchRequest), 'OpenAPI must define PlaceMatchRequest.');
need(Boolean(openapi.components?.schemas?.PlaceMatchResponse), 'OpenAPI must define PlaceMatchResponse.');

const distribution=file('supabase/functions/platform-distribution/index.ts');
need(distribution.includes('matchPlace(input)'), 'Distributed browser SDK must expose matchPlace.');

const smoke=file('supabase/functions/platform-integration-smoke/index.ts');
need(smoke.includes('placeMatch'), 'Live integration smoke must cover place matching.');

console.log('Kleenest Platform place-match audit passed.');
