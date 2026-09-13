import fs from 'node:fs';

function file(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function need(condition, message) {
  if (!condition) throw new Error(message);
}

const migrationName=fs.readdirSync('supabase/migrations').find(name=>name.includes('platform_place_match_authority'));
need(Boolean(migrationName), 'Place matching must have a durable database authority migration.');
const sql=file(`supabase/migrations/${migrationName}`);
need(sql.includes('function public.platform_match_places'), 'Migration must define platform_match_places.');
need(/security invoker/i.test(sql), 'Place match authority must remain SECURITY INVOKER.');
need(!/security definer/i.test(sql), 'Place match authority must not bypass RLS through SECURITY DEFINER.');
need(/grant execute[\s\S]*to service_role/i.test(sql), 'Place match authority must be service-role only.');
need(/revoke all[\s\S]*from public,anon,authenticated/i.test(sql), 'Place match authority must be denied to public clients.');


const capabilityMigrationName=fs.readdirSync('supabase/migrations').find(name=>name.includes('platform_place_match_capability_catalog'));
need(Boolean(capabilityMigrationName), 'Place Match must be registered in the governed capability catalog.');
const capabilitySql=file(`supabase/migrations/${capabilityMigrationName}`);
for (const token of [
  "'platform_place_match'",
  "'Place Match / Place Intelligence'",
  "'platform_match_places'",
  "offer_key='developer_platform'",
  "array_append(required_domains,'platform_place_match')",
  "'{sample_capabilities}'",
  '"place_match"'
]) need(capabilitySql.includes(token), `Place Match capability governance missing token: ${token}`);

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
